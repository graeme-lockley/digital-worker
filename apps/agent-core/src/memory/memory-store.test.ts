import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MemoryStore } from "./memory-store.js";
import { formatDate } from "./paths.js";

describe("MemoryStore", () => {
  it("appends to daily file with section headers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-store-"));
    try {
      const store = new MemoryStore(dir);
      await store.appendDaily("Facts", "Operator uses pnpm.");
      const content = await store.readDaily(formatDate());
      expect(content).toContain("## Facts");
      expect(content).toContain("Operator uses pnpm.");
      expect(content).toMatch(/\[\d{2}:\d{2}\]/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads and writes manifest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-manifest-"));
    try {
      const store = new MemoryStore(dir);
      await store.writeManifest({ turnCount: 5, lastFlushTurnCount: 2 });
      const manifest = await store.readManifest();
      expect(manifest.turnCount).toBe(5);
      expect(manifest.lastFlushTurnCount).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("merges into MEMORY.md", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-md-"));
    try {
      const store = new MemoryStore(dir);
      await store.writeMemoryMd("# Memory\n\nInitial fact.");
      await store.mergeMemoryMd("- New standing decision.");
      const content = await store.readMemoryMd();
      expect(content).toContain("Initial fact.");
      expect(content).toContain("New standing decision.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
