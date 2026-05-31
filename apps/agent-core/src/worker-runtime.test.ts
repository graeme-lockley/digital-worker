import {
  fauxAssistantMessage,
  fauxText,
} from "@earendil-works/pi-ai";
import type { Agent } from "@earendil-works/pi-agent-core";
import { describe, expect, it, vi } from "vitest";

import {
  CHAT_STREAM_EVENT,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";

import {
  createTestHarness,
  disposeTestHarness,
  TEST_SESSION_ID,
} from "./test-helpers.js";
import { WorkerRuntime } from "./worker-runtime.js";

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

  it("reports idle status", async () => {
    const harness = await createTestHarness();
    try {
      expect(harness.runtime.getStatus()).toMatchObject({
        sessionId: TEST_SESSION_ID,
        queueDepth: 0,
        queuedCount: 0,
        active: null,
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("abandon drains queued jobs with SSE errors", async () => {
    let rejectPrompt: ((error: Error) => void) | undefined;
    const promptGate = new Promise<void>((_resolve, reject) => {
      rejectPrompt = reject;
    });

    const agent = {
      prompt: vi.fn(async () => {
        await promptGate;
      }),
      abort: vi.fn(() => {
        rejectPrompt?.(new Error("aborted"));
      }),
      subscribe: vi.fn(() => () => {}),
    } as unknown as Agent;

    const runtime = new WorkerRuntime(agent, TEST_SESSION_ID);
    runtime.start();

    const events: ChatStreamEvent[] = [];
    const activePromise = runtime.enqueue({
      id: "job-active",
      messageId: "msg-active",
      clientId: "client-1",
      prompt: "hold",
      sessionId: TEST_SESSION_ID,
      enqueueAt: Date.now(),
      emit: async (event) => {
        events.push(event);
      },
      signal: new AbortController().signal,
    });

    const queuedPromise = runtime.enqueue({
      id: "job-queued",
      messageId: "msg-queued",
      clientId: "client-2",
      prompt: "wait",
      sessionId: TEST_SESSION_ID,
      enqueueAt: Date.now(),
      emit: async (event) => {
        events.push(event);
      },
      signal: new AbortController().signal,
    });

    await vi.waitFor(() => {
      expect(runtime.getStatus().queuedCount).toBe(1);
    });

    const result = runtime.abandon();
    expect(result).toEqual({ abandonedActive: true, drainedQueued: 1 });

    await expect(queuedPromise).rejects.toThrow("abandoned by operator");
    await expect(activePromise).rejects.toThrow("abandoned by operator");

    expect(
      events.filter((event) => event.type === CHAT_STREAM_EVENT.ERROR),
    ).toHaveLength(2);

    await runtime.stop();
  });
});
