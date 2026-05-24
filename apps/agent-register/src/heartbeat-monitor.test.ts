import { describe, expect, it, vi } from "vitest";

import { AGENT_STATUS } from "@digital-worker/agent-register-protocol";

import { HeartbeatMonitor } from "./heartbeat-monitor.js";
import { AgentRegistryStore } from "./store.js";

describe("HeartbeatMonitor", () => {
  it("marks agent AVAILABLE when heartbeat succeeds", async () => {
    const store = new AgentRegistryStore();
    store.register({
      agentId: "agent-1",
      name: "worker",
      purpose: "tasks",
      skills: [],
      endpoint: { url: "http://127.0.0.1:3000" },
    });

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        agentId: "agent-1",
        status: "ok",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    });

    const monitor = new HeartbeatMonitor({
      store,
      intervalMs: 60_000,
      requestTimeoutMs: 1000,
      fetchFn,
    });

    await monitor.pollAgent("agent-1");

    expect(store.get("agent-1")?.status).toBe(AGENT_STATUS.AVAILABLE);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("marks agent SLEEPING when heartbeat fails", async () => {
    const store = new AgentRegistryStore();
    store.register({
      agentId: "agent-1",
      name: "worker",
      purpose: "tasks",
      skills: [],
      endpoint: { url: "http://127.0.0.1:3000" },
    });

    expect(store.get("agent-1")?.status).toBe(AGENT_STATUS.AVAILABLE);

    const monitor = new HeartbeatMonitor({
      store,
      intervalMs: 60_000,
      requestTimeoutMs: 1000,
      fetchFn: vi.fn().mockRejectedValue(new Error("network")),
    });

    await monitor.pollAgent("agent-1");

    expect(store.get("agent-1")?.status).toBe(AGENT_STATUS.SLEEPING);
  });
});
