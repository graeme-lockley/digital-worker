import { select } from "@clack/prompts";
import type { RegisteredAgent } from "@digital-worker/agent-register-protocol";

import { RegistryError } from "./registry.js";

export async function promptAgentSelection(
  agents: RegisteredAgent[],
): Promise<RegisteredAgent> {
  if (agents.length === 0) {
    throw new RegistryError("no agents registered");
  }

  const choice = await select({
    message: "Select an agent",
    options: agents.map((agent) => ({
      value: agent.agentId,
      label: agent.name,
      hint: `${agent.status} · ${agent.endpoint.url}`,
    })),
  });

  if (typeof choice !== "string") {
    throw new RegistryError("agent selection cancelled");
  }

  const agent = agents.find((a) => a.agentId === choice);
  if (!agent) {
    throw new RegistryError("selected agent not found");
  }

  return agent;
}
