import {
  AGENT_COMMAND,
  AGENT_CORE_PATHS,
  type ListModelsResult,
} from "@digital-worker/agent-core-protocol";
import {
  AGENT_REGISTER_PATHS,
  type ListAgentsResponse,
  type RegisteredAgent,
} from "@digital-worker/agent-register-protocol";

export class AgentResolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentResolverError";
  }
}

export class ModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelValidationError";
  }
}

export async function fetchRegisteredAgents(
  registerUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<RegisteredAgent[]> {
  const url = new URL(AGENT_REGISTER_PATHS.list, registerUrl);
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new AgentResolverError(
      `failed to list agents: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as ListAgentsResponse;
  return body.agents;
}

export async function resolveAgent(
  registerUrl: string,
  agentId: string,
  fetchFn: typeof fetch = fetch,
): Promise<RegisteredAgent> {
  const agents = await fetchRegisteredAgents(registerUrl, fetchFn);
  const match = agents.find((agent) => agent.agentId === agentId);
  if (!match) {
    throw new AgentResolverError(`no registered agent with id "${agentId}"`);
  }
  return match;
}

export async function validateModel(
  endpoint: string,
  modelArg: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const url = new URL(AGENT_CORE_PATHS.command, endpoint);
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      command: AGENT_COMMAND.LIST_MODELS,
      clientId: "agent-scheduler",
    }),
  });

  if (!response.ok) {
    throw new ModelValidationError(
      `list_models failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as ListModelsResult;
  const normalized = modelArg.trim();
  const hasSlash = normalized.includes("/");
  const match = body.models.some((descriptor) => {
    const full = `${descriptor.provider}/${descriptor.id}`;
    return full === normalized || (!hasSlash && descriptor.id === normalized);
  });

  if (!match) {
    throw new ModelValidationError(
      `model ${normalized} is not in the agent roster`,
    );
  }
}
