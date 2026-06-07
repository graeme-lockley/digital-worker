import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { type Client, createClient } from "@libsql/client";

const LEGACY_DB_FILE = "scheduler.db";

export async function migrateLegacySchedulerDb(
  target: Client,
  legacyDataDir: string,
): Promise<number> {
  const legacyPath = path.join(legacyDataDir, LEGACY_DB_FILE);
  try {
    await access(legacyPath);
  } catch {
    return 0;
  }

  const existing = await target.execute(
    "SELECT COUNT(*) AS count FROM scheduled_event",
  );
  const count = Number(existing.rows[0]?.count ?? 0);
  if (count > 0) {
    return 0;
  }

  const legacy = createClient({ url: pathToFileURL(legacyPath).href });
  try {
    const metaRows = await legacy.execute("SELECT key, value FROM meta");
    const eventRows = await legacy.execute("SELECT * FROM scheduled_event");
    const runRows = await legacy.execute("SELECT * FROM scheduled_run");

    const statements: Array<{ sql: string; args: Array<string | number | null> }> =
      [];

    for (const row of metaRows.rows) {
      statements.push({
        sql: "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        args: [String(row.key), String(row.value)],
      });
    }

    for (const row of eventRows.rows) {
      statements.push({
        sql: `INSERT INTO scheduled_event (
          id, agent_id, model, prompt, cron, fire_at, timezone,
          missed_policy, status, lease_until, created_by, created_at, updated_at,
          internal_only, deliver_channel, deliver_thread_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          String(row.id),
          String(row.agent_id),
          String(row.model),
          String(row.prompt),
          row.cron == null ? null : String(row.cron),
          Number(row.fire_at),
          String(row.timezone),
          String(row.missed_policy),
          String(row.status),
          row.lease_until == null ? null : Number(row.lease_until),
          String(row.created_by),
          Number(row.created_at),
          Number(row.updated_at),
          Number(row.internal_only ?? 0),
          row.deliver_channel == null ? null : String(row.deliver_channel),
          row.deliver_thread_id == null ? null : String(row.deliver_thread_id),
        ],
      });
    }

    for (const row of runRows.rows) {
      statements.push({
        sql: `INSERT INTO scheduled_run (
          id, event_id, scheduled_for, started_at, finished_at,
          status, model, transcript, error, attempt, deliver_fallback
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          String(row.id),
          String(row.event_id),
          Number(row.scheduled_for),
          Number(row.started_at),
          row.finished_at == null ? null : Number(row.finished_at),
          String(row.status),
          String(row.model),
          String(row.transcript ?? ""),
          row.error == null ? null : String(row.error),
          Number(row.attempt ?? 1),
          Number(row.deliver_fallback ?? 0),
        ],
      });
    }

    if (statements.length === 0) {
      return 0;
    }

    await target.batch(statements, "write");
    return eventRows.rows.length;
  } finally {
    legacy.close();
  }
}
