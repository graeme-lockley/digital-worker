import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WIKI_PATHS } from "@digital-worker/agent-wiki-protocol";
import { describe, expect, it } from "vitest";

import { createApp } from "./server.js";
import { WikiIndex } from "./store/wiki-index.js";
import { WikiStore } from "./store/wiki-store.js";

describe("wiki API", () => {
  it("lists, reads, writes, and searches pages", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dw-wiki-api-"));
    try {
      const store = new WikiStore(dir);
      await store.ensureDirs();
      const index = new WikiIndex(store.paths.indexDbPath);
      const app = createApp({ store, index });

      const putResponse = await app.request(`${WIKI_PATHS.pages}/Usage`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Usage",
          body: "## Purpose\n\nOperator guide to the wiki.",
          updatedBy: "operator",
        }),
      });
      expect(putResponse.status).toBe(200);

      const getResponse = await app.request(`${WIKI_PATHS.pages}/Usage`);
      expect(getResponse.status).toBe(200);
      const getBody = (await getResponse.json()) as {
        page: { title: string; revision: number };
      };
      expect(getBody.page.title).toBe("Usage");

      const listResponse = await app.request(WIKI_PATHS.pages);
      expect(listResponse.status).toBe(200);
      const listBody = (await listResponse.json()) as {
        pages: Array<{ slug: string }>;
      };
      expect(listBody.pages.some((page) => page.slug === "Usage")).toBe(true);

      const searchResponse = await app.request(
        `${WIKI_PATHS.search}?q=operator`,
      );
      expect(searchResponse.status).toBe(200);
      const searchBody = (await searchResponse.json()) as {
        hits: Array<{ slug: string }>;
      };
      expect(searchBody.hits.length).toBeGreaterThan(0);

      const deleteResponse = await app.request(`${WIKI_PATHS.pages}/Usage`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deletedBy: "operator", ifRevision: 1 }),
      });
      expect(deleteResponse.status).toBe(200);
      const deleted = (await deleteResponse.json()) as { slug: string; deleted: boolean };
      expect(deleted.slug).toBe("Usage");
      expect(deleted.deleted).toBe(true);

      const missing = await app.request(`${WIKI_PATHS.pages}/Usage`);
      expect(missing.status).toBe(404);

      index.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
