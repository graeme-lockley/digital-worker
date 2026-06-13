import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { WikiIndex } from "./wiki-index.js";
import { WikiStore } from "./wiki-store.js";

describe("WikiIndex", () => {
  it("indexes and searches wiki pages", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dw-wiki-index-"));
    try {
      const store = new WikiStore(dir);
      await store.ensureDirs();
      await store.putPage("Usage", {
        title: "Usage",
        body: "## Purpose\n\nShared knowledge for digital workers.",
        updatedBy: "operator",
      });

      const index = new WikiIndex(store.paths.indexDbPath);
      const count = await index.reindex(store);
      expect(count).toBeGreaterThan(0);

      const hits = index.search("digital workers");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.slug).toBe("Usage");

      index.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
