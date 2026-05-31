import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadBootstrapSection } from "./memory-manager.js";
import { MemoryStore } from "./memory-store.js";
import { formatDate, yesterdayDate } from "./paths.js";

describe("loadBootstrapSection", () => {
  it("includes MEMORY.md, today, and yesterday", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-boot-"));
    try {
      const store = new MemoryStore(dir);
      await store.writeMemoryMd("# Memory\n\nStanding convention.");
      await store.appendDaily("Facts", "Today note.", formatDate());
      await store.appendDaily("Facts", "Yesterday note.", yesterdayDate());

      const section = await loadBootstrapSection(store, 8000);
      expect(section).toContain("# Recent memory");
      expect(section).toContain("Standing convention.");
      expect(section).toContain("Today note.");
      expect(section).toContain("Yesterday note.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("truncates when over budget", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dw-mem-trunc-"));
    try {
      const store = new MemoryStore(dir);
      await store.writeMemoryMd(`# Memory\n\n${"x".repeat(5000)}`);

      const section = await loadBootstrapSection(store, 1000);
      expect(section.length).toBeLessThanOrEqual(1000);
      expect(section).toContain("[truncated]");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
