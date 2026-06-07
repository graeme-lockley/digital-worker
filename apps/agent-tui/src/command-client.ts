import {
  AGENT_COMMAND,
  AGENT_CORE_PATHS,
  formatCommandResponse,
  formatDuration,
  formatStatusResult,
  parseOperatorSlash,
  parseSlashCommand,
  type AgentCommandName,
  type CommandRequest,
  type CommandResponse,
  type ListModelsResult,
  type SetModelResult,
} from "@digital-worker/agent-core-protocol";

export {
  formatCommandResponse,
  formatDuration,
  formatStatusResult,
  parseOperatorSlash,
  parseSlashCommand,
};

export type SendCommandOptions = {
  agentBaseUrl: string;
  clientId: string;
  command: AgentCommandName;
  sessionId?: string;
  scope?: CommandRequest["scope"];
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
    scope: options.scope,
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

export async function listModels(options: Omit<SendCommandOptions, "command">): Promise<ListModelsResult> {
  const response = await sendCommand({
    ...options,
    command: AGENT_COMMAND.LIST_MODELS,
  });
  return response as ListModelsResult;
}

export async function setModel(
  options: Omit<SendCommandOptions, "command"> & { model: string },
): Promise<SetModelResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL(AGENT_CORE_PATHS.command, options.agentBaseUrl);
  const body: CommandRequest = {
    command: AGENT_COMMAND.SET_MODEL,
    clientId: options.clientId,
    sessionId: options.sessionId,
    model: options.model,
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

  return (await response.json()) as SetModelResult;
}
