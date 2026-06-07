import { describe, expect, it } from "vitest";

import {
  isMissedFirePolicy,
  isScheduledEventStatus,
  isScheduledRunStatus,
  SCHEDULER_PATHS,
} from "./index.js";

describe("SCHEDULER_PATHS", () => {
  it("defines stable scheduler API paths", () => {
    expect(SCHEDULER_PATHS.health).toBe("/health");
    expect(SCHEDULER_PATHS.events).toBe("/api/v1/events");
    expect(SCHEDULER_PATHS.runs).toBe("/api/v1/runs");
    expect(SCHEDULER_PATHS.agents).toBe("/api/v1/agents");
  });
});

describe("type guards", () => {
  it("validates event and run statuses", () => {
    expect(isScheduledEventStatus("active")).toBe(true);
    expect(isScheduledEventStatus("unknown")).toBe(false);
    expect(isScheduledRunStatus("running")).toBe(true);
    expect(isScheduledRunStatus("pending")).toBe(false);
    expect(isMissedFirePolicy("fire-once")).toBe(true);
    expect(isMissedFirePolicy("queue")).toBe(false);
  });
});
