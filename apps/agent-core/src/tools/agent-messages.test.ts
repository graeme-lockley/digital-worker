import { describe, expect, it, vi } from "vitest";

import { AGENT_CORE_PATHS } from "@digital-worker/agent-core-protocol";
import { AGENT_REGISTER_PATHS } from "@digital-worker/agent-register-protocol";

import {
  createListAgentsTool,
  createSendToAgentTool,
  resolvePeerAgent,
} from "./agent-messages.js";

const selfAgentId = "self-agent";
const peerAgent = {
  agentId: "peer-agent",
  name: "Peer Worker",
  purpose: "Specialist tasks",
  skills: [],
  endpoint: { url: "http://127.0.0.1:3010" },
  status: "AVAILABLE" as const,
  registeredAt: "2026-06-06T10:00:00.000Z",
  lastHeartbeatAt: "2026-06-06T12:00:00.000Z",
};

describe("resolvePeerAgent", () => {
  it("resolves by agentId and excludes self", () => {
    const resolved = resolvePeerAgent(
      [peerAgent, { ...peerAgent, agentId: selfAgentId, name: "Self" }],
      selfAgentId,
      { agentId: "peer-agent" },
    );
    expect(resolved.agentId).toBe("peer-agent");
  });

  it("resolves by exact agent name", () => {
    const resolved = resolvePeerAgent([peerAgent], selfAgentId, {
      agentName: "Peer Worker",
    });
    expect(resolved.name).toBe("Peer Worker");
  });
});

describe("inter-agent message tools", () => {
  it("list_agents formats registered peers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        agents: [
          peerAgent,
          { ...peerAgent, agentId: selfAgentId, name: "Self Worker" },
        ],
      }),
    });

    const tool = createListAgentsTool({
      registerUrl: "http://127.0.0.1:3001",
      agentId: selfAgentId,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await tool.execute("call-1", {});
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("Peer Worker");
    expect(text).toContain("peer-agent");
    expect(text).not.toContain("Self Worker");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(AGENT_REGISTER_PATHS.list, "http://127.0.0.1:3001"),
    );
  });

  it("send_to_agent posts DeliverMessageRequest to peer deliver endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [peerAgent] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messageId: "delivered-msg",
          acceptedAt: "2026-06-06T12:05:00.000Z",
        }),
      });

    const tool = createSendToAgentTool({
      registerUrl: "http://127.0.0.1:3001",
      agentId: selfAgentId,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const result = await tool.execute("call-1", {
      agentName: "Peer Worker",
      text: "please help with analysis",
    });
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("accepted");
    expect(text).toContain("Peer Worker");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const deliverCall = fetchMock.mock.calls[1];
    expect(String(deliverCall?.[0])).toBe(
      new URL(AGENT_CORE_PATHS.deliver, peerAgent.endpoint.url).toString(),
    );
    const body = JSON.parse(String(deliverCall?.[1]?.body));
    expect(body.message.toAgentId).toBe("peer-agent");
    expect(body.message.fromAgentId).toBe(selfAgentId);
    expect(body.message.payload.text).toBe("please help with analysis");
  });
});
