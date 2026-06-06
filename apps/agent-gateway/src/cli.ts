import { Command } from "commander";

import { userArgv } from "./user-argv.js";

export type GatewayOptions = {
  host: string;
  port: number;
  agentCoreUrl: string;
  telegramToken: string;
  allowedChatIds: Set<string>;
  dataDir: string;
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
      "--agent-core-url <url>",
      "agent-core base URL",
      process.env.AGENT_CORE_URL ?? "http://127.0.0.1:3000",
    )
    .option(
      "--telegram-token <token>",
      "Telegram bot token (or TELEGRAM_BOT_TOKEN env)",
    )
    .option(
      "--telegram-allowed-chat-ids <ids>",
      "comma-separated allowed chat IDs (or TELEGRAM_ALLOWED_CHAT_IDS env)",
    )
    .option(
      "--data-dir <path>",
      "directory for persisted mailbox state",
      process.env.GATEWAY_DATA_DIR ?? "./data/agent-gateway",
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
    agentCoreUrl: string;
    telegramToken?: string;
    telegramAllowedChatIds?: string;
    dataDir: string;
    renotifyIntervalMs: string;
    useNotifyEndpoint?: boolean;
  }>();

  const port = Number(opts.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    program.error(`invalid port: ${opts.port}`);
  }

  try {
    new URL(opts.agentCoreUrl);
  } catch {
    program.error(`invalid agent-core-url: ${opts.agentCoreUrl}`);
  }

  const telegramToken =
    opts.telegramToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!telegramToken) {
    program.error(
      "telegram token is required (--telegram-token or TELEGRAM_BOT_TOKEN)",
    );
  }

  const chatIdsRaw =
    opts.telegramAllowedChatIds?.trim() ||
    process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim();
  if (!chatIdsRaw) {
    program.error(
      "allowed chat ids are required (--telegram-allowed-chat-ids or TELEGRAM_ALLOWED_CHAT_IDS)",
    );
  }

  const resolvedToken = telegramToken!;
  const resolvedChatIds = chatIdsRaw!;

  const allowedChatIds = new Set(
    resolvedChatIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
  if (allowedChatIds.size === 0) {
    program.error("at least one allowed chat id is required");
  }

  const renotifyIntervalMs = Number(opts.renotifyIntervalMs);
  if (!Number.isInteger(renotifyIntervalMs) || renotifyIntervalMs < 0) {
    program.error(`invalid renotify-interval-ms: ${opts.renotifyIntervalMs}`);
  }

  return {
    host: opts.host,
    port,
    agentCoreUrl: opts.agentCoreUrl,
    telegramToken: resolvedToken,
    allowedChatIds,
    dataDir: opts.dataDir,
    renotifyIntervalMs,
    useNotifyEndpoint: opts.useNotifyEndpoint === true,
  };
}
