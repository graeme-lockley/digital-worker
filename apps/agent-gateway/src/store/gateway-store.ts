import { mkdirSync } from "node:fs";
import path from "node:path";

import type {
  CorrelationEntry,
  InboundMessage,
} from "@digital-worker/agent-gateway-protocol";
import { type Client, createClient } from "@libsql/client";

import { migrateLegacyGatewayState } from "./migrate-legacy-store.js";

const SCHEMA_VERSION = 2;
const META_TELEGRAM_OFFSET_PREFIX = "telegram_offset:";
const META_TELEGRAM_OFFSET_LEGACY = "telegram_offset";
const META_LEGACY_OFFSET_KEY = "__legacy__";
const META_SCHEMA_VERSION = "schema_version";

export const DEFAULT_READ_MESSAGE_RETENTION_DAYS = 30;

export type GatewayBootstrap = {
  messages: InboundMessage[];
  correlations: Record<string, CorrelationEntry>;
  telegramOffsets: Record<string, number>;
};

export type GatewayStoreOptions = {
  authToken?: string;
  /** When set, import `{dir}/state.json` if the target store is empty. */
  legacyDataDir?: string;
};

export class GatewayStore {
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(private readonly client: Client) {}

  static async create(
    dbUrl: string,
    options: GatewayStoreOptions = {},
  ): Promise<GatewayStore> {
    ensureFileDbDir(dbUrl);
    const client = createClient({
      url: dbUrl,
      authToken: options.authToken,
    });
    const store = new GatewayStore(client);
    await connectWithRetry(dbUrl, () => store.initSchema());
    if (options.legacyDataDir) {
      const migrated = await migrateLegacyGatewayState(client, options.legacyDataDir);
      if (migrated > 0) {
        console.log(`migrated ${migrated} gateway message(s) from legacy state.json`);
      }
    }
    return store;
  }

  async close(): Promise<void> {
    await this.writeChain;
    this.client.close();
  }

  private async initSchema(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS gateway_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS gateway_message (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        thread_id TEXT,
        received_at TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0
      )
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_gateway_message_unread
        ON gateway_message (read, received_at)
    `);
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS gateway_correlation (
        correlation_id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        bot_id TEXT
      )
    `);

