import path from "node:path";

import { Command } from "commander";

import {
  assertApiKeyConfigured,
  resolveLlmOptions,
  type LlmOptions,
} from "./llm-config.js";
import { DEFAULT_MEMORY_CONFIG, type MemoryConfig } from "./memory/index.js";
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
  /** When false, skip loading pi-agent-browser-native (no agent_browser tool). */
  browserEnabled: boolean;
  memory: MemoryConfig;
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
    .option("--api-key <key>", "LLM API key override")
    .option(
      "--no-browser",
      "disable web browsing (do not load pi-agent-browser-native)",
    )
    .option("--memory", "enable episodic memory subsystem", true)
    .option("--no-memory", "disable episodic memory subsystem")
    .option(
      "--memory-flush-soft-threshold-tokens <n>",
      "token margin below compaction threshold to trigger memory flush",
      String(DEFAULT_MEMORY_CONFIG.flushSoftThresholdTokens),
    )
    .option(
      "--memory-flush-min-turns <n>",
      "minimum turns before a memory flush can run",
      String(DEFAULT_MEMORY_CONFIG.flushMinTurns),
    )
    .option(
      "--memory-nudge-interval <n>",
      "turns between periodic memory flushes (0 disables)",
      String(DEFAULT_MEMORY_CONFIG.nudgeInterval),
    )
    .option(
      "--memory-bootstrap-budget <n>",
      "max characters for Recent memory in system prompt",
      String(DEFAULT_MEMORY_CONFIG.bootstrapBudget),
    )
    .option(
      "--memory-context-window <n>",
      "context window size for compaction threshold (default 128000)",
      String(DEFAULT_MEMORY_CONFIG.contextWindow),
    )
    .option("--no-memory-search", "disable memory_search tool");

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
    browser?: boolean;
    memory?: boolean;
    memoryFlushSoftThresholdTokens: string;
    memoryFlushMinTurns: string;
    memoryNudgeInterval: string;
    memoryBootstrapBudget: string;
    memoryContextWindow: string;
    memorySearch?: boolean;
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

  const memory: MemoryConfig = {
    ...DEFAULT_MEMORY_CONFIG,
    enabled: opts.memory !== false,
    flushSoftThresholdTokens: parsePositiveInt(
      opts.memoryFlushSoftThresholdTokens,
      "memory-flush-soft-threshold-tokens",
      program,
    ),
    flushMinTurns: parsePositiveInt(
      opts.memoryFlushMinTurns,
      "memory-flush-min-turns",
      program,
    ),
    nudgeInterval: parseNonNegativeInt(
      opts.memoryNudgeInterval,
      "memory-nudge-interval",
      program,
    ),
    bootstrapBudget: parsePositiveInt(
      opts.memoryBootstrapBudget,
      "memory-bootstrap-budget",
      program,
    ),
    contextWindow: parsePositiveInt(
      opts.memoryContextWindow,
      "memory-context-window",
      program,
    ),
    searchEnabled: opts.memorySearch !== false,
    ollamaBaseUrl: process.env.OLLAMA_HOST ?? DEFAULT_MEMORY_CONFIG.ollamaBaseUrl,
  };

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
    browserEnabled: opts.browser !== false,
    memory,
  };
}

function parsePositiveInt(value: string, label: string, program: Command): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    program.error(`invalid ${label}: ${value}`);
  }
  return n;
}

function parseNonNegativeInt(value: string, label: string, program: Command): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    program.error(`invalid ${label}: ${value}`);
  }
  return n;
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
