import { describe, expect, it } from "vitest";

import { AGENT_STATUS, type RegisteredAgent } from "./agent.js";
import { resolveAgentByNamePrefix } from "./resolve-agent.js";

function agent(
  overrides: Partial<RegisteredAgent> & Pick<RegisteredAgent, "agentId" | "name">,
): RegisteredAgent {
  return {
    purpose: "test",
    skills: [],
    endpoint: { url: "http://127.0.0.1:3000" },
    status: AGENT_STATUS.AVAILABLE,
    registeredAt: "2026-01-01T00:00:00.000Z",
    lastHeartbeatAt: null,
    ...overrides,
  };
}

describe("resolveAgentByNamePrefix", () => {
  it("resolves a unique name prefix", () => {
    const agents = [
      agent({ agentId: "1", name: "agent-core" }),
      agent({ agentId: "2", name: "agent-worker" }),
    ];
    expect(resolveAgentByNamePrefix(agents, "agent-c").name).toBe("agent-core");
  });

  it("rejects ambiguous prefixes across different names", () => {
    const agents = [
      agent({ agentId: "1", name: "agent-core" }),
      agent({ agentId: "2", name: "agent-worker" }),
    ];
    expect(() => resolveAgentByNamePrefix(agents, "agent")).toThrow(/ambiguous/);
  });

  it("prefers an available agent when duplicate names exist", () => {
    const agents = [
      agent({
        agentId: "dev-workstation-agent-core",
        name: "Aida",
        status: AGENT_STATUS.SLEEPING,
        endpoint: { url: "http://agent-core:3000" },
        lastHeartbeatAt: "2026-06-07T15:06:33.387Z",
      }),
      agent({
        agentId: "dev-workstation-agent-core-aida",
        name: "Aida",
        status: AGENT_STATUS.AVAILABLE,
        endpoint: { url: "http://agent-core-aida:3000" },
        lastHeartbeatAt: "2026-06-07T16:03:14.738Z",
      }),
    ];

    const resolved = resolveAgentByNamePrefix(agents, "Aida");
    expect(resolved.agentId).toBe("dev-workstation-agent-core-aida");
  });

  it("matches agentId suffixes case-insensitively", () => {
    const agents = [
      agent({
        agentId: "dev-workstation-agent-core-aida",
        name: "Aida",
        endpoint: { url: "http://agent-core-aida:3000" },
      }),
    ];

    expect(resolveAgentByNamePrefix(agents, "aida").agentId).toBe(
      "dev-workstation-agent-core-aida",
    );
  });
});