    const row = await this.client.execute({
      sql: "SELECT value FROM gateway_meta WHERE key = ?",
      args: [META_SCHEMA_VERSION],
    });
    const version = row.rows[0] ? Number(row.rows[0].value) : 0;
    if (version < 2) {
      await this.migrateToV2(version);
    }
    if (version < SCHEMA_VERSION) {
      await this.client.execute({
        sql: "INSERT OR REPLACE INTO gateway_meta (key, value) VALUES (?, ?)",
        args: [META_SCHEMA_VERSION, String(SCHEMA_VERSION)],
      });
    }
  }

  private async migrateToV2(fromVersion: number): Promise<void> {
    await this.client.execute(`
      ALTER TABLE gateway_message ADD COLUMN bot_id TEXT
    `).catch(() => {
      /* column may already exist */
    });
    await this.client.execute(`
      ALTER TABLE gateway_correlation ADD COLUMN bot_id TEXT
    `).catch(() => {
      /* column may already exist */
    });

    if (fromVersion < 1) {
      return;
    }

    /* bot_id backfill for legacy rows is applied at runtime via GATEWAY_LEGACY_BOT_ID */
  }

  async loadBootstrap(): Promise<GatewayBootstrap> {
    const messageResult = await this.client.execute(
      "SELECT * FROM gateway_message ORDER BY received_at ASC",
    );
    const messages = messageResult.rows.map((row) => mapMessageRow(row));

    const correlationResult = await this.client.execute(
      "SELECT * FROM gateway_correlation",
    );
    const correlations: Record<string, CorrelationEntry> = {};
    for (const row of correlationResult.rows) {
      correlations[String(row.correlation_id)] = {
        channel: String(row.channel),
        threadId: String(row.thread_id),
        sender: String(row.sender),
        botId:
          row.bot_id == null || row.bot_id === ""
            ? undefined
            : String(row.bot_id),
      };
    }

    const offsetResult = await this.client.execute({
      sql: "SELECT key, value FROM gateway_meta WHERE key LIKE ?",
      args: [`${META_TELEGRAM_OFFSET_PREFIX}%`],
    });
    const telegramOffsets: Record<string, number> = {};
    for (const row of offsetResult.rows) {
      const key = String(row.key);
      const botId = key.slice(META_TELEGRAM_OFFSET_PREFIX.length);
      telegramOffsets[botId] = Number(row.value);
    }

    if (Object.keys(telegramOffsets).length === 0) {
      const legacy = await this.client.execute({
        sql: "SELECT value FROM gateway_meta WHERE key = ?",
        args: [META_TELEGRAM_OFFSET_LEGACY],
      });
      if (legacy.rows[0]) {
        telegramOffsets[META_LEGACY_OFFSET_KEY] = Number(legacy.rows[0].value);
      }
    }

    return { messages, correlations, telegramOffsets };
  }

  async upsertMessage(message: InboundMessage): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.client.execute({
        sql: `
          INSERT INTO gateway_message (
            id, channel, bot_id, sender, text, thread_id, received_at, read
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            channel = excluded.channel,
            bot_id = excluded.bot_id,
            sender = excluded.sender,
            text = excluded.text,
            thread_id = excluded.thread_id,
            received_at = excluded.received_at,
            read = excluded.read
        `,
        args: [
          message.id,
          message.channel,
          message.botId ?? null,
          message.sender,
          message.text,
          message.threadId ?? null,
          message.receivedAt,
          message.read ? 1 : 0,
        ],
      });
    });
  }

  async markMessagesRead(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.enqueueWrite(async () => {
      for (const id of ids) {
        await this.client.execute({
          sql: "UPDATE gateway_message SET read = 1 WHERE id = ?",
          args: [id],
        });
      }
    });
  }

  async upsertCorrelation(
    correlationId: string,
    entry: CorrelationEntry,
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.client.execute({
        sql: `
          INSERT INTO gateway_correlation (
            correlation_id, channel, thread_id, sender, bot_id
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(correlation_id) DO UPDATE SET
            channel = excluded.channel,
            thread_id = excluded.thread_id,
            sender = excluded.sender,
            bot_id = excluded.bot_id
        `,
        args: [
          correlationId,
          entry.channel,
          entry.threadId,
          entry.sender,
          entry.botId ?? null,
        ],
      });
    });
  }

  async setTelegramOffset(botId: string, offset: number): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.client.execute({
        sql: "INSERT OR REPLACE INTO gateway_meta (key, value) VALUES (?, ?)",
        args: [`${META_TELEGRAM_OFFSET_PREFIX}${botId}`, String(offset)],
      });
    });
  }

  /** Deletes read messages with receivedAt older than retentionDays (default 30). */
  async pruneReadMessagesOlderThan(
    retentionDays: number = DEFAULT_READ_MESSAGE_RETENTION_DAYS,
  ): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      throw new Error(`invalid retention days: ${retentionDays}`);
    }

    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const result = await this.client.execute({
      sql: "DELETE FROM gateway_message WHERE read = 1 AND received_at < ?",
      args: [cutoff],
    });

    return result.rowsAffected ?? 0;
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    this.writeChain = this.writeChain.catch(() => {}).then(operation);
    await this.writeChain;
  }
}

function mapMessageRow(row: Record<string, unknown>): InboundMessage {
  return {
    id: String(row.id),
    channel: String(row.channel),
    botId:
      row.bot_id == null || row.bot_id === ""
        ? undefined
        : String(row.bot_id),
    sender: String(row.sender),
    text: String(row.text),
    threadId: row.thread_id == null ? undefined : String(row.thread_id),
    receivedAt: String(row.received_at),
    read: Number(row.read) === 1,
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
