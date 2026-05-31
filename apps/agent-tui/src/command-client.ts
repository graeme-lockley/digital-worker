import {
  AGENT_CORE_PATHS,
  type AgentCommandName,
  type CommandRequest,
  type CommandResponse,
  type StatusResult,
} from "@digital-worker/agent-core-protocol";

export type SendCommandOptions = {
  agentBaseUrl: string;
  clientId: string;
  command: AgentCommandName;
  sessionId?: string;
  fetchFn?: typeof fetch;
};

export class CommandClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandClientError";
  }
}

export async function sendCommand(
  options: SendCommandOptions,
): Promise<CommandResponse> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL(AGENT_CORE_PATHS.command, options.agentBaseUrl);
  const body: CommandRequest = {
    command: options.command,
    clientId: options.clientId,
    sessionId: options.sessionId,
  };

  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (payload.error?.message) {
        detail = payload.error.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new CommandClientError(`command request failed: ${detail}`);
  }

  return (await response.json()) as CommandResponse;
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
    `- **Uptime:** ${formatDuration(status.uptimeMs)}`,
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
  if ("processedPeriods" in response) {
    return `Memory maintenance (${response.scope}) completed in ${formatDuration(response.durationMs)}.`;
  }
  return formatStatusResult(response);
}

export function parseSlashCommand(
  input: string,
): AgentCommandName | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }
  const name = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase();
  if (
    name === "status" ||
    name === "abandon" ||
    name === "shutdown" ||
    name === "restart"
  ) {
    return name;
  }
  return undefined;
}
