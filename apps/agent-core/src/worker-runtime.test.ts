import {
  fauxAssistantMessage,
  fauxText,
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import {
  CHAT_STREAM_EVENT,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";

import {
  createTestHarness,
  disposeTestHarness,
  TEST_SESSION_ID,
} from "./test-helpers.js";

async function collectEvents(
  harness: Awaited<ReturnType<typeof createTestHarness>>,
  prompt: string,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  await harness.runtime.enqueue({
    id: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    clientId: "client-1",
    prompt,
    sessionId: TEST_SESSION_ID,
    enqueueAt: Date.now(),
    emit: async (event) => {
      events.push(event);
    },
    signal: new AbortController().signal,
  });
  return events;
}

describe("WorkerRuntime", () => {
  it("streams faux tokens then done", async () => {
    const harness = await createTestHarness("Serial reply");
    try {
      const events = await collectEvents(harness, "hello");
      const tokens = events
        .filter((e) => e.type === CHAT_STREAM_EVENT.TOKEN)
        .map((e) => e.token)
        .join("");
      expect(tokens).toBe("Serial reply");
      expect(events.some((e) => e.type === CHAT_STREAM_EVENT.DONE)).toBe(true);
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("processes inbox jobs serially", async () => {
    const harness = await createTestHarness("First");
    harness.registration.setResponses([
      fauxAssistantMessage([fauxText("First")]),
      fauxAssistantMessage([fauxText("Second")]),
    ]);

    try {
      const firstPromise = collectEvents(harness, "one");
      const secondPromise = collectEvents(harness, "two");
      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      const firstText = first
        .filter((e) => e.type === CHAT_STREAM_EVENT.TOKEN)
        .map((e) => e.token)
        .join("");
      const secondText = second
        .filter((e) => e.type === CHAT_STREAM_EVENT.TOKEN)
        .map((e) => e.token)
        .join("");
      expect(firstText).toBe("First");
      expect(secondText).toBe("Second");
    } finally {
      await disposeTestHarness(harness);
    }
  });
});
