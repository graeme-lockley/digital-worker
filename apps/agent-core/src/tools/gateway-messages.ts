import type { AgentTool } from "@earendil-works/pi-agent-core";
import { GATEWAY_PATHS } from "@digital-worker/agent-gateway-protocol";
import { Type } from "typebox";

export type GatewayClientDeps = {
  gatewayUrl: string;
  fetchFn?: typeof fetch;
};

export function createCheckMessagesTool(
  deps: GatewayClientDeps,
): AgentTool<typeof checkMessagesParameters> {
  return {
    name: "check_messages",
    label: "Check Messages",
    description:
      "Pull unread messages from the agent-gateway mailbox (Telegram and future channels). Use after a doorbell notification or when checking for external messages.",
    parameters: checkMessagesParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const url = new URL(GATEWAY_PATHS.messages, deps.gatewayUrl);
      if (params.peek) {
        url.searchParams.set("peek", "true");
      }

      const response = await fetchFn(url);
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Gateway check_messages failed: ${response.status}`,
            },
          ],
          details: { error: response.status },
        };
      }

      const body = (await response.json()) as {
        messages: Array<{
          id: string;
          channel: string;
          sender: string;
          text: string;
          threadId?: string;
          receivedAt: string;
        }>;
        unreadCount: number;
      };

      if (body.messages.length === 0) {
        return {
          content: [{ type: "text", text: "No unread messages." }],
          details: body,
        };
      }

      const formatted = body.messages
        .map(
          (m, i) =>
            `${i + 1}. [${m.channel}] from ${m.sender} at ${m.receivedAt}\n   id: ${m.id}\n   ${m.text}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `${body.messages.length} unread message(s):\n\n${formatted}`,
          },
        ],
        details: body,
      };
    },
  };
}

export function createSendMessageTool(
  deps: GatewayClientDeps,
): AgentTool<typeof sendMessageParameters> {
  return {
    name: "send_message",
    label: "Send Message",
    description:
      "Send an outbound message via agent-gateway (Telegram today; other channels later). Use for replies and proactive notifications.",
    parameters: sendMessageParameters,
    execute: async (_toolCallId, params) => {
      const fetchFn = deps.fetchFn ?? fetch;
      const url = new URL(GATEWAY_PATHS.outbound, deps.gatewayUrl);
      const response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: params.channel,
          text: params.text,
          threadId: params.threadId,
        }),
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
            { type: "text", text: `Gateway send_message failed: ${detail}` },
          ],
          details: { error: detail },
        };
      }

      const body = (await response.json()) as {
        delivered: boolean;
        providerMessageId?: string;
      };

      return {
        content: [
          {
            type: "text",
            text: body.delivered
              ? `Message sent via ${params.channel}${body.providerMessageId ? ` (id ${body.providerMessageId})` : ""}.`
              : `Message not delivered via ${params.channel}.`,
          },
        ],
        details: body,
      };
    },
  };
}

const checkMessagesParameters = Type.Object({
  peek: Type.Optional(
    Type.Boolean({
      description:
        "When true, return unread messages without marking them read (use ack separately)",
    }),
  ),
});

const sendMessageParameters = Type.Object({
  channel: Type.String({
    description: 'Channel name (e.g. "telegram")',
    minLength: 1,
    maxLength: 50,
  }),
  text: Type.String({
    description: "Message text to send",
    minLength: 1,
    maxLength: 4096,
  }),
  threadId: Type.Optional(
    Type.String({
      description: "Optional thread/chat id for the reply target",
      maxLength: 100,
    }),
  ),
});
