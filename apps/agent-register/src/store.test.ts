import { describe, expect, it } from "vitest";

import { AGENT_STATUS } from "@digital-worker/agent-register-protocol";

import { AgentRegistryError, AgentRegistryStore } from "./store.js";

const sampleRequest = {
  agentId: "agent-1",
  name: "worker",
  purpose: "execute tasks",
  skills: ["pnpm-workspace"],
  endpoint: { url: "http://127.0.0.1:3000" },
};

describe("AgentRegistryStore", () => {
  it("registers and lists an agent", () => {
    const store = new AgentRegistryStore();
    const agent = store.register(sampleRequest);

    expect(agent.status).toBe(AGENT_STATUS.AVAILABLE);
    expect(store.list()).toHaveLength(1);
  });

  it("rejects duplicate registration", () => {
    const store = new AgentRegistryStore();
    store.register(sampleRequest);

    expect(() => store.register(sampleRequest)).toThrow(AgentRegistryError);
  });

  it("deregisters an agent", () => {
    const store = new AgentRegistryStore();
    store.register(sampleRequest);
    store.deregister(sampleRequest.agentId);

    expect(store.list()).toHaveLength(0);
  });

  it("marks an agent as sleeping", () => {
    const store = new AgentRegistryStore();
    store.register(sampleRequest);
    store.markSleeping(sampleRequest.agentId);

    expect(store.get(sampleRequest.agentId)?.status).toBe(AGENT_STATUS.SLEEPING);
  });
});
