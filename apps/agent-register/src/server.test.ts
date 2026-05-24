import { describe, expect, it, vi } from "vitest";

import {
  AGENT_REGISTER_PATHS,
  AGENT_STATUS,
  type ListAgentsResponse,
} from "@digital-worker/agent-register-protocol";

import { HeartbeatMonitor } from "./heartbeat-monitor.js";
import { createApp } from "./server.js";
import { AgentRegistryStore } from "./store.js";

function createTestApp() {
  const store = new AgentRegistryStore();
  const heartbeatMonitor = new HeartbeatMonitor({
    store,
    intervalMs: 60_000,
    requestTimeoutMs: 1000,
    fetchFn: vi.fn(),
  });
  return { app: createApp({ store, heartbeatMonitor }), store };
}

describe("createApp", () => {
  it("registers an agent", async () => {
    const { app } = createTestApp();
    const response = await app.request(AGENT_REGISTER_PATHS.register, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-1",
        name: "worker",
        purpose: "tasks",
        skills: ["test"],
        endpoint: { url: "http://127.0.0.1:3000" },
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      agentId: "agent-1",
      status: AGENT_STATUS.AVAILABLE,
    });
  });

  it("lists registered agents", async () => {
    const { app } = createTestApp();
    await app.request(AGENT_REGISTER_PATHS.register, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-1",
        name: "worker",
        purpose: "tasks",
        skills: [],
        endpoint: { url: "http://127.0.0.1:3000" },
      }),
    });

    const response = await app.request(AGENT_REGISTER_PATHS.list);
    const body = (await response.json()) as ListAgentsResponse;

    expect(body.agents).toHaveLength(1);
  });

  it("deregisters an agent", async () => {
    const { app } = createTestApp();
    await app.request(AGENT_REGISTER_PATHS.register, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-1",
        name: "worker",
        purpose: "tasks",
        skills: [],
        endpoint: { url: "http://127.0.0.1:3000" },
      }),
    });

    const response = await app.request(AGENT_REGISTER_PATHS.deregister, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "agent-1" }),
    });

    expect(response.status).toBe(200);
  });
});
