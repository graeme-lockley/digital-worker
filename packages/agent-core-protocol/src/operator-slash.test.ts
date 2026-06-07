import { describe, expect, it } from "vitest";

import { AGENT_COMMAND } from "./command.js";
import {
  formatCommandResponse,
  formatStatusResult,
  parseOperatorSlash,
} from "./operator-slash.js";

describe("parseOperatorSlash", () => {
  it("maps simple slash commands", () => {
    expect(parseOperatorSlash("/status")).toEqual({ command: "status" });
    expect(parseOperatorSlash("/abandon")).toEqual({ command: "abandon" });
    expect(parseOperatorSlash("/shutdown")).toEqual({ command: "shutdown" });
    expect(parseOperatorSlash("/restart")).toEqual({ command: "restart" });
    expect(parseOperatorSlash("/compact")).toEqual({ command: "compact" });
    expect(parseOperatorSlash("hello")).toBeUndefined();
    expect(parseOperatorSlash("/unknown")).toBeUndefined();
  });

  it("parses model commands", () => {
    expect(parseOperatorSlash("/model")).toEqual({
      command: AGENT_COMMAND.LIST_MODELS,
    });
    expect(parseOperatorSlash("/models")).toEqual({
      command: AGENT_COMMAND.LIST_MODELS,
    });
    expect(parseOperatorSlash("/model anthropic/claude-sonnet-4-20250514")).toEqual({
      command: AGENT_COMMAND.SET_MODEL,
      model: "anthropic/claude-sonnet-4-20250514",
    });
  });

  it("parses maintain_memory with optional scope", () => {
    expect(parseOperatorSlash("/maintain_memory")).toEqual({
      command: AGENT_COMMAND.MAINTAIN_MEMORY,
    });
    expect(parseOperatorSlash("/maintain-memory reindex")).toEqual({
      command: AGENT_COMMAND.MAINTAIN_MEMORY,
      scope: "reindex",
    });
    expect(parseOperatorSlash("/maintain_memory invalid")).toBeUndefined();
  });

  it("rejects commands with extra arguments", () => {
    expect(parseOperatorSlash("/status extra")).toBeUndefined();
    expect(parseOperatorSlash("/compact now")).toBeUndefined();
  });
});

describe("formatStatusResult", () => {
  it("includes context window usage", () => {
    const text = formatStatusResult({
      sessionId: "s1-0000-0000-0000-000000000000",
      queueDepth: 0,
      queuedCount: 0,
      active: null,
      uptimeMs: 45_000,
      contextTokens: 12_345,
      contextWindowMax: 128_000,
      recentCompactions: [
        {
          timestamp: "2025-06-07T10:00:00.000Z",
          tokensBefore: 50_000,
          tokensAfter: 18_000,
          reason: "manual",
        },
      ],
    });

    expect(text).toContain("**Context:** 12,345 / 128,000 tokens (9.6%)");
    expect(text).toContain("**Recent compactions**");
    expect(text).toContain("50,000 → 18,000 tokens");
  });
});

describe("formatCommandResponse", () => {
  it("formats compact results", () => {
    const text = formatCommandResponse({
      compacted: true,
      tokensBefore: 50_000,
      tokensAfter: 20_000,
      reason: "manual",
      summary: "summary",
    });

    expect(text).toContain("Context compacted.");
    expect(text).toContain("Original context size: 50,000 tokens");
    expect(text).toContain("Post-compaction context size: 20,000 tokens");
    expect(text).toContain("Saved: 30,000 tokens");
  });
});
