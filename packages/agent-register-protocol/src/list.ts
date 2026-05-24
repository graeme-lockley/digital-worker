import type { RegisteredAgent } from "./agent.js";

export interface ListAgentsResponse {
  agents: RegisteredAgent[];
}
