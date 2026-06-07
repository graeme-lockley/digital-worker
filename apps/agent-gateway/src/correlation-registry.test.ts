import { describe, expect, it } from "vitest";

import {
  buildCorrelationId,
  CorrelationRegistry,
} from "./correlation-registry.js";

describe("CorrelationRegistry", () => {
  it("registers and resolves entries", () => {
    const registry = new CorrelationRegistry();
    registry.register("telegram:123", {
      channel: "telegram",
      threadId: "123",
      sender: "graeme",
    });

    expect(registry.resolve("telegram:123")).toEqual({
      channel: "telegram",
      threadId: "123",
      sender: "graeme",
    });
    expect(registry.resolve("telegram:999")).toBeUndefined();
  });

  it("exports and restores persisted state", () => {
    const registry = new CorrelationRegistry();
    registry.register("telegram:1", {
      channel: "telegram",
      threadId: "1",
      sender: "a",
    });

    const exported = registry.exportAll();
    const restored = new CorrelationRegistry();
    restored.restore(exported);

    expect(restored.resolve("telegram:1")).toEqual({
      channel: "telegram",
      threadId: "1",
      sender: "a",
    });
  });
});

describe("buildCorrelationId", () => {
  it("combines channel and thread id", () => {
    expect(buildCorrelationId("telegram", "8672094762")).toBe(
      "telegram:8672094762",
    );
  });

  it("includes bot id when provided", () => {
    expect(buildCorrelationId("telegram", "8672094762", "aidadigitalbot")).toBe(
      "telegram:aidadigitalbot:8672094762",
    );
  });
});
