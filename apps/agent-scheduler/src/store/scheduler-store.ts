import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  MissedFirePolicy,
  ScheduledEvent,
  ScheduledEventStatus,
  ScheduledRun,
  ScheduledRunStatus,
  ScheduledRunSummary,
} from "@digital-worker/agent-scheduler-protocol";

import { computeNextFireAt } from "../cron.js";

const SCHEMA_VERSION = 2;

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

export class SchedulerStore {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "scheduler.db");
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
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
      );
      CREATE INDEX IF NOT EXISTS idx_event_due
        ON scheduled_event (status, fire_at);
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
      );
      CREATE INDEX IF NOT EXISTS idx_run_event
        ON scheduled_run (event_id, started_at);
    `);

    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    const version = row ? Number(row.value) : 0;
    if (version < SCHEMA_VERSION) {
      this.migrateSchema(version);
      this.db
        .prepare(
          "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
        )
        .run(String(SCHEMA_VERSION));
    }
  }

  private migrateSchema(fromVersion: number): void {
    if (fromVersion < 2) {
      this.addColumnIfMissing("scheduled_event", "internal_only", "INTEGER NOT NULL DEFAULT 0");
      this.addColumnIfMissing("scheduled_event", "deliver_channel", "TEXT");
      this.addColumnIfMissing("scheduled_event", "deliver_thread_id", "TEXT");
      this.addColumnIfMissing(
        "scheduled_run",
        "deliver_fallback",
        "INTEGER NOT NULL DEFAULT 0",
      );
    }
  }

  private addColumnIfMissing(
    table: string,
    column: string,
    definition: string,
  ): void {
    const columns = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>;
    if (columns.some((entry) => entry.name === column)) {
      return;
    }
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  createEvent(input: CreateEventInput): ScheduledEvent {
    this.db
      .prepare(
        `INSERT INTO scheduled_event (
          id, agent_id, model, prompt, cron, fire_at, timezone,
          missed_policy, status, lease_until, created_by, created_at, updated_at,
          internal_only, deliver_channel, deliver_thread_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      );
    return this.getEvent(input.id)!;
  }

  getEvent(eventId: string): ScheduledEvent | null {
    const row = this.db
      .prepare("SELECT * FROM scheduled_event WHERE id = ?")
      .get(eventId) as EventRow | undefined;
    return row ? mapEventRow(row) : null;
  }

  listEvents(filters: ListEventsFilters = {}): ScheduledEvent[] {
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
    const rows = this.db
      .prepare(
        `SELECT * FROM scheduled_event ${where} ORDER BY fire_at ASC, created_at ASC`,
      )
      .all(...params) as EventRow[];
    return rows.map(mapEventRow);
  }

  cancelEvent(eventId: string, now: number): ScheduledEvent | null {
    const existing = this.getEvent(eventId);
    if (!existing) {
      return null;
    }
    this.db
      .prepare(
        "UPDATE scheduled_event SET status = 'cancelled', lease_until = NULL, updated_at = ? WHERE id = ?",
      )
      .run(now, eventId);
    return this.getEvent(eventId);
  }

  pauseEvent(eventId: string, now: number): ScheduledEvent | null {
    const existing = this.getEvent(eventId);
    if (!existing || existing.status !== "active") {
      return existing;
    }
    this.db
      .prepare(
        "UPDATE scheduled_event SET status = 'paused', lease_until = NULL, updated_at = ? WHERE id = ?",
      )
      .run(now, eventId);
    return this.getEvent(eventId);
  }

  resumeEvent(eventId: string, nextFireAt: number, now: number): ScheduledEvent | null {
    const existing = this.getEvent(eventId);
    if (!existing || existing.status !== "paused") {
      return existing;
    }
    this.db
      .prepare(
        `UPDATE scheduled_event
         SET status = 'active', fire_at = ?, lease_until = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(nextFireAt, now, eventId);
    return this.getEvent(eventId);
  }

  claimDueEvents(now: number, leaseMs: number): ScheduledEvent[] {
    const leaseUntil = now + leaseMs;
    const dueRows = this.db
      .prepare(
        `SELECT * FROM scheduled_event
         WHERE status = 'active'
           AND fire_at <= ?
           AND (lease_until IS NULL OR lease_until <= ?)
         ORDER BY fire_at ASC`,
      )
      .all(now, now) as EventRow[];

    const claimed: ScheduledEvent[] = [];
    for (const row of dueRows) {
      const result = this.db
        .prepare(
          `UPDATE scheduled_event
           SET lease_until = ?, updated_at = ?
           WHERE id = ?
             AND status = 'active'
             AND fire_at <= ?
             AND (lease_until IS NULL OR lease_until <= ?)`,
        )
        .run(leaseUntil, now, row.id, now, now);
      if (result.changes === 1) {
        claimed.push(mapEventRow({ ...row, lease_until: leaseUntil, updated_at: now }));
      }
    }
    return claimed;
  }

  releaseLease(eventId: string, now: number): void {
    this.db
      .prepare(
        "UPDATE scheduled_event SET lease_until = NULL, updated_at = ? WHERE id = ?",
      )
      .run(now, eventId);
  }

  setEventFireAt(eventId: string, fireAt: number, now: number): ScheduledEvent | null {
    this.db
      .prepare(
        "UPDATE scheduled_event SET fire_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(fireAt, now, eventId);
    return this.getEvent(eventId);
  }

  advanceEvent(
    eventId: string,
    next: { nextFireAt: number } | { completed: true },
    now: number,
  ): ScheduledEvent | null {
    if ("completed" in next) {
      this.db
        .prepare(
          `UPDATE scheduled_event
           SET status = 'completed', lease_until = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(now, eventId);
    } else {
      this.db
        .prepare(
          `UPDATE scheduled_event
           SET fire_at = ?, lease_until = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(next.nextFireAt, now, eventId);
    }
    return this.getEvent(eventId);
  }

  hasRunningRun(eventId: string): boolean {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM scheduled_run WHERE event_id = ? AND status = 'running'",
      )
      .get(eventId) as { count: number };
    return row.count > 0;
  }

  createRun(input: {
    id: string;
    eventId: string;
    scheduledFor: number;
    startedAt: number;
    model: string;
    attempt: number;
  }): ScheduledRun {
    this.db
      .prepare(
        `INSERT INTO scheduled_run (
          id, event_id, scheduled_for, started_at, finished_at,
          status, model, transcript, error, attempt
        ) VALUES (?, ?, ?, ?, NULL, 'running', ?, '', NULL, ?)`,
      )
      .run(
        input.id,
        input.eventId,
        input.scheduledFor,
        input.startedAt,
        input.model,
        input.attempt,
      );
    return this.getRun(input.id)!;
  }

  appendTranscript(runId: string, chunk: string): void {
    if (!chunk) {
      return;
    }
    this.db
      .prepare(
        "UPDATE scheduled_run SET transcript = transcript || ? WHERE id = ?",
      )
      .run(chunk, runId);
  }

  markRunDeliverFallback(runId: string): void {
    this.db
      .prepare("UPDATE scheduled_run SET deliver_fallback = 1 WHERE id = ?")
      .run(runId);
  }

  finishRun(
    runId: string,
    status: Exclude<ScheduledRunStatus, "running">,
    finishedAt: number,
    error?: string,
  ): ScheduledRun | null {
    this.db
      .prepare(
        "UPDATE scheduled_run SET status = ?, finished_at = ?, error = ? WHERE id = ?",
      )
      .run(status, finishedAt, error ?? null, runId);
    return this.getRun(runId);
  }

  getRun(runId: string): ScheduledRun | null {
    const row = this.db
      .prepare("SELECT * FROM scheduled_run WHERE id = ?")
      .get(runId) as RunRow | undefined;
    return row ? mapRunRow(row) : null;
  }

  getRunWithEvent(runId: string): { run: ScheduledRun; event: ScheduledEvent } | null {
    const run = this.getRun(runId);
    if (!run) {
      return null;
    }
    const event = this.getEvent(run.eventId);
    if (!event) {
      return null;
    }
    return { run, event };
  }

  listRuns(filters: ListRunsFilters): { runs: ScheduledRunSummary[]; total: number } {
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
    const totalRow = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM scheduled_run r
         JOIN scheduled_event e ON e.id = r.event_id
         ${where}`,
      )
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT r.*, e.agent_id, e.prompt, e.cron, e.internal_only,
                e.deliver_channel, e.deliver_thread_id
         FROM scheduled_run r
         JOIN scheduled_event e ON e.id = r.event_id
         ${where}
         ORDER BY r.started_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, filters.limit, filters.offset) as Array<
      RunRow & {
        agent_id: string;
        prompt: string;
        cron: string | null;
        internal_only: number;
        deliver_channel: string | null;
        deliver_thread_id: string | null;
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
            }
          : undefined,
      })),
      total: totalRow.count,
    };
  }

  listDistinctAgentIds(): string[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT agent_id FROM scheduled_event ORDER BY agent_id ASC",
      )
      .all() as Array<{ agent_id: string }>;
    return rows.map((row) => row.agent_id);
  }

  recoverStaleLeases(now: number): number {
    const staleEvents = this.db
      .prepare(
        "SELECT id FROM scheduled_event WHERE lease_until IS NOT NULL AND lease_until <= ?",
      )
      .all(now) as Array<{ id: string }>;

    if (staleEvents.length === 0) {
      return 0;
    }

    for (const event of staleEvents) {
      this.db
        .prepare(
          "UPDATE scheduled_event SET lease_until = NULL, updated_at = ? WHERE id = ?",
        )
        .run(now, event.id);

      this.db
        .prepare(
          `UPDATE scheduled_run
           SET status = 'interrupted', finished_at = ?, error = ?
           WHERE event_id = ? AND status = 'running'`,
        )
        .run(now, "scheduler lease expired", event.id);
    }

    return staleEvents.length;
  }

  applyMissedPolicy(now: number): number {
    const overdue = this.db
      .prepare(
        `SELECT * FROM scheduled_event
         WHERE status = 'active' AND fire_at < ?`,
      )
      .all(now) as EventRow[];

    let adjusted = 0;
    for (const row of overdue) {
      if (row.missed_policy === "skip" && row.cron) {
        const nextFireAt = computeNextFireAt(row.cron, row.timezone, now);
        this.db
          .prepare(
            "UPDATE scheduled_event SET fire_at = ?, updated_at = ? WHERE id = ?",
          )
          .run(nextFireAt, now, row.id);
        adjusted += 1;
      }
      // fire-once: leave fire_at unchanged so the next tick fires once.
    }
    return adjusted;
  }

  /**
   * Failed or interrupted runs since the most recent success (newest first).
   * Used for retry backoff — recurring events reset after each success.
   */
  countConsecutiveFailures(eventId: string): number {
    const rows = this.db
      .prepare(
        `SELECT status FROM scheduled_run
         WHERE event_id = ?
         ORDER BY started_at DESC`,
      )
      .all(eventId) as Array<{ status: ScheduledRunStatus }>;

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
