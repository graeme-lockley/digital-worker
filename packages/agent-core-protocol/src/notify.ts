/** POST body for async notification ingress. */
export type NotifyRequest = {
  /** Ephemeral client id (e.g. agent-gateway instance). */
  clientId: string;
  /**
   * Prompt text. For channel-message mode this is the raw inbound message(s);
   * for legacy doorbell mode this is a thin notification only.
   */
  prompt: string;
  /** Optional session for correlation with the worker session id. */
  sessionId?: string;
  /** Source channel (e.g. telegram, email). */
  channel?: string;
  /** Unread count at time of notification (legacy doorbell). */
  unreadCount?: number;
  /**
   * Conversation correlation id (e.g. telegram:123456789).
   * When present, agent-core auto-delivers the assistant reply back via gateway.
   */
  correlationId?: string;
  /** Thread/chat id for reply routing. */
  threadId?: string;
  /** Sender display name on the channel. */
  sender?: string;
  /** Mailbox message ids included in this turn. */
  messageIds?: string[];
};

/** Response after a notification is accepted for processing. */
export type NotifyResponse = {
  jobId: string;
  acceptedAt: string;
};
