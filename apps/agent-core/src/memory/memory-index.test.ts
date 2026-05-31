import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MemoryIndex } from "./memory-index.js";
import { MemoryStore } from "./memory-store.js";

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
});
