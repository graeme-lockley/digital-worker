import { describe, expect, it } from "vitest";

import type { RegisteredAgent } from "@digital-worker/agent-register-protocol";

import { resolveAgentChatUrl } from "./resolve-agent-url.js";

const agent = (url: string): RegisteredAgent => ({
  agentId: "1",
  name: "agent-core",
  purpose: "test",
  skills: [],
  endpoint: { url },
  status: "AVAILABLE",
  registeredAt: "2026-01-01T00:00:00.000Z",
  lastHeartbeatAt: null,
});

describe("resolveAgentChatUrl", () => {
  it("maps Docker service host to localhost when register is local", () => {
    expect(
      resolveAgentChatUrl(
        agent("http://agent-core:3000"),
        "http://127.0.0.1:3001",
      ),
    ).toBe("http://127.0.0.1:3000");
  });

  it("keeps loopback agent URLs unchanged", () => {
    expect(
      resolveAgentChatUrl(
        agent("http://127.0.0.1:3000"),
        "http://127.0.0.1:3001",
      ),
    ).toBe("http://127.0.0.1:3000");
  });

  it("keeps remote agent URLs when register is remote", () => {
    expect(
      resolveAgentChatUrl(
        agent("http://agent-core:3000"),
        "http://register.example.com",
      ),
    ).toBe("http://agent-core:3000");
  });
});
