/** POST body for async doorbell notification ingress. */
export type NotifyRequest = {
  /** Ephemeral client id (e.g. agent-gateway instance). */
  clientId: string;
  /** Doorbell prompt text (no message payload). */
  prompt: string;
  /** Optional session for correlation with the worker session id. */
  sessionId?: string;
  /** Source channel (e.g. telegram, email). */
  channel?: string;
  /** Unread count at time of notification. */
  unreadCount?: number;
};

/** Response after a notification is accepted for processing. */
export type NotifyResponse = {
  jobId: string;
  acceptedAt: string;
};
