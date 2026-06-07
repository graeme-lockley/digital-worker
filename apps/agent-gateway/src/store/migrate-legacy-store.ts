import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type {
  CorrelationEntry,
  InboundMessage,
} from "@digital-worker/agent-gateway-protocol";
import { type Client } from "@libsql/client";

const LEGACY_STATE_FILE = "state.json";
const META_TELEGRAM_OFFSET = "telegram_offset";

type LegacyState = {
  messages?: InboundMessage[];
  telegramOffset?: number;
  correlations?: Record<string, CorrelationEntry>;
};

export async function migrateLegacyGatewayState(
  target: Client,
  legacyDataDir: string,
): Promise<number> {
  const legacyPath = path.join(legacyDataDir, LEGACY_STATE_FILE);
  try {
    await access(legacyPath);
  } catch {
    return 0;
  }

  const existing = await target.execute(
    "SELECT COUNT(*) AS count FROM gateway_message",
  );
  const count = Number(existing.rows[0]?.count ?? 0);
  if (count > 0) {
    return 0;
  }

  const raw = await readFile(legacyPath, "utf8");
  const state = JSON.parse(raw) as LegacyState;
  const messages = state.messages ?? [];
  const correlations = state.correlations ?? {};
  const telegramOffset = state.telegramOffset ?? 0;

  const statements: Array<{ sql: string; args: Array<string | number | null> }> =
    [];

  for (const message of messages) {
    statements.push({
      sql: `
        INSERT INTO gateway_message (
          id, channel, sender, text, thread_id, received_at, read
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        message.id,
        message.channel,
        message.sender,
        message.text,
        message.threadId ?? null,
        message.receivedAt,
        message.read ? 1 : 0,
      ],
    });
  }

  for (const [correlationId, entry] of Object.entries(correlations)) {
    statements.push({
      sql: `
        INSERT INTO gateway_correlation (
          correlation_id, channel, thread_id, sender
        ) VALUES (?, ?, ?, ?)
      `,
      args: [correlationId, entry.channel, entry.threadId, entry.sender],
    });
  }

  statements.push({
    sql: "INSERT OR REPLACE INTO gateway_meta (key, value) VALUES (?, ?)",
    args: [META_TELEGRAM_OFFSET, String(telegramOffset)],
  });

  if (statements.length === 0) {
    return 0;
  }

  await target.batch(statements, "write");
  return messages.length;
}
