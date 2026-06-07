import { Command } from "commander";

import { DEFAULT_READ_MESSAGE_RETENTION_DAYS } from "./store/gateway-store.js";
import { userArgv } from "./user-argv.js";

export type PruneCliOptions = {
  dbUrl: string;
  dbAuthToken?: string;
  olderThanDays: number;
};

export function parsePruneCli(argv: readonly string[] = process.argv): PruneCliOptions {
  const program = new Command()
    .name("agent-gateway-prune")
    .description("Prune read gateway mailbox messages older than N days")
    .option(
      "--db-url <url>",
      "libSQL database URL (or LIBSQL_URL / GATEWAY_DB_URL env)",
      process.env.LIBSQL_URL ??
        process.env.GATEWAY_DB_URL ??
        "file:./data/agent-gateway/gateway.db",
    )
    .option(
      "--older-than-days <days>",
      "retention window for read messages",
      process.env.GATEWAY_PRUNE_READ_DAYS ??
        String(DEFAULT_READ_MESSAGE_RETENTION_DAYS),
    );

  program.parse(userArgv(argv), { from: "user" });

  const opts = program.opts<{ dbUrl: string; olderThanDays: string }>();
  const dbUrl = opts.dbUrl.trim();
  if (!dbUrl) {
    program.error("db-url is required (--db-url or LIBSQL_URL)");
  }

  const olderThanDays = Number(opts.olderThanDays);
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    program.error(`invalid older-than-days: ${opts.olderThanDays}`);
  }

  const dbAuthToken = process.env.LIBSQL_AUTH_TOKEN?.trim() || undefined;

  return { dbUrl, dbAuthToken, olderThanDays };
}
