import { Command } from "commander";

import { userArgv } from "./user-argv.js";

export type TuiOptions = {
  registerUrl: string;
  agentNamePrefix?: string;
};

export function parseCli(argv: readonly string[] = process.argv): TuiOptions {
  const program = new Command()
    .name("agent-tui")
    .description("Terminal UI for chatting with digital worker agents")
    .requiredOption(
      "-r, --register-url <url>",
      "agent-register base URL (e.g. http://127.0.0.1:3001)",
    )
    .option(
      "--agent-name <prefix>",
      "unique agent name prefix (must match exactly one registered agent)",
    );

  program.parse(userArgv(argv), { from: "user" });

  const opts = program.opts<{
    registerUrl: string;
    agentName?: string;
  }>();

  try {
    new URL(opts.registerUrl);
  } catch {
    program.error(`invalid register-url: ${opts.registerUrl}`);
  }

  return {
    registerUrl: opts.registerUrl,
    agentNamePrefix: opts.agentName,
  };
}
