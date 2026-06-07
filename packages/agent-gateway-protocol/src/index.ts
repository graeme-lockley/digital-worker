/** Inbound message stored in the gateway mailbox. */
export type InboundMessage = {
  id: string;
  channel: string;
  /** Telegram bot routing id (e.g. aidadigitalbot) when multiple bots are configured. */
  botId?: string;
  sender: string;
  text: string;
  threadId?: string;
  receivedAt: string;
  read: boolean;
};

/** POST body for sending an outbound message via a channel adapter. */
export type OutboundRequest = {
  channel: string;
  text: string;
  threadId?: string;
  /** Required when multiple Telegram bots are configured. */
  botId?: string;
};

export type OutboundResponse = {
  delivered: boolean;
  providerMessageId?: string;
};

/** GET /api/v1/messages response. */
export type MessagesResponse = {
  messages: InboundMessage[];
  unreadCount: number;
};

/** POST /api/v1/ack body. */
export type AckRequest = {
  ids: string[];
};

export type AckResponse = {
  acked: number;
};

/** Registered conversation routing entry. */
export type CorrelationEntry = {
  channel: string;
  threadId: string;
  sender: string;
  botId?: string;
};

/** POST body for auto-reply delivery from agent-core. */
export type ReplyRequest = {
  correlationId: string;
  text: string;
  messageIds?: string[];
};

export type ReplyResponse = {
  delivered: boolean;
  providerMessageId?: string;
};

/** HTTP paths implemented by agent-gateway. */
export const GATEWAY_PATHS = {
  health: "/health",
  messages: "/api/v1/messages",
  outbound: "/api/v1/outbound",
  ack: "/api/v1/ack",
  reply: "/api/v1/reply",
} as const;
