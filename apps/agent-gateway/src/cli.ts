import { Command } from "commander";

import { userArgv } from "./user-argv.js";
import { loadTelegramBots, parseAllowedChatIds } from "./telegram/load-bots.js";
import type { TelegramBotDefinition } from "./telegram/bot-registry.js";

export type GatewayOptions = {
  host: string;
  port: number;
  telegramBots: TelegramBotDefinition[];
  allowedChatIds: Set<string>;
  dbUrl: string;
  dbAuthToken?: string;
  legacyDataDir?: string;
  renotifyIntervalMs: number;
  useNotifyEndpoint: boolean;
};

export function parseCli(argv: readonly string[] = process.argv): GatewayOptions {
  const program = new Command()
    .name("agent-gateway")
    .description("Channel gateway for digital worker agents")
    .option("-H, --host <host>", "bind host", "127.0.0.1")
    .option("-p, --port <port>", "HTTP port", "3002")
    .option(
      "--telegram-allowed-chat-ids <ids>",
      "comma-separated allowed chat IDs (or TELEGRAM_ALLOWED_CHAT_IDS env)",
    )
    .option(
      "--telegram-bots-file <path>",
      "JSON file listing telegram bots (or GATEWAY_TELEGRAM_BOTS_FILE env)",
    )
    .option(
      "--telegram-bots <json>",
      "JSON array of telegram bots (or GATEWAY_TELEGRAM_BOTS env)",
    )
    .option(
      "--db-url <url>",
      "libSQL database URL (or LIBSQL_URL / GATEWAY_DB_URL env)",
      process.env.LIBSQL_URL ??
        process.env.GATEWAY_DB_URL ??
        "file:./data/agent-gateway/gateway.db",
    )
    .option(
      "--legacy-data-dir <path>",
      "import legacy state.json from this directory when the target store is empty",
      process.env.GATEWAY_LEGACY_DATA_DIR,
    )
    .option(
      "--renotify-interval-ms <ms>",
      "re-notify interval when unread messages remain",
      process.env.GATEWAY_RENOTIFY_INTERVAL_MS ?? String(5 * 60 * 1000),
    )
    .option(
      "--use-notify-endpoint",
      "use POST /api/v1/notify instead of /api/v1/chat",
      process.env.GATEWAY_USE_NOTIFY === "true",
    );

  program.parse(userArgv(argv), { from: "user" });

  const opts = program.opts<{
    host: string;
    port: string;
    telegramAllowedChatIds?: string;
    telegramBotsFile?: string;
    telegramBots?: string;
    dbUrl: string;
    legacyDataDir?: string;
    renotifyIntervalMs: string;
    useNotifyEndpoint?: boolean;
  }>();

  const port = Number(opts.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    program.error(`invalid port: ${opts.port}`);
  }

  const chatIdsRaw =
    opts.telegramAllowedChatIds?.trim() ||
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim();
  if (!chatIdsRaw) {
    program.error(
      "allowed chat ids are required (--telegram-allowed-chat-ids or TELEGRAM_ALLOWED_CHAT_IDS)",
    );
  }

  const allowedChatIds = parseAllowedChatIds(chatIdsRaw!);
  if (allowedChatIds.size === 0) {
    program.error("at least one allowed chat id is required");
  }

  const telegramBots = loadTelegramBots(program, allowedChatIds, {
    botsFile: opts.telegramBotsFile,
    botsJson: opts.telegramBots,
  });

  const renotifyIntervalMs = Number(opts.renotifyIntervalMs);
  if (!Number.isInteger(renotifyIntervalMs) || renotifyIntervalMs < 0) {
    program.error(`invalid renotify-interval-ms: ${opts.renotifyIntervalMs}`);
  }

  const dbUrl = opts.dbUrl.trim();
  if (!dbUrl) {
    program.error("db-url is required (--db-url or LIBSQL_URL)");
  }

  const dbAuthToken = process.env.LIBSQL_AUTH_TOKEN?.trim() || undefined;
  const legacyDataDir = opts.legacyDataDir?.trim() || undefined;

  return {
    host: opts.host,
    port,
    telegramBots,
    allowedChatIds,
    dbUrl,
    dbAuthToken,
    legacyDataDir,
    renotifyIntervalMs,
    useNotifyEndpoint: opts.useNotifyEndpoint === true,
  };
}
