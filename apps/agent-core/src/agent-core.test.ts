import { describe, expect, it, vi } from "vitest";

import { AGENT_CORE_PATHS } from "@digital-worker/agent-core-protocol";
import { AGENT_REGISTER_PATHS } from "@digital-worker/agent-register-protocol";

import { parseCli } from "./cli.js";
import { buildAgentEndpointUrl, resolveAdvertisedHost } from "./endpoint.js";
import { deregisterAgent, registerAgent } from "./registration.js";
import { createApp } from "./server.js";

describe("parseCli", () => {
  it("parses registration and server options", () => {
    expect(
      parseCli([
        "node",
        "agent-core",
        "--register-url",
        "http://127.0.0.1:3001",
        "--host",
        "0.0.0.0",
        "--port",
        "8080",
        "--agent-id",
        "agent-1",
        "--skills",
        "a, b",
      ]),
    ).toMatchObject({
      host: "0.0.0.0",
      port: 8080,
      registerUrl: "http://127.0.0.1:3001",
      agentId: "agent-1",
      skills: ["a", "b"],
    });
  });
});

describe("endpoint", () => {
  it("advertises localhost when binding all interfaces", () => {
    expect(resolveAdvertisedHost("0.0.0.0")).toBe("127.0.0.1");
    expect(buildAgentEndpointUrl("0.0.0.0", 3000)).toBe(
      "http://127.0.0.1:3000",
    );
  });
});

describe("createApp", () => {
  it("GET /health returns ok", async () => {
    const app = createApp({ agentId: "agent-1" });
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("POST heartbeat returns agent status", async () => {
    const app = createApp({ agentId: "agent-1" });
    const response = await app.request(AGENT_CORE_PATHS.heartbeat, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ polledAt: "2026-01-01T00:00:00.000Z" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      agentId: "agent-1",
      status: "ok",
    });
  });
});

describe("registration client", () => {
  it("registers and deregisters an agent", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agentId: "agent-1",
          status: "AVAILABLE",
          registeredAt: "2026-01-01T00:00:00.000Z",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agentId: "agent-1",
          deregisteredAt: "2026-01-01T00:00:01.000Z",
        }),
      });

    const options = {
      registerUrl: "http://127.0.0.1:3001",
      agentId: "agent-1",
      name: "agent-core",
      purpose: "core",
      skills: ["pnpm-workspace"],
      endpointUrl: "http://127.0.0.1:3000",
      fetchFn,
    };

    await registerAgent(options);
    await deregisterAgent(options);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain(
      AGENT_REGISTER_PATHS.register,
    );
    expect(String(fetchFn.mock.calls[1]?.[0])).toContain(
      AGENT_REGISTER_PATHS.deregister,
    );
  });
});
