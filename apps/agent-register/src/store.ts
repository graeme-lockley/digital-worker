import {
  AGENT_STATUS,
  type AgentStatus,
  type RegisteredAgent,
  type RegisterAgentRequest,
} from "@digital-worker/agent-register-protocol";

export class AgentRegistryStore {
  private readonly agents = new Map<string, RegisteredAgent>();

  register(request: RegisterAgentRequest): RegisteredAgent {
    if (this.agents.has(request.agentId)) {
      throw new AgentRegistryError(
        "AGENT_ALREADY_REGISTERED",
        `agent ${request.agentId} is already registered`,
      );
    }

    const registeredAt = new Date().toISOString();
    const agent: RegisteredAgent = {
      agentId: request.agentId,
      name: request.name,
      purpose: request.purpose,
      skills: [...request.skills],
      endpoint: { url: request.endpoint.url },
      status: AGENT_STATUS.AVAILABLE,
      registeredAt,
      lastHeartbeatAt: registeredAt,
    };

    this.agents.set(request.agentId, agent);
    return agent;
  }

  deregister(agentId: string): RegisteredAgent {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new AgentRegistryError(
        "AGENT_NOT_FOUND",
        `agent ${agentId} is not registered`,
      );
    }

    this.agents.delete(agentId);
    return agent;
  }

  list(): RegisteredAgent[] {
    return [...this.agents.values()];
  }

  get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  updateHeartbeat(agentId: string, heartbeatAt: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    this.agents.set(agentId, {
      ...agent,
      lastHeartbeatAt: heartbeatAt,
      status: AGENT_STATUS.AVAILABLE,
    });
  }

  markSleeping(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    this.agents.set(agentId, {
      ...agent,
      status: AGENT_STATUS.SLEEPING,
    });
  }
}

export class AgentRegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentRegistryError";
  }
}

export type { AgentStatus };
