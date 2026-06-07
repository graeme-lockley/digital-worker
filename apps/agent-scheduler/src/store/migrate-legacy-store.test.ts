import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

import { migrateLegacySchedulerDb } from "./migrate-legacy-store.js";
import { SchedulerStore } from "./scheduler-store.js";

describe("migrateLegacySchedulerDb", () => {
  it("imports rows from a legacy scheduler.db when the target store is empty", async () => {
    const root = path.join(tmpdir(), `scheduler-migrate-${crypto.randomUUID()}`);
    const legacyDir = path.join(root, "legacy");
    await mkdir(legacyDir, { recursive: true });

    const legacyPath = path.join(legacyDir, "scheduler.db");
    const legacy = createClient({ url: pathToFileURL(legacyPath).href });
    await legacy.execute(
      "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    await legacy.execute(`
      CREATE TABLE scheduled_event (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt TEXT NOT NULL,
        cron TEXT,
        fire_at INTEGER NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        missed_policy TEXT NOT NULL DEFAULT 'fire-once',
        status TEXT NOT NULL DEFAULT 'active',
        lease_until INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        internal_only INTEGER NOT NULL DEFAULT 0,
        deliver_channel TEXT,
        deliver_thread_id TEXT
      )
    `);
    await legacy.execute(`
      CREATE TABLE scheduled_run (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        status TEXT NOT NULL,
        model TEXT NOT NULL,
        transcript TEXT NOT NULL DEFAULT '',
        error TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        deliver_fallback INTEGER NOT NULL DEFAULT 0
      )
    `);
    const now = Date.now();
    await legacy.execute({
      sql: `INSERT INTO scheduled_event (
        id, agent_id, model, prompt, cron, fire_at, timezone, missed_policy,
        status, lease_until, created_by, created_at, updated_at,
        internal_only, deliver_channel, deliver_thread_id
      ) VALUES (?, ?, ?, ?, NULL, ?, 'UTC', 'fire-once', 'active', NULL, ?, ?, ?, 0, NULL, NULL)`,
      args: ["evt-legacy", "agent-a", "m1", "legacy prompt", now, "agent-a", now, now],
    });
    await legacy.execute({
      sql: `INSERT INTO scheduled_run (
        id, event_id, scheduled_for, started_at, finished_at, status, model,
        transcript, error, attempt, deliver_fallback
      ) VALUES (?, ?, ?, ?, ?, 'succeeded', ?, 'done', NULL, 1, 0)`,
      args: ["run-legacy", "evt-legacy", now, now, now + 100, "m1"],
    });
    legacy.close();

    const store = await SchedulerStore.create(":memory:", {
      legacyDataDir: legacyDir,
    });
    const events = await store.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.prompt).toBe("legacy prompt");
    const { runs, total } = await store.listRuns({
      eventId: "evt-legacy",
      limit: 10,
      offset: 0,
    });
    expect(total).toBe(1);
    expect(runs[0]?.transcript).toBe("done");
    await store.close();
  });

  it("skips migration when the target already has events", async () => {
    const root = path.join(tmpdir(), `scheduler-migrate-${crypto.randomUUID()}`);
    const legacyDir = path.join(root, "legacy");
    const targetPath = path.join(root, "target.db");
    await mkdir(legacyDir, { recursive: true });

    const legacyPath = path.join(legacyDir, "scheduler.db");
    const legacy = createClient({ url: pathToFileURL(legacyPath).href });
    await legacy.execute(
      "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    await legacy.execute(`
      CREATE TABLE scheduled_event (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt TEXT NOT NULL,
        cron TEXT,
        fire_at INTEGER NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        missed_policy TEXT NOT NULL DEFAULT 'fire-once',
        status TEXT NOT NULL DEFAULT 'active',
        lease_until INTEGER,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        internal_only INTEGER NOT NULL DEFAULT 0,
        deliver_channel TEXT,
        deliver_thread_id TEXT
      )
    `);
    await legacy.execute(`
      CREATE TABLE scheduled_run (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        status TEXT NOT NULL,
        model TEXT NOT NULL,
        transcript TEXT NOT NULL DEFAULT '',
        error TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        deliver_fallback INTEGER NOT NULL DEFAULT 0
      )
    `);
    const now = Date.now();
    await legacy.execute({
      sql: `INSERT INTO scheduled_event (
        id, agent_id, model, prompt, cron, fire_at, timezone, missed_policy,
        status, lease_until, created_by, created_at, updated_at,
        internal_only, deliver_channel, deliver_thread_id
      ) VALUES (?, ?, ?, ?, NULL, ?, 'UTC', 'fire-once', 'active', NULL, ?, ?, ?, 0, NULL, NULL)`,
      args: ["evt-legacy-2", "agent-a", "m1", "should not import", now, "agent-a", now, now],
    });
    legacy.close();

    const targetUrl = pathToFileURL(targetPath).href;
    const store = await SchedulerStore.create(targetUrl);
    await store.createEvent({
      id: "evt-existing",
      agentId: "agent-a",
      model: "m1",
      prompt: "existing",
      fireAt: now,
      timezone: "UTC",
      missedPolicy: "fire-once",
      createdBy: "agent-a",
      now,
    });
    await store.close();

    const target = createClient({ url: targetUrl });
    const migrated = await migrateLegacySchedulerDb(target, legacyDir);
    expect(migrated).toBe(0);
    const events = await target.execute("SELECT id FROM scheduled_event");
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]?.id).toBe("evt-existing");
    target.close();
  });
});
