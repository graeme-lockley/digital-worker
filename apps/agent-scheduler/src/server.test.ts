import { describe, expect, it, vi } from "vitest";

import { SCHEDULER_PATHS } from "@digital-worker/agent-scheduler-protocol";

import { createApp } from "./server.js";
import { SchedulerStore } from "./store/scheduler-store.js";
import { TickLoop } from "./tick-loop.js";

describe("scheduler API", () => {
  it("lists runs with agent filter", async () => {
    const store = await SchedulerStore.create(":memory:");
    const now = Date.now();
    await store.createEvent({
      id: "evt-api",
      agentId: "agent-x",
      model: "m1",
      prompt: "prompt text",
      fireAt: now + 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-x",
      now,
    });
    await store.createRun({
      id: "run-api",
      eventId: "evt-api",
      scheduledFor: now,
      startedAt: now,
      model: "m1",
      attempt: 1,
    });
    await store.finishRun("run-api", "succeeded", now + 100);

    const tickLoop = new TickLoop({
      store,
      registerUrl: "http://register:3001",
      leaseMs: 60_000,
      clientId: "test",
      chatTimeoutMs: 30_000,
      fetchFn: vi.fn() as typeof fetch,
    });

    const app = createApp({ store, registerUrl: "http://register:3001", tickLoop });
    const response = await app.request(
      `${SCHEDULER_PATHS.runs}?agentId=agent-x`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      runs: Array<{ agentId: string; prompt: string }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.runs[0]?.agentId).toBe("agent-x");
    expect(body.runs[0]?.prompt).toBe("prompt text");
    await store.close();
  });
});
