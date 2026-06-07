import { describe, expect, it } from "vitest";

import {
  drainStreamingDelta,
  flushStreamingBuffer,
  LIVE_TAIL_MAX_CHARS,
} from "./streaming-transcript.js";

describe("drainStreamingDelta", () => {
  it("keeps an incomplete line in the tail buffer", () => {
    const result = drainStreamingDelta("", "Hello");
    expect(result).toEqual({ buffer: "Hello", committed: [] });
  });

  it("commits completed lines on newline", () => {
    const result = drainStreamingDelta("partial", " line\nnext");
    expect(result).toEqual({
      buffer: "next",
      committed: ["partial line"],
    });
  });

  it("flushes long tails without newlines", () => {
    const chunk = "a".repeat(LIVE_TAIL_MAX_CHARS + 20);
    const result = drainStreamingDelta("", chunk);
    expect(result.committed.join("")).toHaveLength(LIVE_TAIL_MAX_CHARS);
    expect(result.buffer).toHaveLength(20);
  });

  it("prefers word boundaries when flushing long tails", () => {
    const prefix = `${"word ".repeat(30)}`;
    const result = drainStreamingDelta("", `${prefix}tail`);
    expect(result.committed.length).toBeGreaterThan(0);
    expect(result.committed[0]?.endsWith(" ")).toBe(false);
  });
});

describe("flushStreamingBuffer", () => {
  it("returns empty when there is only whitespace", () => {
    expect(flushStreamingBuffer("   \n")).toEqual({
      buffer: "",
      committed: [],
    });
  });

  it("commits remaining text", () => {
    expect(flushStreamingBuffer("still streaming")).toEqual({
      buffer: "",
      committed: ["still streaming"],
    });
  });
});
