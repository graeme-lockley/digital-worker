import { describe, expect, it, vi } from "vitest";

import {
  AGENT_STATUS,
  type RegisteredAgent,
} from "@digital-worker/agent-register-protocol";
import {
  CHAT_STREAM_ACCEPT,
  CHAT_STREAM_EVENT,
} from "@digital-worker/agent-core-protocol";

import { SchedulerStore } from "./store/scheduler-store.js";
import { TickLoop } from "./tick-loop.js";

const agent: RegisteredAgent = {
  agentId: "agent-a",
  name: "Aida",
  purpose: "test",
  skills: [],
  endpoint: { url: "http://agent-core:3000" },
  status: AGENT_STATUS.AVAILABLE,
  registeredAt: new Date().toISOString(),
  lastHeartbeatAt: new Date().toISOString(),
};

function sseBody(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

describe("TickLoop", () => {
  it("fires chat and completes one-shot event", async () => {
    const store = await SchedulerStore.create(":memory:");
    const now = Date.now();
    await store.createEvent({
      id: "evt-1",
      agentId: "agent-a",
      model: "deepseek/deepseek-v4-flash",
      prompt: "hello scheduler",
      fireAt: now - 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now,
    });

    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/agents")) {
        return new Response(JSON.stringify({ agents: [agent] }), { status: 200 });
      }
      if (url.endsWith("/api/v1/command")) {
        return new Response(
          JSON.stringify({
            models: [{ provider: "deepseek", id: "deepseek-v4-flash", current: true }],
            current: { provider: "deepseek", id: "deepseek-v4-flash", current: true },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/api/v1/chat")) {
        expect(init?.headers).toMatchObject({
          accept: CHAT_STREAM_ACCEPT,
        });
        return new Response(
          sseBody([
            {
              type: CHAT_STREAM_EVENT.TOKEN,
              sessionId: "s1",
              token: "Scheduled reply",
            },
            {
              type: CHAT_STREAM_EVENT.DONE,
              sessionId: "s1",
              messageId: "m1",
            },
          ]),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const loop = new TickLoop({
      store,
      registerUrl: "http://register:3001",
      leaseMs: 60_000,
      clientId: "test-scheduler",
      chatTimeoutMs: 30_000,
      fetchFn,
    });

    await loop.tick();

    const event = await store.getEvent("evt-1");
    expect(event?.status).toBe("completed");
    const { runs } = await store.listRuns({ eventId: "evt-1", limit: 10, offset: 0 });
    expect(runs[0]?.status).toBe("succeeded");
    expect(runs[0]?.transcript).toBe("Scheduled reply");
    await store.close();
  });

  it("defers when agent is sleeping", async () => {
    const store = await SchedulerStore.create(":memory:");
    const now = Date.now();
    await store.createEvent({
      id: "evt-sleep",
      agentId: "agent-a",
      model: "deepseek/deepseek-v4-flash",
      prompt: "later",
      fireAt: now - 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now,
    });

    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          agents: [{ ...agent, status: AGENT_STATUS.SLEEPING }],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const loop = new TickLoop({
      store,
      registerUrl: "http://register:3001",
      leaseMs: 60_000,
      clientId: "test-scheduler",
      chatTimeoutMs: 30_000,
      fetchFn,
    });

    await loop.tick();
    const event = await store.getEvent("evt-sleep");
    expect(event?.fireAt).toBeGreaterThan(now);
    expect(
      (await store.listRuns({ eventId: "evt-sleep", limit: 10, offset: 0 })).runs,
    ).toHaveLength(0);
    await store.close();
  });

  it("skips overlap when a run is still running", async () => {
    const store = await SchedulerStore.create(":memory:");
    const now = Date.now();
    await store.createEvent({
      id: "evt-overlap",
      agentId: "agent-a",
      model: "deepseek/deepseek-v4-flash",
      prompt: "overlap",
      cron: "*/5 * * * *",
      fireAt: now - 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now,
    });
    await store.createRun({
      id: "run-active",
      eventId: "evt-overlap",
      scheduledFor: now - 5000,
      startedAt: now - 5000,
      model: "m1",
      attempt: 1,
    });

    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ agents: [agent] }), { status: 200 }),
    ) as typeof fetch;

    const loop = new TickLoop({
      store,
      registerUrl: "http://register:3001",
      leaseMs: 60_000,
      clientId: "test-scheduler",
      chatTimeoutMs: 30_000,
      fetchFn,
    });

    await loop.tick();
    const event = await store.getEvent("evt-overlap");
    expect(event?.fireAt).toBeGreaterThan(now);
    expect(fetchFn).not.toHaveBeenCalled();
    await store.close();
  });

  it("retries after failure using consecutive count, not total run history", async () => {
    const store = await SchedulerStore.create(":memory:");
    const now = Date.now();
    await store.createEvent({
      id: "evt-recurring",
      agentId: "agent-a",
      model: "deepseek/deepseek-v4-flash",
      prompt: "daily task",
      cron: "0 9 * * *",
      fireAt: now - 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now: now - 86_400_000,
    });

    for (let i = 0; i < 7; i += 1) {
      const runId = `run-ok-${i}`;
      await store.createRun({
        id: runId,
        eventId: "evt-recurring",
        scheduledFor: now - 86_400_000 * (7 - i),
        startedAt: now - 86_400_000 * (7 - i),
        model: "deepseek/deepseek-v4-flash",
        attempt: 1,
      });
      await store.finishRun(runId, "succeeded", now - 86_400_000 * (7 - i) + 1000);
    }

    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/agents")) {
        return new Response(JSON.stringify({ agents: [agent] }), { status: 200 });
      }
      if (url.endsWith("/api/v1/command")) {
        return new Response(
          JSON.stringify({
            models: [{ provider: "deepseek", id: "deepseek-v4-flash", current: true }],
            current: { provider: "deepseek", id: "deepseek-v4-flash", current: true },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/api/v1/chat")) {
        return new Response(
          sseBody([
            {
              type: CHAT_STREAM_EVENT.ERROR,
              code: "INTERNAL_ERROR",
              message: "transient failure",
            },
          ]),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const loop = new TickLoop({
      store,
      registerUrl: "http://register:3001",
      leaseMs: 60_000,
      clientId: "test-scheduler",
      chatTimeoutMs: 30_000,
      fetchFn,
    });

    await loop.tick();

    const event = await store.getEvent("evt-recurring");
    expect(event?.status).toBe("active");
    expect(event?.fireAt).toBeGreaterThanOrEqual(now + 29_000);
    expect(event?.fireAt).toBeLessThanOrEqual(now + 31_000);

    const { runs } = await store.listRuns({ eventId: "evt-recurring", limit: 20, offset: 0 });
    const latest = runs[0];
    expect(latest?.status).toBe("failed");
    expect(latest?.attempt).toBe(1);
    await store.close();
  });

  it("fallback-delivers transcript when deliverTo set and agent did not send", async () => {
    const store = await SchedulerStore.create(":memory:");
    const now = Date.now();
    await store.createEvent({
      id: "evt-fallback",
      agentId: "agent-a",
      model: "deepseek/deepseek-v4-flash",
      prompt: "Morning briefing text only",
      fireAt: now - 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      deliverChannel: "telegram",
      deliverThreadId: "8672094762",
      deliverBotId: "testbot",
      now,
    });

    const outboundCalls: unknown[] = [];
    const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/agents")) {
        return new Response(JSON.stringify({ agents: [agent] }), { status: 200 });
      }
      if (url.endsWith("/api/v1/command")) {
        return new Response(
          JSON.stringify({
            models: [{ provider: "deepseek", id: "deepseek-v4-flash", current: true }],
            current: { provider: "deepseek", id: "deepseek-v4-flash", current: true },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/api/v1/chat")) {
        return new Response(
          sseBody([
            {
              type: CHAT_STREAM_EVENT.TOKEN,
              sessionId: "s1",
              token: "Briefing body with headlines and weather only",
            },
            {
              type: CHAT_STREAM_EVENT.DONE,
              sessionId: "s1",
              messageId: "m1",
            },
          ]),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      if (url.endsWith("/api/v1/outbound")) {
        outboundCalls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ delivered: true }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const loop = new TickLoop({
      store,
      registerUrl: "http://register:3001",
      gatewayUrl: "http://gateway:3002",
      leaseMs: 60_000,
      clientId: "test-scheduler",
      chatTimeoutMs: 30_000,
      fetchFn,
    });

    await loop.tick();

    expect(outboundCalls).toHaveLength(1);
    expect(outboundCalls[0]).toMatchObject({
      channel: "telegram",
      threadId: "8672094762",
      botId: "testbot",
      text: "Briefing body with headlines and weather only",
    });
    const { runs } = await store.listRuns({ eventId: "evt-fallback", limit: 5, offset: 0 });
    expect(runs[0]?.deliverFallback).toBe(true);
    await store.close();
  });
});
