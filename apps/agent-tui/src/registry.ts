import {
  AGENT_REGISTER_PATHS,
  resolveAgentByNamePrefix as resolveAgentByPrefix,
  type ListAgentsResponse,
  type RegisteredAgent,
} from "@digital-worker/agent-register-protocol";

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export async function fetchAgents(
  registerUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<RegisteredAgent[]> {
  const url = new URL(AGENT_REGISTER_PATHS.list, registerUrl);
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new RegistryError(
      `failed to list agents: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as ListAgentsResponse;
  return body.agents;
}

/** Resolve a single agent by unique name prefix. */
export function resolveAgentByNamePrefix(
  agents: RegisteredAgent[],
  prefix: string,
): RegisteredAgent {
  try {
    return resolveAgentByPrefix(agents, prefix);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed to resolve agent";
    throw new RegistryError(message);
  }
}
