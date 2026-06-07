import { Command } from "commander";

import { userArgv } from "./user-argv.js";

export type SchedulerOptions = {
  host: string;
  port: number;
  dataDir: string;
  registerUrl: string;
  tickIntervalMs: number;
  leaseMs: number;
  clientId: string;
  chatTimeoutMs: number;
  /** agent-gateway base URL for fallback outbound delivery. */
  gatewayUrl?: string;
};

export function parseCli(argv: readonly string[] = process.argv): SchedulerOptions {
  const program = new Command()
    .name("agent-scheduler")
    .description("Durable agent event scheduler")
    .option("-H, --host <host>", "bind host", "127.0.0.1")
    .option("-p, --port <port>", "HTTP port", "3003")
    .option(
      "--data-dir <path>",
      "directory for SQLite scheduler database",
      process.env.SCHEDULER_DATA_DIR ?? "./data/agent-scheduler",
    )
    .option(
      "--register-url <url>",
      "agent-register base URL",
      process.env.AGENT_REGISTER_URL ?? "http://127.0.0.1:3001",
    )
    .option(
      "--tick-interval-ms <ms>",
      "scheduler tick interval",
      process.env.SCHEDULER_TICK_INTERVAL_MS ?? "1000",
    )
    .option(
      "--lease-ms <ms>",
      "event lease duration while firing",
      process.env.SCHEDULER_LEASE_MS ?? "120000",
    )
    .option(
      "--client-id <id>",
      "client id for chat fire requests",
      process.env.SCHEDULER_CLIENT_ID ?? "agent-scheduler",
    )
    .option(
      "--chat-timeout-ms <ms>",
      "timeout for chat fire SSE stream",
      process.env.SCHEDULER_CHAT_TIMEOUT_MS ?? String(30 * 60 * 1000),
    )
    .option(
      "--gateway-url <url>",
      "agent-gateway base URL for fallback Telegram delivery (or GATEWAY_URL env)",
    );

  program.parse(userArgv(argv), { from: "user" });

  const opts = program.opts<{
    host: string;
    port: string;
    dataDir: string;
    registerUrl: string;
    tickIntervalMs: string;
    leaseMs: string;
    clientId: string;
    chatTimeoutMs: string;
    gatewayUrl?: string;
  }>();

  const port = Number(opts.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    program.error(`invalid port: ${opts.port}`);
  }

  try {
    new URL(opts.registerUrl);
  } catch {
    program.error(`invalid register-url: ${opts.registerUrl}`);
  }

  const tickIntervalMs = Number(opts.tickIntervalMs);
  if (!Number.isInteger(tickIntervalMs) || tickIntervalMs < 100) {
    program.error(`invalid tick-interval-ms: ${opts.tickIntervalMs}`);
  }

  const leaseMs = Number(opts.leaseMs);
  if (!Number.isInteger(leaseMs) || leaseMs < 1000) {
    program.error(`invalid lease-ms: ${opts.leaseMs}`);
  }

  const chatTimeoutMs = Number(opts.chatTimeoutMs);
  if (!Number.isInteger(chatTimeoutMs) || chatTimeoutMs < 1000) {
    program.error(`invalid chat-timeout-ms: ${opts.chatTimeoutMs}`);
  }

  if (opts.gatewayUrl) {
    try {
      new URL(opts.gatewayUrl);
    } catch {
      program.error(`invalid gateway-url: ${opts.gatewayUrl}`);
    }
  }

  return {
    host: opts.host,
    port,
    dataDir: opts.dataDir,
    registerUrl: opts.registerUrl,
    tickIntervalMs,
    leaseMs,
    clientId: opts.clientId.trim() || "agent-scheduler",
    chatTimeoutMs,
    gatewayUrl:
      opts.gatewayUrl?.trim() || process.env.GATEWAY_URL?.trim() || undefined,
  };
}
