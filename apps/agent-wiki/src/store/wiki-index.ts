import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { WikiSearchHit } from "@digital-worker/agent-wiki-protocol";

import type { WikiStore } from "./wiki-store.js";
import { relativePathToSlug } from "./slug.js";

const SCHEMA_VERSION = 1;

type MarkdownChunk = {
  slug: string;
  section: string;
  content: string;
};

export class WikiIndex {
  private db: DatabaseSync;

  constructor(private readonly indexDbPath: string) {
    mkdirSync(path.dirname(indexDbPath), { recursive: true });
    this.db = new DatabaseSync(indexDbPath);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
        slug,
        section,
        content,
        tokenize = 'porter unicode61'
      );
      CREATE TABLE IF NOT EXISTS wiki_chunks (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL,
        section TEXT NOT NULL,
        content TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wiki_chunks_slug ON wiki_chunks (slug);
    `);

    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    if (!row || Number(row.value) !== SCHEMA_VERSION) {
      this.db.exec("DELETE FROM wiki_fts");
      this.db.exec("DELETE FROM wiki_chunks");
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

  async reindex(store: WikiStore): Promise<number> {
    this.db.exec("DELETE FROM wiki_fts");
    this.db.exec("DELETE FROM wiki_chunks");
    const files = await store.listAllMarkdownFiles();
    let count = 0;
    for (const filePath of files) {
      count += await this.upsertFile(store, filePath);
    }
    return count;
  }

  async upsertFile(store: WikiStore, filePath: string): Promise<number> {
    const relative = path.relative(store.paths.pagesDir, filePath);
    const slug = relativePathToSlug(relative);
    if (!slug) {
      return 0;
    }

    this.db.prepare("DELETE FROM wiki_fts WHERE slug = ?").run(slug);
    this.db.prepare("DELETE FROM wiki_chunks WHERE slug = ?").run(slug);

    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      return 0;
    }

    const chunks = chunkMarkdown(content, slug);
    if (chunks.length === 0) {
      return 0;
    }

    const insertChunk = this.db.prepare(
      "INSERT INTO wiki_chunks (slug, section, content) VALUES (?, ?, ?)",
    );
    const insertFts = this.db.prepare(
      "INSERT INTO wiki_fts (rowid, slug, section, content) VALUES (?, ?, ?, ?)",
    );

    for (const chunk of chunks) {
      const result = insertChunk.run(chunk.slug, chunk.section, chunk.content);
      const rowId = Number(result.lastInsertRowid);
      insertFts.run(rowId, chunk.slug, chunk.section, chunk.content);
    }

    return chunks.length;
  }

  async upsertSlug(store: WikiStore, slug: string): Promise<number> {
    const filePath = path.join(store.paths.pagesDir, `${slug}.md`);
    return this.upsertFile(store, filePath);
  }

  removeSlug(slug: string): void {
    this.db.prepare("DELETE FROM wiki_fts WHERE slug = ?").run(slug);
    this.db.prepare("DELETE FROM wiki_chunks WHERE slug = ?").run(slug);
  }

  search(query: string, limit = 10): WikiSearchHit[] {
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
        `SELECT slug, section, content, bm25(wiki_fts) AS score
         FROM wiki_fts
         WHERE wiki_fts MATCH ?
         ORDER BY score
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{
      slug: string;
      section: string;
      content: string;
      score: number;
    }>;

    return rows.map((row) => ({
      slug: row.slug,
      section: row.section,
      content: row.content,
      score: row.score,
    }));
  }
}

function chunkMarkdown(content: string, slug: string): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = [];
  const lines = content.split("\n");
  let currentSection = "General";
  let buffer: string[] = [];
  let inFrontMatter = false;
  let frontMatterDone = false;

  const flush = (): void => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) {
      chunks.push({
        slug,
        section: currentSection,
        content: text,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (!frontMatterDone) {
      if (line.trim() === "---") {
        if (!inFrontMatter) {
          inFrontMatter = true;
          continue;
        }
        frontMatterDone = true;
        continue;
      }
      if (inFrontMatter) {
        continue;
      }
    }

    if (line.startsWith("## ")) {
      flush();
      currentSection = line.slice(3).trim();
    } else if (line.startsWith("# ")) {
      // skip document title
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}
