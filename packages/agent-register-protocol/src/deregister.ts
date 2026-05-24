export interface DeregisterAgentRequest {
  agentId: string;
}

export interface DeregisterAgentResponse {
  agentId: string;
  deregisteredAt: string;
}
