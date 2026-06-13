import { WIKI_PATHS } from "@digital-worker/agent-wiki-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  createWikiDeleteTool,
  createWikiListTool,
  createWikiReadTool,
  createWikiSearchTool,
  createWikiWriteTool,
} from "./wiki.js";

describe("wiki tools", () => {
  it("lists wiki pages", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        pages: [
          {
            slug: "Usage",
            title: "Usage",
            updatedBy: "operator",
            updatedAt: "2026-06-09T12:00:00.000Z",
            revision: 1,
          },
        ],
      }),
    );

    const tool = createWikiListTool({
      wikiUrl: "http://wiki:3004",
      agentName: "Aida",
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await tool.execute("call-1", {});
    expect(fetchFn).toHaveBeenCalledWith(new URL(WIKI_PATHS.pages, "http://wiki:3004"));
    expect(result.content[0]?.type).toBe("text");
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("Usage");
    }
  });

  it("reads a wiki page by slug", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        page: {
          slug: "people/graeme",
          title: "Graeme Lockley",
          body: "## Overview\n\nOperator.",
          updatedBy: "operator",
          updatedAt: "2026-06-09T12:00:00.000Z",
          revision: 1,
        },
      }),
    );

    const tool = createWikiReadTool({
      wikiUrl: "http://wiki:3004",
      agentName: "Aida",
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await tool.execute("call-2", { slug: "people/graeme" });
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("Graeme Lockley");
    }
  });

  it("searches wiki pages", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        hits: [
          {
            slug: "Usage",
            section: "Purpose",
            content: "Shared knowledge for digital workers.",
            score: -1,
          },
        ],
      }),
    );

    const tool = createWikiSearchTool({
      wikiUrl: "http://wiki:3004",
      agentName: "Aida",
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await tool.execute("call-3", { query: "shared knowledge" });
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("Usage");
    }
  });

  it("writes a wiki page", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        page: {
          slug: "Usage",
          title: "Usage",
          body: "updated",
          updatedBy: "Aida",
          updatedAt: "2026-06-09T13:00:00.000Z",
          revision: 2,
        },
      }),
    );

    const tool = createWikiWriteTool({
      wikiUrl: "http://wiki:3004",
      agentName: "Aida",
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await tool.execute("call-4", {
      slug: "Usage",
      body: "updated",
      ifRevision: 1,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(`${WIKI_PATHS.pages}/Usage`, "http://wiki:3004"),
      expect.objectContaining({ method: "PUT" }),
    );
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("rev 2");
    }
  });

  it("deletes a wiki page", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        slug: "draft/note",
        deleted: true,
      }),
    );

    const tool = createWikiDeleteTool({
      wikiUrl: "http://wiki:3004",
      agentName: "Aida",
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await tool.execute("call-5", {
      slug: "draft/note",
      ifRevision: 3,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(`${WIKI_PATHS.pages}/draft%2Fnote`, "http://wiki:3004"),
      expect.objectContaining({ method: "DELETE" }),
    );
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("draft/note");
    }
  });
});
