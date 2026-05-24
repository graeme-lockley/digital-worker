/** Envelope for a message sent from one agent to another. */
export interface AgentMessage<TPayload = unknown> {
  messageId: string;
  fromAgentId: string;
  toAgentId: string;
  type: string;
  payload: TPayload;
  sentAt: string;
}

/** Envelope for a reply to an {@link AgentMessage}. */
export interface AgentMessageResponse<TPayload = unknown> {
  messageId: string;
  inReplyTo: string;
  payload: TPayload;
  sentAt: string;
}

/** POST body for delivering a message to an agent. */
export interface DeliverMessageRequest<TPayload = unknown> {
  message: AgentMessage<TPayload>;
}

/** Response after an agent accepts a message for processing. */
export interface DeliverMessageResponse {
  messageId: string;
  acceptedAt: string;
}
