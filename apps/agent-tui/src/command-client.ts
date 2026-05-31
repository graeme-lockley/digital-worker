import {
  AGENT_CORE_PATHS,
  type AgentCommandName,
  type CommandRequest,
  type CommandResponse,
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
  const active = response.active
    ? `active job ${response.active.jobId} (${response.active.runningForMs}ms)`
    : "idle";
  return [
    `session ${response.sessionId}`,
    `queue depth ${response.queueDepth} (${response.queuedCount} queued)`,
    active,
    `uptime ${response.uptimeMs}ms`,
  ].join("\n");
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
