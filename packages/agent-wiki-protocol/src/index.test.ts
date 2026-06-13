import { describe, expect, it } from "vitest";

import { WIKI_ERROR_CODES, WIKI_PATHS } from "./index.js";

describe("agent-wiki-protocol", () => {
  it("exposes stable API paths", () => {
    expect(WIKI_PATHS.health).toBe("/health");
    expect(WIKI_PATHS.pages).toBe("/api/v1/pages");
    expect(WIKI_PATHS.search).toBe("/api/v1/search");
    expect(WIKI_PATHS.reindex).toBe("/api/v1/reindex");
  });

  it("exposes error codes", () => {
    expect(WIKI_ERROR_CODES.CONFLICT).toBe("CONFLICT");
    expect(WIKI_ERROR_CODES.NOT_FOUND).toBe("NOT_FOUND");
  });
});
