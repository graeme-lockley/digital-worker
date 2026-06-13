import { describe, expect, it } from "vitest";
import {
  estimateContextTokens,
  type AgentMessage,
} from "@earendil-works/pi-agent-core";

import { estimateContextContentTokens } from "./context-tokens.js";

describe("estimateContextContentTokens", () => {
  it("measures transcript content instead of stale assistant usage", () => {
    const summary = {
      role: "compactionSummary" as const,
      summary: "Short summary of earlier work.",
      tokensBefore: 44_105,
      timestamp: Date.now(),
    };
    const recentUser = {
      role: "user" as const,
      content: [{ type: "text" as const, text: "hello" }],
      timestamp: Date.now(),
    };
    const staleAssistant = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "recent reply" }],
      timestamp: Date.now(),
      api: "test",
      provider: "test",
      model: "test",
      usage: {
        input: 40_000,
        output: 4_000,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 44_000,
        cost: 0,
      },
      stopReason: "stop" as const,
    };

    const messages = [summary, recentUser, staleAssistant] as AgentMessage[];

    expect(estimateContextTokens(messages).tokens).toBeGreaterThan(40_000);
    expect(estimateContextContentTokens(messages)).toBeLessThan(1_000);
  });
});
