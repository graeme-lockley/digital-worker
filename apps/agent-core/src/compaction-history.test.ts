import { describe, expect, it, beforeEach } from "vitest";

import {
  compactionRecordsFromEntries,
  recordCompactionReasonForTests,
  resetCompactionHistoryForTests,
} from "./compaction-history.js";

describe("compactionRecordsFromEntries", () => {
  beforeEach(() => {
    resetCompactionHistoryForTests();
  });

  it("returns compaction token counts from session entries", () => {
    recordCompactionReasonForTests("c1", "manual");

    const records = compactionRecordsFromEntries([
      {
        type: "compaction",
        id: "c1",
        parentId: null,
        timestamp: "2025-06-07T10:00:00.000Z",
        summary: "Earlier conversation summary",
        firstKeptEntryId: "m2",
        tokensBefore: 50_000,
      },
      {
        type: "message",
        id: "m2",
        parentId: "c1",
        timestamp: "2025-06-07T10:01:00.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "hello" }],
          timestamp: Date.parse("2025-06-07T10:01:00.000Z"),
        },
      },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      timestamp: "2025-06-07T10:00:00.000Z",
      tokensBefore: 50_000,
      reason: "manual",
    });
    expect(records[0]?.tokensAfter).toBeGreaterThan(0);
    expect(records[0]?.tokensAfter).toBeLessThan(50_000);
  });

  it("returns the last N compactions", () => {
    const records = compactionRecordsFromEntries(
      Array.from({ length: 12 }, (_, index) => ({
        type: "compaction" as const,
        id: `c${index}`,
        parentId: index === 0 ? null : `c${index - 1}`,
        timestamp: `2025-06-07T10:${String(index).padStart(2, "0")}:00.000Z`,
        summary: `summary ${index}`,
        firstKeptEntryId: `m${index}`,
        tokensBefore: 10_000 + index,
      })),
      10,
    );

    expect(records).toHaveLength(10);
    expect(records[0]?.tokensBefore).toBe(10_002);
    expect(records[9]?.tokensBefore).toBe(10_011);
  });
});
