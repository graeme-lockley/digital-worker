import { mkdirSync } from "node:fs";
import path from "node:path";

import type {
  MissedFirePolicy,
  ScheduledEvent,
  ScheduledEventStatus,
  ScheduledRun,
  ScheduledRunStatus,
  ScheduledRunSummary,
} from "@digital-worker/agent-scheduler-protocol";
import { type Client, createClient } from "@libsql/client";

import { computeNextFireAt } from "../cron.js";
import { migrateAgentIds } from "./migrate-agent-ids.js";
import { migrateLegacySchedulerDb } from "./migrate-legacy-store.js";

const SCHEMA_VERSION = 4;

type EventRow = {
  id: string;
  agent_id: string;
  model: string;
  prompt: string;
  cron: string | null;
  fire_at: number;
  timezone: string;
  missed_policy: MissedFirePolicy;
  status: ScheduledEventStatus;
  lease_until: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  internal_only: number;
  deliver_channel: string | null;
  deliver_thread_id: string | null;
  deliver_bot_id: string | null;
};

type RunRow = {
  id: string;
  event_id: string;
  scheduled_for: number;
  started_at: number;
  finished_at: number | null;
  status: ScheduledRunStatus;
  model: string;
  transcript: string;
  error: string | null;
  attempt: number;
  deliver_fallback: number;
};

export type CreateEventInput = {
  id: string;
  agentId: string;
  model: string;
  prompt: string;
  cron?: string;
  fireAt: number;
  timezone: string;
  missedPolicy: MissedFirePolicy;
  createdBy: string;
  internalOnly?: boolean;
  deliverChannel?: string;
  deliverThreadId?: string;
  deliverBotId?: string;
  now: number;
};

export type ListEventsFilters = {
  agentId?: string;
  status?: ScheduledEventStatus;
};

export type ListRunsFilters = {
  agentId?: string;
  eventId?: string;
  status?: ScheduledRunStatus;
  limit: number;
  offset: number;
};

export type SchedulerStoreOptions = {
  authToken?: string;
  /** When set, import rows from `{dir}/scheduler.db` if the target store is empty. */
  legacyDataDir?: string;
};

export class SchedulerStore {
  private constructor(private readonly client: Client) {}

  static async create(
    dbUrl: string,
    options: SchedulerStoreOptions = {},
  ): Promise<SchedulerStore> {
    ensureFileDbDir(dbUrl);
    const client = createClient({
      url: dbUrl,
      authToken: options.authToken,
    });
    const store = new SchedulerStore(client);
    await connectWithRetry(dbUrl, () => store.initSchema());
    if (options.legacyDataDir) {
      const migrated = await migrateLegacySchedulerDb(client, options.legacyDataDir);
      if (migrated > 0) {
        console.log(`migrated ${migrated} scheduled event(s) from legacy SQLite store`);
        const renamed = await migrateAgentIds(client);
        if (renamed > 0) {
          console.log(
            `migrated ${renamed} scheduled event field(s) to renamed agent ids`,
          );
        }
      }
    }
    return store;
  }

  async close(): Promise<void> {
    this.client.close();
  }

  private async initSchema(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS scheduled_event (
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
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_event_due
        ON scheduled_event (status, fire_at)
    `);
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS scheduled_run (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES scheduled_event(id),
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
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_run_event
        ON scheduled_run (event_id, started_at)
    `);

    const row = await this.client.execute({
      sql: "SELECT value FROM meta WHERE key = 'schema_version'",
    });
    const version = row.rows[0] ? Number(row.rows[0].value) : 0;
    if (version < SCHEMA_VERSION) {
      await this.migrateSchema(version);
      await this.client.execute({
        sql: "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        args: [String(SCHEMA_VERSION)],
      });
    }
  }

  private async migrateSchema(fromVersion: number): Promise<void> {
    if (fromVersion < 2) {
      await this.addColumnIfMissing(
        "scheduled_event",
        "internal_only",
        "INTEGER NOT NULL DEFAULT 0",
      );
      await this.addColumnIfMissing("scheduled_event", "deliver_channel", "TEXT");
      await this.addColumnIfMissing(
        "scheduled_event",
        "deliver_thread_id",
        "TEXT",
      );
      await this.addColumnIfMissing(
        "scheduled_run",
        "deliver_fallback",
        "INTEGER NOT NULL DEFAULT 0",
      );
    }

    if (fromVersion < 3) {
      const updated = await migrateAgentIds(this.client);
      if (updated > 0) {
        console.log(
          `migrated ${updated} scheduled event field(s) to renamed agent ids`,
        );
      }
    }

    if (fromVersion < 4) {
      await this.addColumnIfMissing("scheduled_event", "deliver_bot_id", "TEXT");
    }
  }

