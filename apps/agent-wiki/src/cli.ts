import path from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { userArgv } from "./user-argv.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export type WikiOptions = {
  host: string;
  port: number;
  dataDir: string;
  seedDir: string;
};

export function parseCli(argv: readonly string[] = process.argv): WikiOptions {
  const defaultSeedDir = path.resolve(moduleDir, "../seed");

  const program = new Command()
    .name("agent-wiki")
    .description("Shared agent knowledge wiki")
    .option("-H, --host <host>", "bind host", "127.0.0.1")
    .option("-p, --port <port>", "HTTP port", "3004")
    .option(
      "--data-dir <path>",
      "wiki data directory (or WIKI_DATA_DIR env)",
      process.env.WIKI_DATA_DIR ?? "./data/agent-wiki",
    )
    .option(
      "--seed-dir <path>",
      "seed pages directory when data volume is empty",
      process.env.WIKI_SEED_DIR ?? defaultSeedDir,
    );

  program.parse(userArgv(argv), { from: "user" });

  const opts = program.opts<{
    host: string;
    port: string;
    dataDir: string;
    seedDir: string;
  }>();

  const port = Number(opts.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    program.error(`invalid port: ${opts.port}`);
  }

  const dataDir = opts.dataDir.trim();
  if (!dataDir) {
    program.error("data-dir must not be empty");
  }

  const seedDir = opts.seedDir.trim();
  if (!seedDir) {
    program.error("seed-dir must not be empty");
  }

  return {
    host: opts.host,
    port,
    dataDir: path.resolve(dataDir),
    seedDir: path.resolve(seedDir),
  };
}
