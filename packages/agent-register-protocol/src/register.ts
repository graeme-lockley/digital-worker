import type { AgentEndpoint, AgentStatus } from "./agent.js";

export interface RegisterAgentRequest {
  agentId: string;
  name: string;
  purpose: string;
  skills: string[];
  endpoint: AgentEndpoint;
}

export interface RegisterAgentResponse {
  agentId: string;
  status: AgentStatus;
  registeredAt: string;
}
