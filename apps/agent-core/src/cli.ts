import path from "node:path";

import { Command } from "commander";

import {
  assertApiKeyConfigured,
  resolveLlmOptions,
  type LlmOptions,
} from "./llm-config.js";
import { userArgv } from "./user-argv.js";
import { resolveWorkspaceDir } from "./workspace/paths.js";

export type ServerOptions = {
  host: string;
  port: number;
  registerUrl: string;
  endpointUrl?: string;
  agentId: string;
  agentName: string;
  name: string;
  purpose?: string;
  skills: string[];
  workspaceDir: string;
  toolsCwd: string;
  llm: LlmOptions;
  apiKey?: string;
};

export function parseCli(argv: readonly string[] = process.argv): ServerOptions {
  const program = new Command()
    .name("agent-core")
    .description("Digital worker agent core API server")
    .requiredOption(
      "-r, --register-url <url>",
      "agent-register base URL (e.g. http://127.0.0.1:3001)",
    )
    .requiredOption("--provider <name>", "LLM provider (e.g. deepseek, anthropic)")
    .requiredOption("--model <id>", "LLM model id or provider/model")
    .option("-H, --host <host>", "bind host", "127.0.0.1")
    .option("-p, --port <port>", "HTTP port", "3000")
    .option("--agent-id <id>", "unique agent id (generated if omitted)")
    .option(
      "--agent-name <name>",
      "workspace folder name under workspace/",
      "Aida",
    )
    .option("--name <name>", "registration display name (defaults to agent-name)")
    .option(
      "--purpose <purpose>",
      "registration purpose override (defaults to MANDATE excerpt)",
    )
    .option(
      "--skills <skills>",
      "comma-separated skill identifiers",
      "pnpm-workspace",
    )
    .option(
      "--endpoint-url <url>",
      "URL other agents use to reach this agent (required when bind host is not routable)",
    )
    .option(
      "--workspace-dir <path>",
      "agent workspace directory (default: ./workspace/<agent-name>)",
    )
    .option(
      "--tools-cwd <path>",
      "working directory for read/write/bash/ls tools (default: workspace directory)",
    )
    .option("--api-key <key>", "LLM API key override");

  program.parse(userArgv(argv), { from: "user" });

  const opts = program.opts<{
    host: string;
    port: string;
    registerUrl: string;
    provider: string;
    model: string;
    agentId?: string;
    agentName: string;
    name?: string;
    purpose?: string;
    skills: string;
    endpointUrl?: string;
    workspaceDir?: string;
    toolsCwd?: string;
    apiKey?: string;
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

  if (opts.endpointUrl) {
    try {
      new URL(opts.endpointUrl);
    } catch {
      program.error(`invalid endpoint-url: ${opts.endpointUrl}`);
    }
  }

  const skills = opts.skills
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);

  const agentName = opts.agentName.trim();
  if (!agentName) {
    program.error("agent-name must not be empty");
  }

  const workspaceDir = resolveWorkspaceDir(agentName, opts.workspaceDir);

  const llm = resolveLlmConfig(program, opts.provider, opts.model, opts.apiKey);

  return {
    host: opts.host,
    port,
    registerUrl: opts.registerUrl,
    endpointUrl: opts.endpointUrl,
    agentId: opts.agentId ?? crypto.randomUUID(),
    agentName,
    name: opts.name?.trim() || agentName,
    purpose: opts.purpose?.trim() || undefined,
    skills,
    workspaceDir: path.resolve(workspaceDir),
    toolsCwd: path.resolve(opts.toolsCwd ?? workspaceDir),
    llm,
    apiKey: opts.apiKey?.trim() || undefined,
  };
}

function resolveLlmConfig(
  program: Command,
  provider: string,
  modelArg: string,
  apiKey?: string,
): LlmOptions {
  try {
    const llm = resolveLlmOptions(provider, modelArg);
    assertApiKeyConfigured(llm.provider, apiKey);
    return llm;
  } catch (error) {
    program.error(error instanceof Error ? error.message : String(error));
  }
}
