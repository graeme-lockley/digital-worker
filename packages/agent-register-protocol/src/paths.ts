/** HTTP paths implemented by the agent register service. */
export const AGENT_REGISTER_PATHS = {
  register: "/api/v1/agents/register",
  deregister: "/api/v1/agents/deregister",
  list: "/api/v1/agents",
} as const;
