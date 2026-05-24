/** POST body: submit a user prompt for streaming completion. */
export interface ChatPromptRequest {
  /** Ephemeral client id (e.g. TUI instance). */
  clientId: string;
  prompt: string;
  /** Optional session for multi-turn; server may assign if omitted. */
  sessionId?: string;
}

export const CHAT_STREAM_EVENT = {
  TOKEN: "token",
  DONE: "done",
  ERROR: "error",
} as const;

export type ChatStreamEventType =
  (typeof CHAT_STREAM_EVENT)[keyof typeof CHAT_STREAM_EVENT];

export interface ChatTokenEvent {
  type: typeof CHAT_STREAM_EVENT.TOKEN;
  sessionId: string;
  token: string;
}

export interface ChatDoneEvent {
  type: typeof CHAT_STREAM_EVENT.DONE;
  sessionId: string;
  messageId: string;
}

export interface ChatErrorEvent {
  type: typeof CHAT_STREAM_EVENT.ERROR;
  code: string;
  message: string;
}

export type ChatStreamEvent = ChatTokenEvent | ChatDoneEvent | ChatErrorEvent;
