import { Command } from "commander";

import { userArgv } from "./user-argv.js";

export type ServerOptions = {
  host: string;
  port: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  dbUrl: string;
  dbAuthToken?: string;
};

export function parseCli(argv: readonly string[] = process.argv): ServerOptions {
  const program = new Command()
    .name("agent-register")
    .description("Agent registration and discovery service")
    .option("-H, --host <host>", "bind host", "127.0.0.1")
    .option("-p, --port <port>", "HTTP port", "3001")
    .option(
      "--heartbeat-interval <ms>",
      "interval between heartbeat polls (ms)",
      "30000",
    )
    .option(
      "--heartbeat-timeout <ms>",
      "timeout per agent heartbeat request (ms)",
      "5000",
    )
    .option(
      "--db-url <url>",
      "libSQL database URL (or LIBSQL_URL env)",
      process.env.LIBSQL_URL ?? "file:./data/agent-register/register.db",
    );

  program.parse(userArgv(argv), { from: "user" });

  const opts = program.opts<{
    host: string;
    port: string;
    heartbeatInterval: string;
    heartbeatTimeout: string;
    dbUrl: string;
  }>();

  const port = parsePort(opts.port, program);
  const heartbeatIntervalMs = parsePositiveInt(
    opts.heartbeatInterval,
    "heartbeat-interval",
    program,
  );
  const heartbeatTimeoutMs = parsePositiveInt(
    opts.heartbeatTimeout,
    "heartbeat-timeout",
    program,
  );

  const dbUrl = opts.dbUrl.trim();
  if (!dbUrl) {
    program.error("db-url must not be empty");
  }

  const dbAuthToken = process.env.LIBSQL_AUTH_TOKEN?.trim() || undefined;

  return {
    host: opts.host,
    port,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    dbUrl,
    dbAuthToken,
  };
}

function parsePort(value: string, program: Command): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    program.error(`invalid port: ${value}`);
  }
  return port;
}

function parsePositiveInt(value: string, name: string, program: Command): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    program.error(`invalid ${name}: ${value}`);
  }
  return parsed;
}
