import {
  fauxAssistantMessage,
  fauxText,
  registerFauxProvider,
} from "@earendil-works/pi-ai";
import type { Agent } from "@earendil-works/pi-agent-core";
import { describe, expect, it, vi } from "vitest";

import {
  CHAT_STREAM_EVENT,
  OBSERVER_EVENT,
  type ChatStreamEvent,
  type ObserverEvent,
} from "@digital-worker/agent-core-protocol";

import { ObserverHub } from "./observer-hub.js";
import { createLlmAgent } from "./llm-agent.js";
import {
  createTestHarness,
  disposeTestHarness,
  repoWorkspacePath,
  TEST_SESSION_ID,
} from "./test-helpers.js";
import { loadWorkspace } from "./workspace/index.js";
import { WorkerRuntime } from "./worker-runtime.js";

async function collectEvents(
  harness: Awaited<ReturnType<typeof createTestHarness>>,
  prompt: string,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  await harness.runtime.enqueue({
    kind: "chat",
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

  it("publishes observer lifecycle and text events", async () => {
    const harness = await createTestHarness("Observer reply");
    const observerEvents: ObserverEvent[] = [];
    const unsubscribe = harness.ctx.observer.subscribe(async (event) => {
      observerEvents.push(event);
    });

    try {
      await collectEvents(harness, "observe me");

      expect(
        observerEvents.some((e) => e.type === OBSERVER_EVENT.JOB_ENQUEUED),
      ).toBe(true);
      expect(
        observerEvents.some((e) => e.type === OBSERVER_EVENT.JOB_STARTED),
      ).toBe(true);
      expect(
        observerEvents.some((e) => e.type === OBSERVER_EVENT.JOB_FINISHED),
      ).toBe(true);
      expect(
        observerEvents
          .filter((e) => e.type === OBSERVER_EVENT.TEXT_DELTA)
          .map((e) => (e.type === OBSERVER_EVENT.TEXT_DELTA ? e.delta : ""))
          .join(""),
      ).toBe("Observer reply");
    } finally {
      unsubscribe();
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

    const runtime = new WorkerRuntime(
      agent,
      TEST_SESSION_ID,
      undefined,
      new ObserverHub(),
      undefined,
    );
    runtime.start();

    const events: ChatStreamEvent[] = [];
    const activePromise = runtime.enqueue({
      kind: "chat",
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
      kind: "chat",
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

  it("runs chat job under specified model and restores afterward", async () => {
    const registration = registerFauxProvider({
      models: [{ id: "faux-a" }, { id: "faux-b" }],
    });
    const modelA = registration.getModel("faux-a") ?? registration.getModel();
    const modelB = registration.getModel("faux-b");
    expect(modelB).toBeTruthy();

    const loaded = await loadWorkspace({
      agentName: "_template",
      workspaceDir: repoWorkspacePath(),
    });

    let identitySnapshot = { ...loaded.identity };
    const { session } = await createLlmAgent({
      llm: { provider: modelA.provider, modelId: modelA.id },
      model: modelA,
      scopedModels: [{ model: modelA }, { model: modelB! }],
      apiKey: "faux-test-key",
      toolsCwd: repoWorkspacePath(),
      browserEnabled: false,
      identity: identitySnapshot,
      identityStore: loaded.identityStore,
      userStore: loaded.userStore,
      getIdentity: () => identitySnapshot,
      setIdentityContent: (content) => {
        identitySnapshot = { ...identitySnapshot, identity: content };
      },
      setUserContent: (content) => {
        identitySnapshot = { ...identitySnapshot, user: content };
      },
    });

    registration.setResponses([
      fauxAssistantMessage([fauxText("Model B reply")]),
    ]);

    const runtime = new WorkerRuntime(
      session.agent,
      TEST_SESSION_ID,
      undefined,
      new ObserverHub(),
      session,
    );
    runtime.start();

    try {
      expect(session.model?.id).toBe(modelA.id);
      await runtime.enqueue({
        kind: "chat",
        id: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        clientId: "client-1",
        prompt: "use model b",
        sessionId: TEST_SESSION_ID,
        enqueueAt: Date.now(),
        model: `${modelB!.provider}/${modelB!.id}`,
        emit: async () => {},
        signal: new AbortController().signal,
      });
      expect(session.model?.id).toBe(modelA.id);
    } finally {
      await runtime.stop();
      registration.unregister();
    }
  });

  it("auto-delivers accumulated assistant text for notify jobs with deliver sink", async () => {
    const harness = await createTestHarness("Telegram reply body");
    const deliver = vi.fn().mockResolvedValue(undefined);

    try {
      await harness.runtime.enqueue({
        kind: "notify",
        id: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        clientId: "gateway",
        prompt: "[conversation telegram:123 from graeme]\ngraeme: hi",
        sessionId: TEST_SESSION_ID,
        enqueueAt: Date.now(),
        signal: new AbortController().signal,
        correlationId: "telegram:123",
        channel: "telegram",
        threadId: "123",
        sender: "graeme",
        messageIds: ["msg-1"],
        deliver,
      });

      await vi.waitFor(() => {
        expect(deliver).toHaveBeenCalledWith("Telegram reply body", ["msg-1"]);
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });
});
