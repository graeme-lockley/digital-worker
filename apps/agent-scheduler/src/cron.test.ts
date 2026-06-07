import { describe, expect, it } from "vitest";

import {
  computeInitialFireAt,
  computeNextFireAt,
  InvalidCronError,
  validateCron,
} from "./cron.js";

describe("validateCron", () => {
  it("accepts standard 5-field cron", () => {
    expect(() => validateCron("0 9 * * 1-5")).not.toThrow();
    expect(() => validateCron("*/6 * * * *")).not.toThrow();
  });

  it("rejects 6-field cron", () => {
    expect(() => validateCron("0 */1 * * * *")).toThrow(InvalidCronError);
  });
});

describe("computeNextFireAt", () => {
  it("computes weekday morning schedule in UTC", () => {
    const after = Date.parse("2026-06-02T08:00:00.000Z");
    const next = computeNextFireAt("0 9 * * 1-5", "UTC", after);
    expect(new Date(next).getUTCHours()).toBe(9);
  });

  it("computes every-six-minutes pattern", () => {
    const after = Date.parse("2026-06-02T10:03:00.000Z");
    const next = computeNextFireAt("*/6 * * * *", "UTC", after);
    expect(next).toBeGreaterThan(after);
    expect(new Date(next).getUTCMinutes() % 6).toBe(0);
  });

  it("respects timezone for initial fire", () => {
    const next = computeInitialFireAt("0 9 * * *", "America/New_York");
    expect(next).toBeGreaterThan(Date.now() - 1000);
  });
});
