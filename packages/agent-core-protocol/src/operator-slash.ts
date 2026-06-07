import {
  AGENT_COMMAND,
  type AgentCommandName,
  type CommandResponse,
  type CompactionSummary,
  type MaintainMemoryScope,
  type StatusResult,
} from "./command.js";

const MAINTAIN_MEMORY_SCOPES = new Set<MaintainMemoryScope>([
  "weekly",
  "monthly",
  "reindex",
  "prune",
]);

export type ParsedOperatorSlash = {
  command: AgentCommandName;
  model?: string;
  scope?: MaintainMemoryScope;
};

/** Parse a slash command from operator input (TUI, Telegram, etc.). */
export function parseOperatorSlash(input: string): ParsedOperatorSlash | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0]?.toLowerCase();
  if (!name) {
    return undefined;
  }

  switch (name) {
    case "status":
    case "abandon":
    case "shutdown":
    case "restart":
    case "compact":
      return parts.length === 1 ? { command: name as AgentCommandName } : undefined;
    case "model":
      if (parts.length === 1) {
        return { command: AGENT_COMMAND.LIST_MODELS };
      }
      return {
        command: AGENT_COMMAND.SET_MODEL,
        model: parts.slice(1).join(" "),
      };
    case "models":
    case "list_models":
    case "list-models":
      return { command: AGENT_COMMAND.LIST_MODELS };
    case "maintain_memory":
    case "maintain-memory": {
      const scopeArg = parts[1]?.toLowerCase();
      if (!scopeArg) {
        return { command: AGENT_COMMAND.MAINTAIN_MEMORY };
      }
      if (!MAINTAIN_MEMORY_SCOPES.has(scopeArg as MaintainMemoryScope)) {
        return undefined;
      }
      return {
        command: AGENT_COMMAND.MAINTAIN_MEMORY,
        scope: scopeArg as MaintainMemoryScope,
      };
    }
    default:
      return undefined;
  }
}

/** @deprecated Use parseOperatorSlash instead. */
export function parseSlashCommand(input: string): AgentCommandName | undefined {
  const parsed = parseOperatorSlash(input);
  if (!parsed || parsed.model || parsed.scope) {
    return parsed?.command;
  }
  return parsed.command;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function formatShortId(id: string): string {
  return id.split("-")[0] ?? id.slice(0, 8);
}

function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString("en-US");
}

function formatContextSummary(status: StatusResult): string {
  const pct =
    status.contextWindowMax > 0
      ? ((status.contextTokens / status.contextWindowMax) * 100).toFixed(1)
      : "0.0";
  return `${formatTokenCount(status.contextTokens)} / ${formatTokenCount(status.contextWindowMax)} tokens (${pct}%)`;
}

function formatCompactionReason(reason: CompactionSummary["reason"]): string {
  switch (reason) {
    case "manual":
      return "manual";
    case "threshold":
      return "auto (threshold)";
    case "overflow":
      return "auto (overflow)";
    default:
      return "unknown";
  }
}

function formatCompactionHistory(compactions: CompactionSummary[]): string[] {
  if (compactions.length === 0) {
    return ["- None yet"];
  }

  return [...compactions].reverse().map((entry) => {
    const when = entry.timestamp.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
    return `- ${when} · ${formatCompactionReason(entry.reason)} · ${formatTokenCount(entry.tokensBefore)} → ${formatTokenCount(entry.tokensAfter)} tokens`;
  });
}

function formatQueueSummary(status: StatusResult): string {
  if (status.queuedCount === 0) {
    return status.active ? "None waiting" : "Empty";
  }

  if (status.active) {
    const waiting =
      status.queuedCount === 1 ? "1 request" : `${status.queuedCount} requests`;
    return `${waiting} waiting behind current job`;
  }

  return status.queuedCount === 1
    ? "1 request waiting"
    : `${status.queuedCount} requests waiting`;
}

function formatWorkerSummary(status: StatusResult): string {
  if (!status.active) {
    return "Idle";
  }

  return `Processing (${formatDuration(status.active.runningForMs)})`;
}

export function formatStatusResult(status: StatusResult): string {
  return [
    "**Status**",
    "",
    `- **Session:** \`${formatShortId(status.sessionId)}\``,
    `- **Worker:** ${formatWorkerSummary(status)}`,
    `- **Queue:** ${formatQueueSummary(status)}`,
    `- **Context:** ${formatContextSummary(status)}`,
    `- **Uptime:** ${formatDuration(status.uptimeMs)}`,
    "",
    "**Recent compactions** (newest first)",
    ...formatCompactionHistory(status.recentCompactions),
  ].join("\n");
}

export function formatCommandResponse(response: CommandResponse): string {
  if ("accepted" in response) {
    if (response.action === "restart") {
      return "Restart accepted. Worker is restarting.";
    }
    return "Shutdown accepted. Worker is stopping.";
  }
  if ("drainedQueued" in response) {
    const parts = [];
    if (response.abandonedActive) {
      parts.push("aborted active job");
    }
    if (response.drainedQueued > 0) {
      parts.push(`drained ${response.drainedQueued} queued job(s)`);
    }
    return parts.length > 0 ? parts.join("; ") : "No active or queued jobs.";
  }
  if ("compacted" in response) {
    const saved = response.tokensBefore - response.tokensAfter;
    return [
      "Context compacted.",
      `- Original context size: ${formatTokenCount(response.tokensBefore)} tokens`,
      `- Post-compaction context size: ${formatTokenCount(response.tokensAfter)} tokens`,
      `- Saved: ${formatTokenCount(Math.max(0, saved))} tokens`,
      `- Trigger: ${formatCompactionReason(response.reason)}`,
    ].join("\n");
  }
  if ("processedPeriods" in response) {
    return `Memory maintenance (${response.scope}) completed in ${formatDuration(response.durationMs)}.`;
  }
  if ("models" in response && "current" in response) {
    const lines = response.models.map((m) => {
      const marker = m.current ? " (current)" : "";
      const label = m.label ?? `${m.provider}/${m.id}`;
      return `- ${label}${marker}`;
    });
    return ["**Available models**", "", ...lines].join("\n");
  }
  if ("model" in response && "provider" in response.model && "id" in response.model) {
    return `Model switched to ${response.model.provider}/${response.model.id}.`;
  }
  if ("sessionId" in response) {
    return formatStatusResult(response);
  }
  return "Command completed.";
}
