import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  cosineSimilarity,
  deserializeVector,
  serializeVector,
  type Embedder,
} from "./embeddings.js";
import type { MemoryStore } from "./memory-store.js";
import type { MemoryPaths } from "./paths.js";

const SCHEMA_VERSION = 2;

/** Candidate pool size per retrieval arm before fusion. */
const CANDIDATE_POOL = 30;
/** Reciprocal Rank Fusion constant (standard default). */
const RRF_K = 60;

export type MemorySearchHit = {
  filePath: string;
  date: string;
  section: string;
  content: string;
  score: number;
};

type ChunkRow = {
  id: number;
  file_path: string;
  date: string;
  section: string;
  content: string;
  embedding: Uint8Array | null;
  dim: number | null;
};

export class MemoryIndex {
  private db: DatabaseSync;

  constructor(
    private readonly paths: MemoryPaths,
    private readonly embedder?: Embedder,
  ) {
    mkdirSync(paths.memoryDir, { recursive: true });
    this.db = new DatabaseSync(paths.indexDbPath);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        file_path,
        date,
        section,
        content,
        tokenize = 'porter unicode61'
      );
      CREATE TABLE IF NOT EXISTS memory_chunks (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        date TEXT NOT NULL,
        section TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        dim INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_memory_chunks_file
        ON memory_chunks (file_path);
    `);
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    if (!row || Number(row.value) !== SCHEMA_VERSION) {
      this.db.exec("DELETE FROM memory_fts");
      this.db.exec("DELETE FROM memory_chunks");
      this.db
        .prepare(
          "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        )
        .run(String(SCHEMA_VERSION));
    }
  }

  close(): void {
    this.db.close();
  }

  async reindex(store: MemoryStore): Promise<number> {
    this.db.exec("DELETE FROM memory_fts");
    this.db.exec("DELETE FROM memory_chunks");
    const files = await store.listAllMarkdownFiles();
    let count = 0;
    for (const filePath of files) {
      count += await this.upsertFile(filePath);
    }
    return count;
  }

  async upsertFile(filePath: string): Promise<number> {
    const relative = path.relative(this.paths.memoryDir, filePath);
    this.db.prepare("DELETE FROM memory_fts WHERE file_path = ?").run(relative);
    this.db
      .prepare("DELETE FROM memory_chunks WHERE file_path = ?")
      .run(relative);

    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      return 0;
    }

    const chunks = chunkMarkdown(content, relative);
    if (chunks.length === 0) {
      return 0;
    }

    const insertChunk = this.db.prepare(
      "INSERT INTO memory_chunks (file_path, date, section, content) VALUES (?, ?, ?, ?)",
    );
    const insertFts = this.db.prepare(
      "INSERT INTO memory_fts (rowid, file_path, date, section, content) VALUES (?, ?, ?, ?, ?)",
    );

    const items: Array<{ id: number; text: string }> = [];
    for (const chunk of chunks) {
      const result = insertChunk.run(
        chunk.filePath,
        chunk.date,
        chunk.section,
        chunk.content,
      );
      const rowId = Number(result.lastInsertRowid);
      // Keep the FTS rowid aligned with memory_chunks.id so retrieval arms fuse.
      insertFts.run(
        rowId,
        chunk.filePath,
        chunk.date,
        chunk.section,
        chunk.content,
      );
      items.push({ id: rowId, text: chunk.content });
    }

    await this.embedChunks(items);

    return chunks.length;
  }

  /** Best-effort: embed and persist vectors. Silently skips if unavailable. */
  private async embedChunks(
    items: Array<{ id: number; text: string }>,
  ): Promise<void> {
    if (!this.embedder || items.length === 0) {
      return;
    }
    let vectors: Float32Array[] | undefined;
    try {
      vectors = await this.embedder.embed(items.map((it) => it.text));
    } catch {
      vectors = undefined;
    }
    if (!vectors || vectors.length !== items.length) {
      return;
    }
    const update = this.db.prepare(
      "UPDATE memory_chunks SET embedding = ?, dim = ? WHERE id = ?",
    );
    for (let i = 0; i < items.length; i += 1) {
      const vector = vectors[i];
      const item = items[i];
      if (!vector || !item) {
        continue;
      }
      update.run(serializeVector(vector), vector.length, item.id);
    }
  }

  /** Synchronous full-text (BM25) search. Always available. */
  search(query: string, limit = 10): MemorySearchHit[] {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const ftsQuery = trimmed
      .split(/\s+/)
      .map((term) => `"${term.replace(/"/g, '""')}"`)
      .join(" ");

    const rows = this.db
      .prepare(
        `SELECT rowid, file_path, date, section, content, bm25(memory_fts) AS score
         FROM memory_fts
         WHERE memory_fts MATCH ?
         ORDER BY score
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{
      rowid: number;
      file_path: string;
      date: string;
      section: string;
      content: string;
      score: number;
    }>;

    return rows.map((row) => ({
      filePath: row.file_path,
      date: row.date,
      section: row.section,
      content: row.content,
      score: row.score,
    }));
  }

  /**
   * Hybrid recall: fuse BM25 (lexical) and embedding (semantic) candidates via
   * Reciprocal Rank Fusion. Falls back to pure FTS when embeddings are
   * unavailable, so behaviour degrades gracefully.
   */
  async searchHybrid(query: string, limit = 10): Promise<MemorySearchHit[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const ftsRanked = this.ftsRowIds(trimmed, CANDIDATE_POOL);
    const vecRanked = await this.vectorRowIds(trimmed, CANDIDATE_POOL);

    if (vecRanked.length === 0) {
      return this.search(query, limit);
    }

    const scores = new Map<number, number>();
    const accumulate = (ranked: number[]): void => {
      ranked.forEach((id, rank) => {
        scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1));
      });
    };
    accumulate(ftsRanked);
    accumulate(vecRanked);

    const ordered = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return ordered
      .map(([id, score]) => {
        const row = this.chunkById(id);
        if (!row) {
          return undefined;
        }
        return {
          filePath: row.file_path,
          date: row.date,
          section: row.section,
          content: row.content,
          score,
        } satisfies MemorySearchHit;
      })
      .filter((hit): hit is MemorySearchHit => hit !== undefined);
  }

  private ftsRowIds(query: string, limit: number): number[] {
    const ftsQuery = query
      .split(/\s+/)
      .map((term) => `"${term.replace(/"/g, '""')}"`)
      .join(" ");
    try {
      const rows = this.db
        .prepare(
          `SELECT rowid FROM memory_fts
           WHERE memory_fts MATCH ?
           ORDER BY bm25(memory_fts)
           LIMIT ?`,
        )
        .all(ftsQuery, limit) as Array<{ rowid: number }>;
      return rows.map((r) => r.rowid);
    } catch {
      return [];
    }
  }

  private async vectorRowIds(query: string, limit: number): Promise<number[]> {
    if (!this.embedder) {
      return [];
    }
    let queryVectors: Float32Array[] | undefined;
    try {
      queryVectors = await this.embedder.embed([query]);
    } catch {
      queryVectors = undefined;
    }
    const queryVector = queryVectors?.[0];
    if (!queryVector) {
      return [];
    }

    const rows = this.db
      .prepare(
        "SELECT id, embedding, dim FROM memory_chunks WHERE embedding IS NOT NULL",
      )
      .all() as Array<Pick<ChunkRow, "id" | "embedding" | "dim">>;

    const scored: Array<{ id: number; score: number }> = [];
    for (const row of rows) {
      if (!row.embedding || row.dim !== queryVector.length) {
        continue;
      }
      const vector = deserializeVector(row.embedding);
      scored.push({ id: row.id, score: cosineSimilarity(queryVector, vector) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.id);
  }

  private chunkById(id: number): ChunkRow | undefined {
    return this.db
      .prepare(
        "SELECT id, file_path, date, section, content, embedding, dim FROM memory_chunks WHERE id = ?",
      )
      .get(id) as ChunkRow | undefined;
  }
}

type MarkdownChunk = {
  filePath: string;
  date: string;
  section: string;
  content: string;
};

function chunkMarkdown(content: string, filePath: string): MarkdownChunk[] {
  const date = extractDateFromPath(filePath);
  const chunks: MarkdownChunk[] = [];
  const lines = content.split("\n");
  let currentSection = "General";
  let buffer: string[] = [];

  const flush = (): void => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) {
      chunks.push({
        filePath,
        date,
        section: currentSection,
        content: text,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentSection = line.slice(3).trim();
    } else if (line.startsWith("# ")) {
      // skip title line
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

function extractDateFromPath(filePath: string): string {
  const base = path.basename(filePath, ".md");
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    return base;
  }
  if (/^\d{4}-W\d{2}$/.test(base)) {
    return base;
  }
  if (/^\d{4}-\d{2}$/.test(base)) {
    return base;
  }
  if (base === "MEMORY") {
    return "curated";
  }
  return "";
}
