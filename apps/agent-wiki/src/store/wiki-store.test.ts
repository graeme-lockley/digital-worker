import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { WikiStore, WikiStoreError } from "./wiki-store.js";

describe("WikiStore", () => {
  it("creates and reads pages by slug", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dw-wiki-store-"));
    try {
      const store = new WikiStore(dir);
      await store.ensureDirs();

      const page = await store.putPage("Usage", {
        title: "Usage",
        body: "# Usage\n\nShared knowledge guide.",
        updatedBy: "operator",
      });

      expect(page.slug).toBe("Usage");
      expect(page.revision).toBe(1);

      const loaded = await store.getPage("Usage");
      expect(loaded?.title).toBe("Usage");
      expect(loaded?.body).toContain("Shared knowledge guide.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects revision conflicts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dw-wiki-conflict-"));
    try {
      const store = new WikiStore(dir);
      await store.ensureDirs();
      await store.putPage("Usage", {
        body: "v1",
        updatedBy: "Aida",
      });

      await expect(
        store.putPage("Usage", {
          body: "v2",
          updatedBy: "Riaan",
          ifRevision: 0,
        }),
      ).rejects.toBeInstanceOf(WikiStoreError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("deletes an existing page", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dw-wiki-delete-"));
    try {
      const store = new WikiStore(dir);
      await store.ensureDirs();
      await store.putPage("Usage", {
        body: "temporary",
        updatedBy: "Aida",
      });

      await store.deletePage("Usage", { deletedBy: "operator", ifRevision: 1 });
      const loaded = await store.getPage("Usage");
      expect(loaded).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports nested slugs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dw-wiki-nested-"));
    try {
      const store = new WikiStore(dir);
      await store.ensureDirs();
      await store.putPage("people/graeme", {
        title: "Graeme Lockley",
        body: "## Overview\n\nOperator.",
        updatedBy: "operator",
      });

      const page = await store.getPage("people/graeme");
      expect(page?.title).toBe("Graeme Lockley");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
