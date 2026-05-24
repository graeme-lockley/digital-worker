import { Command } from "commander";

export type ServerOptions = {
  host: string;
  port: number;
  registerUrl: string;
  agentId: string;
  name: string;
  purpose: string;
  skills: string[];
};

export function parseCli(argv: readonly string[] = process.argv): ServerOptions {
  const program = new Command()
    .name("agent-core")
    .description("Digital worker agent core API server")
    .requiredOption(
      "-r, --register-url <url>",
      "agent-register base URL (e.g. http://127.0.0.1:3001)",
    )
    .option("-H, --host <host>", "bind host", "127.0.0.1")
    .option("-p, --port <port>", "HTTP port", "3000")
    .option("--agent-id <id>", "unique agent id (generated if omitted)")
    .option("--name <name>", "agent name", "agent-core")
    .option(
      "--purpose <purpose>",
      "short description of what this agent does",
      "Core digital worker agent",
    )
    .option(
      "--skills <skills>",
      "comma-separated skill identifiers",
      "pnpm-workspace",
    );

  program.parse([...argv]);

  const opts = program.opts<{
    host: string;
    port: string;
    registerUrl: string;
    agentId?: string;
    name: string;
    purpose: string;
    skills: string;
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

  const skills = opts.skills
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);

  return {
    host: opts.host,
    port,
    registerUrl: opts.registerUrl,
    agentId: opts.agentId ?? crypto.randomUUID(),
    name: opts.name,
    purpose: opts.purpose,
    skills,
  };
}
