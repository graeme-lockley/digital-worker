/** Job kinds that enter the worker inbox. */
export type ObserverJobKind = "chat" | "notify";

export const OBSERVER_EVENT = {
  HELLO: "hello",
  JOB_ENQUEUED: "job_enqueued",
  JOB_STARTED: "job_started",
  JOB_FINISHED: "job_finished",
  TEXT_DELTA: "text_delta",
  THINKING_DELTA: "thinking_delta",
  TOOL_START: "tool_start",
  TOOL_END: "tool_end",
} as const;

export type ObserverEventType =
  (typeof OBSERVER_EVENT)[keyof typeof OBSERVER_EVENT];

export type ObserverJobStatus = "completed" | "failed" | "cancelled";

export interface ObserverHelloEvent {
  type: typeof OBSERVER_EVENT.HELLO;
  agentId: string;
  sessionId: string;
}

export interface ObserverJobEnqueuedEvent {
  type: typeof OBSERVER_EVENT.JOB_ENQUEUED;
  jobId: string;
  kind: ObserverJobKind;
  clientId: string;
  promptPreview: string;
  at: string;
}

export interface ObserverJobStartedEvent {
  type: typeof OBSERVER_EVENT.JOB_STARTED;
  jobId: string;
  kind: ObserverJobKind;
  clientId: string;
  promptPreview: string;
  at: string;
}

export interface ObserverJobFinishedEvent {
  type: typeof OBSERVER_EVENT.JOB_FINISHED;
  jobId: string;
  kind: ObserverJobKind;
  clientId: string;
  status: ObserverJobStatus;
  at: string;
}

export interface ObserverTextDeltaEvent {
  type: typeof OBSERVER_EVENT.TEXT_DELTA;
  jobId: string;
  delta: string;
}

export interface ObserverThinkingDeltaEvent {
  type: typeof OBSERVER_EVENT.THINKING_DELTA;
  jobId: string;
  delta: string;
}

export interface ObserverToolStartEvent {
  type: typeof OBSERVER_EVENT.TOOL_START;
  jobId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ObserverToolEndEvent {
  type: typeof OBSERVER_EVENT.TOOL_END;
  jobId: string;
  toolCallId: string;
  toolName: string;
  isError: boolean;
}

export type ObserverEvent =
  | ObserverHelloEvent
  | ObserverJobEnqueuedEvent
  | ObserverJobStartedEvent
  | ObserverJobFinishedEvent
  | ObserverTextDeltaEvent
  | ObserverThinkingDeltaEvent
  | ObserverToolStartEvent
  | ObserverToolEndEvent;

/** Accept header for SSE observer responses. */
export const OBSERVER_STREAM_ACCEPT = "text/event-stream";
