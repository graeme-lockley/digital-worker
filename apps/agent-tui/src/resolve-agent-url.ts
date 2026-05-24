import type { RegisteredAgent } from "@digital-worker/agent-register-protocol";

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * URL the TUI should call for chat. When the register is reached on loopback but
 * the agent registered a Docker Compose service hostname (e.g. agent-core:3000),
 * use the published localhost port instead.
 */
export function resolveAgentChatUrl(
  agent: RegisteredAgent,
  registerUrl: string,
): string {
  const endpoint = new URL(agent.endpoint.url);
  const register = new URL(registerUrl);

  if (!isLoopbackHost(register.hostname) || isLoopbackHost(endpoint.hostname)) {
    return agent.endpoint.url;
  }

  const port =
    endpoint.port || (endpoint.protocol === "https:" ? "443" : "80");
  return `http://127.0.0.1:${port}`;
}
