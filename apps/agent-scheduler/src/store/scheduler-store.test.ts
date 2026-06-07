import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SchedulerStore } from "./scheduler-store.js";

async function openStore(): Promise<{ store: SchedulerStore; dir: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "scheduler-store-"));
  return { store: new SchedulerStore(dir), dir };
}

describe("SchedulerStore", () => {
  it("creates and lists events", () => {
    const { store } = openStoreSync();
    const now = Date.now();
    const event = store.createEvent({
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
    const listed = store.listEvents({ agentId: "agent-a" });
    expect(listed).toHaveLength(1);
    store.close();
  });

  it("claims due events with lease", () => {
    const { store } = openStoreSync();
    const now = Date.now();
    store.createEvent({
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

    const claimed = store.claimDueEvents(now, 60_000);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.leaseUntil).toBeDefined();

    const secondClaim = store.claimDueEvents(now, 60_000);
    expect(secondClaim).toHaveLength(0);
    store.close();
  });

  it("recovers stale leases and interrupts running runs", () => {
    const { store } = openStoreSync();
    const now = Date.now();
    store.createEvent({
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
    store.claimDueEvents(now, 60_000);
    const run = store.createRun({
      id: "run-1",
      eventId: "evt-lease",
      scheduledFor: now - 1000,
      startedAt: now,
      model: "m1",
      attempt: 1,
    });
    expect(run.status).toBe("running");

    store.recoverStaleLeases(now + 120_000);
    const updated = store.getRun("run-1");
    expect(updated?.status).toBe("interrupted");
    store.close();
  });

  it("applies skip missed policy for overdue cron events", () => {
    const { store } = openStoreSync();
    const now = Date.now();
    store.createEvent({
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

    const adjusted = store.applyMissedPolicy(now);
    expect(adjusted).toBe(1);
    const event = store.getEvent("evt-cron");
    expect(event?.fireAt).toBeGreaterThan(now);
    store.close();
  });

  it("lists runs joined with event metadata", () => {
    const { store } = openStoreSync();
    const now = Date.now();
    store.createEvent({
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
    store.createRun({
      id: "run-a",
      eventId: "evt-runs",
      scheduledFor: now,
      startedAt: now,
      model: "m1",
      attempt: 1,
    });
    store.finishRun("run-a", "succeeded", now + 500);

    const { runs, total } = store.listRuns({
      agentId: "agent-b",
      limit: 10,
      offset: 0,
    });
    expect(total).toBe(1);
    expect(runs[0]?.prompt).toBe("joined prompt");
    expect(runs[0]?.agentId).toBe("agent-b");
    store.close();
  });
});

function openStoreSync(): { store: SchedulerStore; dir: string } {
  const dir = path.join(tmpdir(), `scheduler-store-${crypto.randomUUID()}`);
  return { store: new SchedulerStore(dir), dir };
}
