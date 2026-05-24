import { describe, expect, it } from "vitest";

import type { RegisteredAgent } from "@digital-worker/agent-register-protocol";

import { resolveAgentByNamePrefix } from "./registry.js";

const agents: RegisteredAgent[] = [
  {
    agentId: "1",
    name: "agent-core",
    purpose: "core",
    skills: [],
    endpoint: { url: "http://127.0.0.1:3000" },
    status: "AVAILABLE",
    registeredAt: "2026-01-01T00:00:00.000Z",
    lastHeartbeatAt: null,
  },
  {
    agentId: "2",
    name: "agent-worker",
    purpose: "worker",
    skills: [],
    endpoint: { url: "http://127.0.0.1:3002" },
    status: "SLEEPING",
    registeredAt: "2026-01-01T00:00:00.000Z",
    lastHeartbeatAt: null,
  },
];

describe("resolveAgentByNamePrefix", () => {
  it("resolves a unique prefix", () => {
    expect(resolveAgentByNamePrefix(agents, "agent-c").name).toBe("agent-core");
  });

  it("rejects ambiguous prefix", () => {
    expect(() => resolveAgentByNamePrefix(agents, "agent")).toThrow(/ambiguous/);
  });

  it("rejects unknown prefix", () => {
    expect(() => resolveAgentByNamePrefix(agents, "missing")).toThrow(/no agent/);
  });
});
