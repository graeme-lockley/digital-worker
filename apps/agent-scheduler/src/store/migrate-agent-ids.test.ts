import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

import { migrateAgentIds } from "./migrate-agent-ids.js";

async function seedLegacyEvent(): Promise<ReturnType<typeof createClient>> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
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

  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO scheduled_event (
      id, agent_id, model, prompt, cron, fire_at, timezone,
      missed_policy, status, lease_until, created_by, created_at, updated_at,
      internal_only, deliver_channel, deliver_thread_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, 0, NULL, NULL)`,
    args: [
      "evt-old",
      "dev-workstation-agent-core",
      "m1",
      "daily briefing",
      "0 8 * * *",
      now + 60_000,
      "UTC",
      "fire-once",
      "dev-workstation-agent-core",
      now,
      now,
    ],
  });

  return client;
}

describe("migrateAgentIds", () => {
  it("renames dev-workstation agent-core schedules to agent-core-aida", async () => {
    const client = await seedLegacyEvent();

    const updated = await migrateAgentIds(client);
    expect(updated).toBe(2);

    const row = await client.execute(
      "SELECT agent_id, created_by FROM scheduled_event WHERE id = 'evt-old'",
    );
    expect(row.rows[0]?.agent_id).toBe("dev-workstation-agent-core-aida");
    expect(row.rows[0]?.created_by).toBe("dev-workstation-agent-core-aida");

    await client.close();
  });
});
