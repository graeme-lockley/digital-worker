import { describe, expect, it } from "vitest";

import {
  formatTurnTimeContext,
  isValidTimeZone,
  prefixPromptWithTurnContext,
  resolveAgentTimeZone,
} from "./turn-context.js";

describe("turn-context", () => {
  it("validates IANA timezones", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Not/A_Timezone")).toBe(false);
  });

  it("formats minute-precision context with date and timezone", () => {
    const now = new Date("2026-06-13T12:34:56.789Z");
    expect(formatTurnTimeContext("UTC", now)).toBe(
      "[Context: 2026-06-13 12:34 UTC (Saturday), timezone UTC]",
    );
    expect(formatTurnTimeContext("America/New_York", now)).toBe(
      "[Context: 2026-06-13 08:34 EDT (Saturday), timezone America/New_York]",
    );
  });

  it("prefixes prompts without altering the original body", () => {
    const now = new Date("2026-06-13T12:34:56.789Z");
    expect(prefixPromptWithTurnContext("hello", "UTC", now)).toBe(
      "[Context: 2026-06-13 12:34 UTC (Saturday), timezone UTC]\n\nhello",
    );
  });

  it("resolveAgentTimeZone prefers explicit override", () => {
    expect(resolveAgentTimeZone("Pacific/Auckland")).toBe("Pacific/Auckland");
  });

  it("resolveAgentTimeZone rejects invalid explicit values", () => {
    expect(() => resolveAgentTimeZone("Bad/Zone")).toThrow(/invalid timezone/i);
  });
});
