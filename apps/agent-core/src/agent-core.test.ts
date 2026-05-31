import { describe, expect, it, vi } from "vitest";

import { AGENT_CORE_PATHS } from "@digital-worker/agent-core-protocol";
import { AGENT_REGISTER_PATHS } from "@digital-worker/agent-register-protocol";

import { parseCli } from "./cli.js";
import { buildAgentEndpointUrl, resolveAdvertisedHost } from "./endpoint.js";
import { deregisterAgent, registerAgent } from "./registration.js";
import {
  createTestHarness,
  disposeTestHarness,
  repoWorkspacePath,
  TEST_AGENT_ID,
  TEST_SESSION_ID,
} from "./test-helpers.js";

const baseCliArgs = [
  "node",
  "agent-core",
  "--register-url",
  "http://127.0.0.1:3001",
  "--provider",
  "deepseek",
  "--model",
  "deepseek-v4-flash",
  "--workspace-dir",
  repoWorkspacePath(),
  "--api-key",
  "test-key",
];

describe("parseCli", () => {
  it("parses registration, server, and LLM options", () => {
    expect(
      parseCli([
        ...baseCliArgs,
        "--host",
        "0.0.0.0",
        "--port",
        "8080",
        "--agent-id",
        "agent-1",
        "--agent-name",
        "Aida",
        "--skills",
        "a, b",
      ]),
    ).toMatchObject({
      host: "0.0.0.0",
      port: 8080,
      registerUrl: "http://127.0.0.1:3001",
      agentId: "agent-1",
      agentName: "Aida",
      skills: ["a", "b"],
      llm: { provider: "deepseek", modelId: "deepseek-v4-flash" },
    });
  });

  it("parses endpoint-url override", () => {
    expect(
      parseCli([
        ...baseCliArgs,
        "--endpoint-url",
        "http://agent-core:3000",
      ]).endpointUrl,
    ).toBe("http://agent-core:3000");
  });

  it("parses provider/model shorthand in --model", () => {
    const opts = parseCli([
      "node",
      "agent-core",
      "--register-url",
      "http://127.0.0.1:3001",
      "--provider",
      "ignored",
      "--model",
      "deepseek/deepseek-v4-pro",
      "--workspace-dir",
      repoWorkspacePath(),
      "--api-key",
      "test-key",
    ]);
    expect(opts.llm).toEqual({
      provider: "deepseek",
      modelId: "deepseek-v4-pro",
    });
  });

  it("defaults agent-name to Aida and tools-cwd to workspace-dir", () => {
    const opts = parseCli(baseCliArgs);
    expect(opts.agentName).toBe("Aida");
    expect(opts.toolsCwd).toBe(opts.workspaceDir);
  });

  it("defaults browserEnabled to true and disables with --no-browser", () => {
    expect(parseCli(baseCliArgs).browserEnabled).toBe(true);
    expect(parseCli([...baseCliArgs, "--no-browser"]).browserEnabled).toBe(false);
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
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request("/health");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("GET /api/v1 includes session and queue metadata", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request("/api/v1");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        service: "agent-core",
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
      });
    } finally {
      await disposeTestHarness(harness);
    }
  });

  it("POST heartbeat returns agent status", async () => {
    const harness = await createTestHarness();
    try {
      const response = await harness.app.request(AGENT_CORE_PATHS.heartbeat, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ polledAt: "2026-01-01T00:00:00.000Z" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        agentId: TEST_AGENT_ID,
        status: "ok",
      });
    } finally {
      await disposeTestHarness(harness);
    }
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
      name: "Aida",
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
