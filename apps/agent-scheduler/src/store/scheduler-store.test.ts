import { describe, expect, it } from "vitest";

import { SchedulerStore } from "./scheduler-store.js";

async function openStore(): Promise<SchedulerStore> {
  return SchedulerStore.create(":memory:");
}

describe("SchedulerStore", () => {
  it("creates and lists events", async () => {
    const store = await openStore();
    const now = Date.now();
    const event = await store.createEvent({
      id: "evt-1",
      agentId: "agent-a",
      model: "deepseek/deepseek-v4-flash",
      prompt: "Say hello",
      fireAt: now + 60_000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now,
    });

    expect(event.id).toBe("evt-1");
    const listed = await store.listEvents({ agentId: "agent-a" });
    expect(listed).toHaveLength(1);
    await store.close();
  });

  it("claims due events with lease", async () => {
    const store = await openStore();
    const now = Date.now();
    await store.createEvent({
      id: "evt-due",
      agentId: "agent-a",
      model: "m1",
      prompt: "due",
      fireAt: now - 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now,
    });

    const claimed = await store.claimDueEvents(now, 60_000);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.leaseUntil).toBeDefined();

    const secondClaim = await store.claimDueEvents(now, 60_000);
    expect(secondClaim).toHaveLength(0);
    await store.close();
  });

  it("recovers stale leases and interrupts running runs", async () => {
    const store = await openStore();
    const now = Date.now();
    await store.createEvent({
      id: "evt-lease",
      agentId: "agent-a",
      model: "m1",
      prompt: "lease",
      fireAt: now - 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now,
    });
    await store.claimDueEvents(now, 60_000);
    const run = await store.createRun({
      id: "run-1",
      eventId: "evt-lease",
      scheduledFor: now - 1000,
      startedAt: now,
      model: "m1",
      attempt: 1,
    });
    expect(run.status).toBe("running");

    await store.recoverStaleLeases(now + 120_000);
    const updated = await store.getRun("run-1");
    expect(updated?.status).toBe("interrupted");
    await store.close();
  });

  it("applies skip missed policy for overdue cron events", async () => {
    const store = await openStore();
    const now = Date.now();
    await store.createEvent({
      id: "evt-cron",
      agentId: "agent-a",
      model: "m1",
      prompt: "cron",
      cron: "0 9 * * *",
      fireAt: now - 86_400_000,
      timezone: "UTC",
      missedPolicy: "skip",
      createdBy: "agent-a",
      now: now - 86_400_000,
    });

    const adjusted = await store.applyMissedPolicy(now);
    expect(adjusted).toBe(1);
    const event = await store.getEvent("evt-cron");
    expect(event?.fireAt).toBeGreaterThan(now);
    await store.close();
  });

  it("counts consecutive failures since last success", async () => {
    const store = await openStore();
    const now = Date.now();
    await store.createEvent({
      id: "evt-retry",
      agentId: "agent-a",
      model: "m1",
      prompt: "retry",
      fireAt: now,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now,
    });

    expect(await store.countConsecutiveFailures("evt-retry")).toBe(0);

    await store.createRun({
      id: "run-ok-1",
      eventId: "evt-retry",
      scheduledFor: now,
      startedAt: now,
      model: "m1",
      attempt: 1,
    });
    await store.finishRun("run-ok-1", "succeeded", now + 100);
    await store.createRun({
      id: "run-ok-2",
      eventId: "evt-retry",
      scheduledFor: now + 1000,
      startedAt: now + 1000,
      model: "m1",
      attempt: 1,
    });
    await store.finishRun("run-ok-2", "succeeded", now + 1100);

    await store.createRun({
      id: "run-fail-1",
      eventId: "evt-retry",
      scheduledFor: now + 2000,
      startedAt: now + 2000,
      model: "m1",
      attempt: 1,
    });
    await store.finishRun("run-fail-1", "failed", now + 2100, "error 1");
    await store.createRun({
      id: "run-fail-2",
      eventId: "evt-retry",
      scheduledFor: now + 3000,
      startedAt: now + 3000,
      model: "m1",
      attempt: 2,
    });
    await store.finishRun("run-fail-2", "failed", now + 3100, "error 2");

    expect(await store.countConsecutiveFailures("evt-retry")).toBe(2);

    await store.createRun({
      id: "run-ok-3",
      eventId: "evt-retry",
      scheduledFor: now + 4000,
      startedAt: now + 4000,
      model: "m1",
      attempt: 3,
    });
    await store.finishRun("run-ok-3", "succeeded", now + 4100);

    expect(await store.countConsecutiveFailures("evt-retry")).toBe(0);
    await store.close();
  });

  it("lists runs joined with event metadata", async () => {
    const store = await openStore();
    const now = Date.now();
    await store.createEvent({
      id: "evt-runs",
      agentId: "agent-b",
      model: "m1",
      prompt: "joined prompt",
      fireAt: now + 1000,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-b",
      now,
    });
    await store.createRun({
      id: "run-a",
      eventId: "evt-runs",
      scheduledFor: now,
      startedAt: now,
      model: "m1",
      attempt: 1,
    });
    await store.finishRun("run-a", "succeeded", now + 500);

    const { runs, total } = await store.listRuns({
      agentId: "agent-b",
      limit: 10,
      offset: 0,
    });
    expect(total).toBe(1);
    expect(runs[0]?.prompt).toBe("joined prompt");
    expect(runs[0]?.agentId).toBe("agent-b");
    await store.close();
  });
});