  private async addColumnIfMissing(
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    const columns = await this.client.execute(`PRAGMA table_info(${table})`);
    if (columns.rows.some((entry) => entry.name === column)) {
      return;
    }
    await this.client.execute(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
    );
  }

  async createEvent(input: CreateEventInput): Promise<ScheduledEvent> {
    await this.client.execute({
      sql: `INSERT INTO scheduled_event (
          id, agent_id, model, prompt, cron, fire_at, timezone,
          missed_policy, status, lease_until, created_by, created_at, updated_at,
          internal_only, deliver_channel, deliver_thread_id, deliver_bot_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.id,
        input.agentId,
        input.model,
        input.prompt,
        input.cron ?? null,
        input.fireAt,
        input.timezone,
        input.missedPolicy,
        input.createdBy,
        input.now,
        input.now,
        input.internalOnly ? 1 : 0,
        input.deliverChannel ?? null,
        input.deliverThreadId ?? null,
        input.deliverBotId ?? null,
      ],
    });
    return (await this.getEvent(input.id))!;
  }

  async getEvent(eventId: string): Promise<ScheduledEvent | null> {
    const result = await this.client.execute({
      sql: "SELECT * FROM scheduled_event WHERE id = ?",
      args: [eventId],
    });
    const row = result.rows[0];
    return row ? mapEventRow(row as unknown as EventRow) : null;
  }

  async listEvents(filters: ListEventsFilters = {}): Promise<ScheduledEvent[]> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filters.agentId) {
      clauses.push("agent_id = ?");
      params.push(filters.agentId);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.client.execute({
      sql: `SELECT * FROM scheduled_event ${where} ORDER BY fire_at ASC, created_at ASC`,
      args: params,
    });
    return result.rows.map((row) => mapEventRow(row as unknown as EventRow));
  }

  async cancelEvent(eventId: string, now: number): Promise<ScheduledEvent | null> {
    const existing = await this.getEvent(eventId);
    if (!existing) {
      return null;
    }
    await this.client.execute({
      sql: "UPDATE scheduled_event SET status = 'cancelled', lease_until = NULL, updated_at = ? WHERE id = ?",
      args: [now, eventId],
    });
    return this.getEvent(eventId);
  }

  async pauseEvent(eventId: string, now: number): Promise<ScheduledEvent | null> {
    const existing = await this.getEvent(eventId);
    if (!existing || existing.status !== "active") {
      return existing;
    }
    await this.client.execute({
      sql: "UPDATE scheduled_event SET status = 'paused', lease_until = NULL, updated_at = ? WHERE id = ?",
      args: [now, eventId],
    });
    return this.getEvent(eventId);
  }

  async resumeEvent(
    eventId: string,
    nextFireAt: number,
    now: number,
  ): Promise<ScheduledEvent | null> {
    const existing = await this.getEvent(eventId);
    if (!existing || existing.status !== "paused") {
      return existing;
    }
    await this.client.execute({
      sql: `UPDATE scheduled_event
         SET status = 'active', fire_at = ?, lease_until = NULL, updated_at = ?
         WHERE id = ?`,
      args: [nextFireAt, now, eventId],
    });
    return this.getEvent(eventId);
  }

  async claimDueEvents(now: number, leaseMs: number): Promise<ScheduledEvent[]> {
    const leaseUntil = now + leaseMs;
    const dueResult = await this.client.execute({
      sql: `SELECT * FROM scheduled_event
         WHERE status = 'active'
           AND fire_at <= ?
           AND (lease_until IS NULL OR lease_until <= ?)
         ORDER BY fire_at ASC`,
      args: [now, now],
    });
    const dueRows = dueResult.rows as unknown as EventRow[];

    const claimed: ScheduledEvent[] = [];
    for (const row of dueRows) {
      const result = await this.client.execute({
        sql: `UPDATE scheduled_event
           SET lease_until = ?, updated_at = ?
           WHERE id = ?
             AND status = 'active'
             AND fire_at <= ?
             AND (lease_until IS NULL OR lease_until <= ?)`,
        args: [leaseUntil, now, row.id, now, now],
      });
      if (result.rowsAffected === 1) {
        claimed.push(
          mapEventRow({ ...row, lease_until: leaseUntil, updated_at: now }),
        );
      }
    }
    return claimed;
  }

  async releaseLease(eventId: string, now: number): Promise<void> {
    await this.client.execute({
      sql: "UPDATE scheduled_event SET lease_until = NULL, updated_at = ? WHERE id = ?",
      args: [now, eventId],
    });
  }

  async setEventFireAt(
    eventId: string,
    fireAt: number,
    now: number,
  ): Promise<ScheduledEvent | null> {
    await this.client.execute({
      sql: "UPDATE scheduled_event SET fire_at = ?, updated_at = ? WHERE id = ?",
      args: [fireAt, now, eventId],
    });
    return this.getEvent(eventId);
  }

  async advanceEvent(
    eventId: string,
    next: { nextFireAt: number } | { completed: true },
    now: number,
  ): Promise<ScheduledEvent | null> {
    if ("completed" in next) {
      await this.client.execute({
        sql: `UPDATE scheduled_event
           SET status = 'completed', lease_until = NULL, updated_at = ?
           WHERE id = ?`,
        args: [now, eventId],
      });
    } else {
      await this.client.execute({
        sql: `UPDATE scheduled_event
           SET fire_at = ?, lease_until = NULL, updated_at = ?
           WHERE id = ?`,
        args: [next.nextFireAt, now, eventId],
      });
    }
    return this.getEvent(eventId);
  }

  async hasRunningRun(eventId: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: "SELECT COUNT(*) AS count FROM scheduled_run WHERE event_id = ? AND status = 'running'",
      args: [eventId],
    });
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async createRun(input: {
    id: string;
    eventId: string;
    scheduledFor: number;
    startedAt: number;
    model: string;
    attempt: number;
  }): Promise<ScheduledRun> {
    await this.client.execute({
      sql: `INSERT INTO scheduled_run (
          id, event_id, scheduled_for, started_at, finished_at,
          status, model, transcript, error, attempt
        ) VALUES (?, ?, ?, ?, NULL, 'running', ?, '', NULL, ?)`,
      args: [
        input.id,
        input.eventId,
        input.scheduledFor,
        input.startedAt,
        input.model,
        input.attempt,
      ],
    });
    return (await this.getRun(input.id))!;
  }

  async appendTranscript(runId: string, chunk: string): Promise<void> {
    if (!chunk) {
      return;
    }
    await this.client.execute({
      sql: "UPDATE scheduled_run SET transcript = transcript || ? WHERE id = ?",
      args: [chunk, runId],
    });
  }

  async markRunDeliverFallback(runId: string): Promise<void> {
    await this.client.execute({
      sql: "UPDATE scheduled_run SET deliver_fallback = 1 WHERE id = ?",
      args: [runId],
    });
  }

  async finishRun(
    runId: string,
    status: Exclude<ScheduledRunStatus, "running">,
    finishedAt: number,
    error?: string,
  ): Promise<ScheduledRun | null> {
    await this.client.execute({
      sql: "UPDATE scheduled_run SET status = ?, finished_at = ?, error = ? WHERE id = ?",
      args: [status, finishedAt, error ?? null, runId],
    });
    return this.getRun(runId);
  }

  async getRun(runId: string): Promise<ScheduledRun | null> {
    const result = await this.client.execute({
      sql: "SELECT * FROM scheduled_run WHERE id = ?",
      args: [runId],
    });
    const row = result.rows[0];
    return row ? mapRunRow(row as unknown as RunRow) : null;
  }

  async getRunWithEvent(
    runId: string,
  ): Promise<{ run: ScheduledRun; event: ScheduledEvent } | null> {
    const run = await this.getRun(runId);
    if (!run) {
      return null;
    }
    const event = await this.getEvent(run.eventId);
    if (!event) {
      return null;
    }
    return { run, event };
  }

  async listRuns(
    filters: ListRunsFilters,
  ): Promise<{ runs: ScheduledRunSummary[]; total: number }> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filters.eventId) {
      clauses.push("r.event_id = ?");
      params.push(filters.eventId);
    }
    if (filters.agentId) {
      clauses.push("e.agent_id = ?");
      params.push(filters.agentId);
    }
    if (filters.status) {
      clauses.push("r.status = ?");
      params.push(filters.status);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const totalResult = await this.client.execute({
      sql: `SELECT COUNT(*) AS count
         FROM scheduled_run r
         JOIN scheduled_event e ON e.id = r.event_id
         ${where}`,
      args: params,
    });

    const rowsResult = await this.client.execute({
      sql: `SELECT r.*, e.agent_id, e.prompt, e.cron, e.internal_only,
                e.deliver_channel, e.deliver_thread_id
         FROM scheduled_run r
         JOIN scheduled_event e ON e.id = r.event_id
         ${where}
         ORDER BY r.started_at DESC
         LIMIT ? OFFSET ?`,
      args: [...params, filters.limit, filters.offset],
    });

    const rows = rowsResult.rows as unknown as Array<
      RunRow & {
        agent_id: string;
        prompt: string;
        cron: string | null;
        internal_only: number;
        deliver_channel: string | null;
        deliver_thread_id: string | null;
        deliver_bot_id: string | null;
      }
    >;

    return {
      runs: rows.map((row) => ({
        ...mapRunRow(row),
        agentId: row.agent_id,
        prompt: row.prompt,
        cron: row.cron ?? undefined,
        internalOnly: row.internal_only === 1,
        deliverTo: row.deliver_channel?.trim()
          ? {
              channel: row.deliver_channel.trim(),
              threadId: row.deliver_thread_id?.trim() || undefined,
              botId: row.deliver_bot_id?.trim() || undefined,
            }
          : undefined,
      })),
      total: Number(totalResult.rows[0]?.count ?? 0),
    };
  }

  async listDistinctAgentIds(): Promise<string[]> {
    const result = await this.client.execute(
      "SELECT DISTINCT agent_id FROM scheduled_event ORDER BY agent_id ASC",
    );
    return result.rows.map((row) => String(row.agent_id));
  }

  async recoverStaleLeases(now: number): Promise<number> {
    const staleResult = await this.client.execute({
      sql: "SELECT id FROM scheduled_event WHERE lease_until IS NOT NULL AND lease_until <= ?",
      args: [now],
    });
    const staleEvents = staleResult.rows as unknown as Array<{ id: string }>;

    if (staleEvents.length === 0) {
      return 0;
    }

    for (const event of staleEvents) {
      await this.client.execute({
        sql: "UPDATE scheduled_event SET lease_until = NULL, updated_at = ? WHERE id = ?",
        args: [now, event.id],
      });

      await this.client.execute({
        sql: `UPDATE scheduled_run
           SET status = 'interrupted', finished_at = ?, error = ?
           WHERE event_id = ? AND status = 'running'`,
        args: [now, "scheduler lease expired", event.id],
      });
    }

    return staleEvents.length;
  }

  async applyMissedPolicy(now: number): Promise<number> {
    const overdueResult = await this.client.execute({
      sql: `SELECT * FROM scheduled_event
         WHERE status = 'active' AND fire_at < ?`,
      args: [now],
    });
    const overdue = overdueResult.rows as unknown as EventRow[];

    let adjusted = 0;
    for (const row of overdue) {
      if (row.missed_policy === "skip" && row.cron) {
        const nextFireAt = computeNextFireAt(row.cron, row.timezone, now);
        await this.client.execute({
          sql: "UPDATE scheduled_event SET fire_at = ?, updated_at = ? WHERE id = ?",
          args: [nextFireAt, now, row.id],
        });
        adjusted += 1;
      }
    }
    return adjusted;
  }

  async countConsecutiveFailures(eventId: string): Promise<number> {
    const result = await this.client.execute({
      sql: `SELECT status FROM scheduled_run
         WHERE event_id = ?
         ORDER BY started_at DESC`,
      args: [eventId],
    });
    const rows = result.rows as unknown as Array<{ status: ScheduledRunStatus }>;

    let count = 0;
    for (const row of rows) {
      if (row.status === "succeeded") {
        break;
      }
      if (row.status === "failed" || row.status === "interrupted") {
        count += 1;
      }
    }
    return count;
  }
}

function mapEventRow(row: EventRow): ScheduledEvent {
  const deliverChannel = row.deliver_channel?.trim();
  return {
    id: row.id,
    agentId: row.agent_id,
    model: row.model,
    prompt: row.prompt,
    cron: row.cron ?? undefined,
    fireAt: row.fire_at,
    timezone: row.timezone,
    missedPolicy: row.missed_policy,
    status: row.status,
    leaseUntil: row.lease_until ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    internalOnly: row.internal_only === 1,
    deliverTo: deliverChannel
      ? {
          channel: deliverChannel,
          threadId: row.deliver_thread_id?.trim() || undefined,
          botId: row.deliver_bot_id?.trim() || undefined,
        }
      : undefined,
  };
}

function mapRunRow(row: RunRow): ScheduledRun {
  return {
    id: row.id,
    eventId: row.event_id,
    scheduledFor: row.scheduled_for,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    status: row.status,
    model: row.model,
    transcript: row.transcript,
    error: row.error ?? undefined,
    attempt: row.attempt,
    deliverFallback: row.deliver_fallback === 1,
  };
}

async function connectWithRetry(
  dbUrl: string,
  connect: () => Promise<void>,
): Promise<void> {
  const isRemote =
    dbUrl.startsWith("http://") || dbUrl.startsWith("https://");
  const maxAttempts = isRemote ? 30 : 1;
  const delayMs = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await connect();
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureFileDbDir(dbUrl: string): void {
  if (!dbUrl.startsWith("file:")) {
    return;
  }

  const filePath = dbUrl.slice("file:".length);
  if (filePath === ":memory:" || filePath.startsWith(":memory:")) {
    return;
  }

  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}
