import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { MemoryStore } from "./memory-store.js";
import type { MemoryPaths } from "./paths.js";

const SCHEMA_VERSION = 1;

export type MemorySearchHit = {
  filePath: string;
  date: string;
  section: string;
  content: string;
  score: number;
};

export class MemoryIndex {
  private db: DatabaseSync;

  constructor(private readonly paths: MemoryPaths) {
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
    `);
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    if (!row || Number(row.value) !== SCHEMA_VERSION) {
      this.db.exec("DELETE FROM memory_fts");
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
    const files = await store.listAllMarkdownFiles();
    let count = 0;
    for (const filePath of files) {
      count += await this.upsertFile(filePath);
    }
    return count;
  }

  async upsertFile(filePath: string): Promise<number> {
    const relative = path.relative(this.paths.memoryDir, filePath);
    this.db
      .prepare("DELETE FROM memory_fts WHERE file_path = ?")
      .run(relative);

    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      return 0;
    }

    const chunks = chunkMarkdown(content, relative);
    const insert = this.db.prepare(
      "INSERT INTO memory_fts (file_path, date, section, content) VALUES (?, ?, ?, ?)",
    );
    let count = 0;
    for (const chunk of chunks) {
      insert.run(chunk.filePath, chunk.date, chunk.section, chunk.content);
      count += 1;
    }
    return count;
  }

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
        `SELECT file_path, date, section, content, bm25(memory_fts) AS score
         FROM memory_fts
         WHERE memory_fts MATCH ?
         ORDER BY score
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{
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
