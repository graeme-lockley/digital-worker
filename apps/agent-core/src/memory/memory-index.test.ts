import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Embedder } from "./embeddings.js";
import { MemoryIndex } from "./memory-index.js";
import { MemoryStore } from "./memory-store.js";

/**
 * Deterministic, network-free embedder. Maps text onto a tiny concept space so
 * semantically related-but-lexically-different text lands on the same axis.
 */
const CONCEPTS: Array<[number, RegExp]> = [
  [0, /rugby|blitzbok|sevens|svns|springbok/i],
  [1, /kruger|safari|park|wildlife/i],
  [2, /pnpm|monorepo|build|typescript/i],
  [3, /space|mankind|apollo|nasa/i],
];

const fakeEmbedder: Embedder = {
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((text) => {
      const v = new Float32Array(CONCEPTS.length);
      for (const [idx, pattern] of CONCEPTS) {
        if (pattern.test(text)) {
          v[idx] = 1;
        }
      }
      return v;
    });
  },
};

describe("MemoryIndex", () => {
  it("indexes and searches memory files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-idx-"));
    try {
      const store = new MemoryStore(dir);
      await store.ensureDirs();
      await store.writeMemoryMd("# Memory\n\n## Facts\n- Blitzbokke play in SVNS tournaments.");
      await store.appendDaily("Facts", "Operator monitors rugby sevens fixtures.");

      const index = new MemoryIndex(store.paths);
      const count = await index.reindex(store);
      expect(count).toBeGreaterThan(0);

      const hits = index.search("Blitzbokke");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.content.toLowerCase()).toContain("blitzbokke");

      index.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rebuilds from markdown when db missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-reidx-"));
    try {
      const store = new MemoryStore(dir);
      const dailyDir = store.paths.dailyDir;
      await mkdir(dailyDir, { recursive: true });
      await writeFile(
        path.join(dailyDir, "2026-05-30.md"),
        "# 2026-05-30\n\n## Facts\n- Previous session note about Kruger.",
        "utf-8",
      );

      const index = new MemoryIndex(store.paths);
      await index.reindex(store);
      const hits = index.search("Kruger");
      expect(hits.length).toBeGreaterThan(0);
      index.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("recalls semantically related notes that share no keywords", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-sem-"));
    try {
      const store = new MemoryStore(dir);
      await store.ensureDirs();
      await store.appendDaily("Facts", "Operator follows the Blitzbokke.");
      await store.appendDaily("Facts", "Daughter is visiting Kruger in July.");

      const index = new MemoryIndex(store.paths, fakeEmbedder);
      await index.reindex(store);

      // No lexical overlap with "Blitzbokke", so FTS alone finds nothing.
      expect(index.search("rugby sevens results")).toHaveLength(0);

      const hits = await index.searchHybrid("rugby sevens results");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.content.toLowerCase()).toContain("blitzbokke");

      index.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to full-text search when no embedder is configured", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-fb-"));
    try {
      const store = new MemoryStore(dir);
      await store.ensureDirs();
      await store.appendDaily("Facts", "Operator prefers pnpm workspaces.");

      const index = new MemoryIndex(store.paths);
      await index.reindex(store);

      const hits = await index.searchHybrid("pnpm");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.content.toLowerCase()).toContain("pnpm");

      index.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
