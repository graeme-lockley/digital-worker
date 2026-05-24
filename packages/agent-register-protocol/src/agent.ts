export const AGENT_STATUS = {
  AVAILABLE: "AVAILABLE",
  SLEEPING: "SLEEPING",
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

export interface AgentEndpoint {
  /** Base URL for the agent, e.g. http://127.0.0.1:3000 */
  url: string;
}

export interface RegisteredAgent {
  agentId: string;
  name: string;
  purpose: string;
  skills: string[];
  endpoint: AgentEndpoint;
  status: AgentStatus;
  registeredAt: string;
  lastHeartbeatAt: string | null;
}
