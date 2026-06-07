import { describe, expect, it } from "vitest";

import {
  buildRunsQuery,
  excerpt,
  formatDuration,
  parseViewHash,
  shouldAutoRefresh,
} from "./ui-helpers.js";
import {
  buildEventsQuery,
  DEFAULT_SCHEDULE_SORT,
  nextScheduleSort,
  sortScheduleEvents,
} from "../public/ui-helpers.js";

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

describe("schedule table helpers", () => {
  const sampleEvents = [
    {
      id: "b",
      agentId: "zeta",
      status: "active",
      cron: "0 9 * * *",
      timezone: "UTC",
      fireAt: 2000,
      model: "model-b",
      prompt: "beta",
    },
    {
      id: "a",
      agentId: "alpha",
      status: "completed",
      fireAt: 1000,
      model: "model-a",
      prompt: "alpha task",
    },
  ];

  it("builds events query with agent and status filters", () => {
    expect(buildEventsQuery({ agentId: "a1", status: "active" })).toBe(
      "?agentId=a1&status=active",
    );
    expect(buildEventsQuery({ status: "active" })).toBe("?status=active");
    expect(buildEventsQuery({})).toBe("");
  });

  it("defaults sort to next fire ascending", () => {
    expect(DEFAULT_SCHEDULE_SORT).toEqual({ column: "fireAt", direction: "asc" });
    const sorted = sortScheduleEvents(sampleEvents, DEFAULT_SCHEDULE_SORT);
    expect(sorted.map((event) => event.id)).toEqual(["a", "b"]);
  });

  it("sorts by column and toggles direction", () => {
    const byAgent = sortScheduleEvents(sampleEvents, {
      column: "agent",
      direction: "asc",
    });
    expect(byAgent.map((event) => event.agentId)).toEqual(["alpha", "zeta"]);

    expect(nextScheduleSort({ column: "fireAt", direction: "asc" }, "fireAt")).toEqual({
      column: "fireAt",
      direction: "desc",
    });
    expect(nextScheduleSort({ column: "fireAt", direction: "asc" }, "agent")).toEqual({
      column: "agent",
      direction: "asc",
    });
  });
});
