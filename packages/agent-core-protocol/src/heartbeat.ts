/** Request body when the register polls an agent heartbeat endpoint. */
export interface HeartbeatRequest {
  polledAt: string;
}

/** Response when an agent is alive and reachable. */
export interface HeartbeatResponse {
  agentId: string;
  status: "ok";
  timestamp: string;
}
