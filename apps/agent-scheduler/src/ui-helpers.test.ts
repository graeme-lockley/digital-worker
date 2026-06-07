import { describe, expect, it } from "vitest";

import {
  buildRunsQuery,
  excerpt,
  formatDuration,
  parseViewHash,
  shouldAutoRefresh,
} from "./ui-helpers.js";

describe("ui-helpers", () => {
  it("builds runs query string", () => {
    expect(buildRunsQuery({ agentId: "a1", limit: 20, offset: 5 })).toBe(
      "?agentId=a1&limit=20&offset=5",
    );
    expect(buildRunsQuery({})).toBe("");
  });

  it("formats duration and excerpts", () => {
    expect(formatDuration(1000, 4000)).toBe("3s");
    expect(excerpt("hello world", 5)).toBe("hello…");
  });

  it("parses hash routes", () => {
    expect(parseViewHash("#runs")).toEqual({ view: "runs" });
    expect(parseViewHash("#run/abc")).toEqual({ view: "run-detail", id: "abc" });
  });

  it("detects running auto-refresh", () => {
    expect(shouldAutoRefresh([{ status: "running" }])).toBe(true);
    expect(shouldAutoRefresh([{ status: "succeeded" }])).toBe(false);
  });
});
