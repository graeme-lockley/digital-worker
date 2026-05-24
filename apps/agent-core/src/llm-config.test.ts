import { describe, expect, it } from "vitest";

import {
  fauxAssistantMessage,
  fauxText,
  registerFauxProvider,
} from "@earendil-works/pi-ai";

import { parseModelArg, resolveLlmOptions } from "./llm-config.js";

describe("llm-config", () => {
  it("parses provider/model shorthand", () => {
    expect(parseModelArg("openai/gpt-4o-mini")).toEqual({
      provider: "openai",
      modelId: "gpt-4o-mini",
    });
  });

  it("resolves deepseek provider model", () => {
    const llm = resolveLlmOptions("deepseek", "deepseek-v4-flash");
    expect(llm.provider).toBe("deepseek");
    expect(llm.modelId).toBe("deepseek-v4-flash");
  });

  it("queues multiple faux responses", () => {
    const registration = registerFauxProvider();
    registration.setResponses([
      fauxAssistantMessage([fauxText("one")]),
      fauxAssistantMessage([fauxText("two")]),
    ]);
    expect(registration.getPendingResponseCount()).toBe(2);
    registration.unregister();
  });
});
