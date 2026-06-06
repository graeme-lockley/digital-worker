import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  AGENT_CORE_PATHS,
  AGENT_MESSAGE_TYPE,
  type AgentMessage,
  type AgentMessagePayload,
  type DeliverMessageRequest,
} from "@digital-worker/agent-core-protocol";
import {
  AGENT_REGISTER_PATHS,
  AGENT_STATUS,
  type ListAgentsResponse,
  type RegisteredAgent,
} from "@digital-worker/agent-register-protocol";
import { Type } from "typebox";

export type AgentMessagesDeps = {
  registerUrl: string;
  agentId: string;
  fetchFn?: typeof fetch;
};

export class AgentRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRegistryError";
  }
}

export async function fetchRegisteredAgents(
  registerUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<RegisteredAgent[]> {
  const url = new URL(AGENT_REGISTER_PATHS.list, registerUrl);
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new AgentRegistryError(
      `failed to list agents: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as ListAgentsResponse;
  return body.agents;
}

export function resolvePeerAgent(
  agents: RegisteredAgent[],
  selfAgentId: string,
  options: { agentId?: string; agentName?: string },
): RegisteredAgent {
  const peerId = options.agentId?.trim();
  const peerName = options.agentName?.trim();

  if (!peerId && !peerName) {
    throw new AgentRegistryError("agentId or agentName is required");
  }

  const peers = agents.filter((agent) => agent.agentId !== selfAgentId);

  if (peerId) {
    const match = peers.find((agent) => agent.agentId === peerId);
    if (!match) {
      throw new AgentRegistryError(`no registered agent with id "${peerId}"`);
    }
    return match;
  }

  const matches = peers.filter((agent) => agent.name === peerName);
  if (matches.length === 0) {
    throw new AgentRegistryError(`no registered agent with name "${peerName}"`);
  }
  if (matches.length > 1) {
    throw new AgentRegistryError(
      `ambiguous agent name "${peerName}" (${matches.length} matches)`,
    );
  }

  return matches[0]!;
}

export function createListAgentsTool(
  deps: AgentMessagesDeps,
): AgentTool<typeof listAgentsParameters> {
  return {
    name: "list_agents",
    label: "List Agents",
    description:
      "List other digital workers registered with agent-register (id, name, purpose, status). Use before send_to_agent to choose a recipient.",
    parameters: listAgentsParameters,
    execute: async () => {
      const fetchFn = deps.fetchFn ?? fetch;
      try {
        const agents = await fetchRegisteredAgents(deps.registerUrl, fetchFn);
        const peers = agents.filter((agent) => agent.agentId !== deps.agentId);

        if (peers.length === 0) {
          return {
            content: [{ type: "text", text: "No other registered agents." }],
            details: { agents: [] },
          };
        }

        const formatted = peers
          .map(
            (agent, index) =>
              `${index + 1}. ${agent.name} (${agent.agentId})\n   status: ${agent.status}\n   purpose: ${agent.purpose}\n   endpoint: ${agent.endpoint.url}`,
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `${peers.length} registered agent(s):\n\n${formatted}`,
            },
          ],
          details: { agents: peers },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "failed to list agents";
        return {
          content: [{ type: "text", text: `list_agents failed: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

export function createSendToAgentTool(
  deps: AgentMessagesDeps,
): AgentTool<typeof sendToAgentParameters> {
  return {
    name: "send_to_agent",
    label: "Send To Agent",
    description:
      "Deliver a fire-and-forget message to another digital worker via the inter-agent message bus. The recipient processes it in their inbox; there is no automatic reply. Use list_agents to discover peers.",
    parameters: sendToAgentParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const text = params.text.trim();
      const messageType = params.type?.trim() || AGENT_MESSAGE_TYPE;

      try {
        const agents = await fetchRegisteredAgents(deps.registerUrl, fetchFn);
        const peer = resolvePeerAgent(agents, deps.agentId, {
          agentId: params.agentId,
          agentName: params.agentName,
        });

        const message: AgentMessage<AgentMessagePayload> = {
          messageId: crypto.randomUUID(),
          fromAgentId: deps.agentId,
          toAgentId: peer.agentId,
          type: messageType,
          payload: { text },
          sentAt: new Date().toISOString(),
        };

        const url = new URL(AGENT_CORE_PATHS.deliver, peer.endpoint.url);
        const body: DeliverMessageRequest<AgentMessagePayload> = { message };
        const response = await fetchFn(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          let detail = `${response.status}`;
          try {
            const payload = (await response.json()) as {
              error?: { message?: string };
            };
            if (payload.error?.message) {
              detail = payload.error.message;
            }
          } catch {
            // ignore
          }
          return {
            content: [
              {
                type: "text",
                text: `send_to_agent failed for ${peer.name}: ${detail}`,
              },
            ],
            details: { error: detail, peerAgentId: peer.agentId },
          };
        }

        const result = (await response.json()) as {
          messageId: string;
          acceptedAt: string;
        };

        const sleepingNote =
          peer.status === AGENT_STATUS.SLEEPING
            ? " Note: recipient is SLEEPING; delivery is queued on their worker."
            : "";

        return {
          content: [
            {
              type: "text",
              text: `Message accepted by ${peer.name} (${peer.agentId}) at ${result.acceptedAt}.${sleepingNote}`,
            },
          ],
          details: { ...result, peerAgentId: peer.agentId, peerName: peer.name },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "failed to send message";
        return {
          content: [{ type: "text", text: `send_to_agent failed: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

const listAgentsParameters = Type.Object({});

const sendToAgentParameters = Type.Object({
  agentId: Type.Optional(
    Type.String({
      description: "Recipient agent id from list_agents",
      minLength: 1,
      maxLength: 100,
    }),
  ),
  agentName: Type.Optional(
    Type.String({
      description: "Recipient agent name from list_agents",
      minLength: 1,
      maxLength: 100,
    }),
  ),
  type: Type.Optional(
    Type.String({
      description: 'Message type (default "message")',
      minLength: 1,
      maxLength: 50,
    }),
  ),
  text: Type.String({
    description: "Message text to deliver",
    minLength: 1,
    maxLength: 16000,
  }),
});
