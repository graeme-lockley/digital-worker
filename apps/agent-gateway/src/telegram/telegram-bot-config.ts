import { readFileSync } from "node:fs";

import type { Command } from "commander";

import type { TelegramBotDefinition } from "./bot-registry.js";

/** One Telegram bot route in GATEWAY_TELEGRAM_BOTS / gateway-telegram-bots.json */
export type TelegramBotConfigEntry = {
  botId: string;
  agentCoreUrl: string;
  /** Environment variable name holding the Bot API token (preferred). */
  tokenEnv?: string;
  /** Inline token (tests only — do not commit secrets). */
  token?: string;
};

const BOT_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/;

function readToken(...candidates: Array<string | undefined>): string | undefined {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}

function readConfigJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid ${label}: ${detail}`);
  }
}

function readConfigFile(path: string): unknown {
  try {
    return readConfigJson(readFileSync(path, "utf8"), `telegram bots file ${path}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid ")) {
      throw error;
    }
    throw new Error(`failed to read telegram bots file ${path}: ${String(error)}`);
  }
}

export function parseTelegramBotConfigEntries(raw: unknown): TelegramBotConfigEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("telegram bot config must be a JSON array");
  }

  const entries: TelegramBotConfigEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new Error("each telegram bot entry must be an object");
    }
    const record = item as Record<string, unknown>;
    const botId = String(record.botId ?? "").trim();
    const agentCoreUrl = String(record.agentCoreUrl ?? "").trim();
    const tokenEnv =
      record.tokenEnv == null ? undefined : String(record.tokenEnv).trim();
    const token = record.token == null ? undefined : String(record.token).trim();

    if (!botId || !BOT_ID_PATTERN.test(botId)) {
      throw new Error(
        `invalid botId "${botId}" (lowercase letters, digits, hyphens; 2–64 chars)`,
      );
    }
    if (!agentCoreUrl) {
      throw new Error(`botId "${botId}" requires agentCoreUrl`);
    }
    try {
      new URL(agentCoreUrl);
    } catch {
      throw new Error(`invalid agentCoreUrl for botId "${botId}": ${agentCoreUrl}`);
    }
    if (!token && !tokenEnv) {
      throw new Error(`botId "${botId}" requires tokenEnv or token`);
    }

    entries.push({ botId, agentCoreUrl, tokenEnv, token });
  }

  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.botId)) {
      throw new Error(`duplicate botId "${entry.botId}" in telegram bot config`);
    }
    ids.add(entry.botId);
  }

  return entries;
}

export function resolveTelegramBotDefinitions(
  entries: TelegramBotConfigEntry[],
  allowedChatIds: Set<string>,
): TelegramBotDefinition[] {
  const bots: TelegramBotDefinition[] = [];

  for (const entry of entries) {
    const token =
      entry.token ??
      (entry.tokenEnv ? readToken(process.env[entry.tokenEnv]) : undefined);
    if (!token) {
      throw new Error(
        `botId "${entry.botId}" token not set (configure tokenEnv ${entry.tokenEnv ?? "?"})`,
      );
    }
    bots.push({
      botId: entry.botId,
      token,
      agentCoreUrl: entry.agentCoreUrl,
      allowedChatIds,
    });
  }

  return bots;
}

export type LoadTelegramBotsOptions = {
  program: Command;
  allowedChatIds: Set<string>;
  botsFile?: string;
  botsJson?: string;
};

export function loadTelegramBotConfigSource(options: LoadTelegramBotsOptions): unknown {
  const filePath =
    options.botsFile?.trim() ||
    process.env.GATEWAY_TELEGRAM_BOTS_FILE?.trim();
  if (filePath) {
    return readConfigFile(filePath);
  }

  const jsonRaw =
    options.botsJson?.trim() || process.env.GATEWAY_TELEGRAM_BOTS?.trim();
  if (jsonRaw) {
    return readConfigJson(jsonRaw, "GATEWAY_TELEGRAM_BOTS");
  }

  return null;
}

/** Legacy single-bot env when no GATEWAY_TELEGRAM_BOTS* is configured. */
function legacySingleBotConfig(): TelegramBotConfigEntry[] | null {
  const token = readToken(
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_AIDADIGITALBOT_TOKEN,
    process.env.TELEGRAM_AIDADIGITALBOT_ID,
  );
  if (!token) {
    return null;
  }

  const agentCoreUrl =
    process.env.AGENT_CORE_URL?.trim() ||
    process.env.TELEGRAM_AIDADIGITALBOT_AGENT_CORE_URL?.trim() ||
    "http://127.0.0.1:3000";

  const botId =
    process.env.GATEWAY_DEFAULT_BOT_ID?.trim() ||
    process.env.TELEGRAM_BOT_ID?.trim() ||
    "default";

  return [{ botId, agentCoreUrl, token }];
}

export function loadTelegramBots(options: LoadTelegramBotsOptions): TelegramBotDefinition[] {
  const { program, allowedChatIds } = options;

  try {
    let raw = loadTelegramBotConfigSource(options);
    if (raw == null) {
      raw = legacySingleBotConfig();
    }
    if (raw == null) {
      program.error(
        "telegram bot config required: set GATEWAY_TELEGRAM_BOTS_FILE or GATEWAY_TELEGRAM_BOTS (JSON array), or legacy TELEGRAM_BOT_TOKEN",
      );
    }

    const entries = parseTelegramBotConfigEntries(raw);
    if (entries.length === 0) {
      program.error("telegram bot config must include at least one bot");
    }

    return resolveTelegramBotDefinitions(entries, allowedChatIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    program.error(message);
    throw new Error(message);
  }
}

/** Map legacy bootstrap rows/offsets onto configured bots when botId was unknown. */
export function normalizeTelegramBootstrap(
  bootstrap: {
    messages: Array<{ botId?: string }>;
    correlations: Record<string, { botId?: string }>;
    telegramOffsets: Record<string, number>;
  },
  bots: TelegramBotDefinition[],
): {
  messages: Array<{ botId?: string }>;
  correlations: Record<string, { botId?: string }>;
  telegramOffsets: Record<string, number>;
} {
  const legacyBotId =
    process.env.GATEWAY_LEGACY_BOT_ID?.trim() || bots[0]?.botId;
  if (!legacyBotId) {
    return bootstrap;
  }

  const messages = bootstrap.messages.map((message) =>
    message.botId ? message : { ...message, botId: legacyBotId },
  );

  const correlations: Record<string, { botId?: string }> = {};
  for (const [id, entry] of Object.entries(bootstrap.correlations)) {
    correlations[id] = entry.botId ? entry : { ...entry, botId: legacyBotId };
  }

  const telegramOffsets = { ...bootstrap.telegramOffsets };
  const legacyOffset = telegramOffsets.__legacy__;
  if (legacyOffset !== undefined && telegramOffsets[legacyBotId] === undefined) {
    telegramOffsets[legacyBotId] = legacyOffset;
  }
  delete telegramOffsets.__legacy__;

  return { messages, correlations, telegramOffsets };
}
