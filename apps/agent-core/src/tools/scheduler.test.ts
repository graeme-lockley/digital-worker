import { describe, expect, it, vi } from "vitest";

import { SCHEDULER_PATHS } from "@digital-worker/agent-scheduler-protocol";

import {
  createCancelScheduledEventTool,
  createListScheduledEventsTool,
  createScheduleEventTool,
} from "./scheduler.js";

describe("scheduler tools", () => {
  it("schedule_event posts create payload", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          event: {
            id: "evt-1",
            agentId: "agent-a",
            model: "m1",
            prompt: "hello",
            fireAt: Date.now() + 1000,
            timezone: "UTC",
            missedPolicy: "fire-once",
            status: "active",
            createdBy: "agent-a",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        }),
        { status: 201 },
      ),
    ) as typeof fetch;

    const tool = createScheduleEventTool({
      schedulerUrl: "http://scheduler:3003",
      agentId: "agent-a",
      fetchFn,
    });

    const result = await tool.execute("call-1", {
      prompt: "hello",
      model: "m1",
      fireAt: "2026-06-10T09:00:00.000Z",
    });

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(SCHEDULER_PATHS.events, "http://scheduler:3003"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.content[0]?.type).toBe("text");
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("evt-1");
    }
  });

  it("list_scheduled_events surfaces HTTP errors", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "bad request" } }), {
        status: 400,
      }),
    ) as typeof fetch;

    const tool = createListScheduledEventsTool({
      schedulerUrl: "http://scheduler:3003",
      agentId: "agent-a",
      fetchFn,
    });

    const result = await tool.execute("call-1", {});
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("bad request");
    }
  });

  it("cancel_scheduled_event deletes event", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          event: {
            id: "evt-1",
            agentId: "agent-a",
            model: "m1",
            prompt: "hello",
            fireAt: Date.now(),
            timezone: "UTC",
            missedPolicy: "fire-once",
            status: "cancelled",
            createdBy: "agent-a",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          recentRuns: [],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const tool = createCancelScheduledEventTool({
      schedulerUrl: "http://scheduler:3003",
      agentId: "agent-a",
      fetchFn,
    });

    const result = await tool.execute("call-1", { eventId: "evt-1" });
    if (result.content[0]?.type === "text") {
      expect(result.content[0].text).toContain("Cancelled");
    }
  });
});
