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
  it("registers and lists an agent", async () => {
    const store = await AgentRegistryStore.create(":memory:");
    const agent = await store.register(sampleRequest);

    expect(agent.status).toBe(AGENT_STATUS.AVAILABLE);
    expect(await store.list()).toHaveLength(1);
    await store.close();
  });

  it("rejects duplicate registration", async () => {
    const store = await AgentRegistryStore.create(":memory:");
    await store.register(sampleRequest);

    await expect(store.register(sampleRequest)).rejects.toThrow(
      AgentRegistryError,
    );
    await store.close();
  });

  it("deregisters an agent", async () => {
    const store = await AgentRegistryStore.create(":memory:");
    await store.register(sampleRequest);
    await store.deregister(sampleRequest.agentId);

    expect(await store.list()).toHaveLength(0);
    await store.close();
  });

  it("marks an agent as sleeping", async () => {
    const store = await AgentRegistryStore.create(":memory:");
    await store.register(sampleRequest);
    await store.markSleeping(sampleRequest.agentId);

    expect((await store.get(sampleRequest.agentId))?.status).toBe(
      AGENT_STATUS.SLEEPING,
    );
    await store.close();
  });

  it("loads persisted agents after restart", async () => {
    const dbUrl = "file::memory:?cache=shared";
    const store = await AgentRegistryStore.create(dbUrl);
    await store.register(sampleRequest);
    await store.close();

    const reopened = await AgentRegistryStore.create(dbUrl);
    expect(await reopened.list()).toHaveLength(1);
    expect((await reopened.get(sampleRequest.agentId))?.name).toBe("worker");
    await reopened.close();
  });
});
