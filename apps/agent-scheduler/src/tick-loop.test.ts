import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
    const dir = await mkdtemp(path.join(tmpdir(), "tick-loop-"));
    const store = new SchedulerStore(dir);
    const now = Date.now();
    store.createEvent({
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

    const event = store.getEvent("evt-1");
    expect(event?.status).toBe("completed");
    const { runs } = store.listRuns({ eventId: "evt-1", limit: 10, offset: 0 });
    expect(runs[0]?.status).toBe("succeeded");
    expect(runs[0]?.transcript).toBe("Scheduled reply");
    store.close();
  });

  it("defers when agent is sleeping", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tick-loop-"));
    const store = new SchedulerStore(dir);
    const now = Date.now();
    store.createEvent({
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
    const event = store.getEvent("evt-sleep");
    expect(event?.fireAt).toBeGreaterThan(now);
    expect(store.listRuns({ eventId: "evt-sleep", limit: 10, offset: 0 }).runs).toHaveLength(0);
    store.close();
  });

  it("skips overlap when a run is still running", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tick-loop-"));
    const store = new SchedulerStore(dir);
    const now = Date.now();
    store.createEvent({
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
    store.createRun({
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
    const event = store.getEvent("evt-overlap");
    expect(event?.fireAt).toBeGreaterThan(now);
    expect(fetchFn).not.toHaveBeenCalled();
    store.close();
  });
});
