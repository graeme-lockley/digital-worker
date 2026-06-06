import {
  OBSERVER_EVENT,
  type ObserverEvent,
} from "@digital-worker/agent-core-protocol";
import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type { InboxJob } from "./job-types.js";

const PROMPT_PREVIEW_MAX = 120;

export function promptPreview(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= PROMPT_PREVIEW_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, PROMPT_PREVIEW_MAX)}…`;
}

export function observerTimestamp(): string {
  return new Date().toISOString();
}

export function mapAgentEventToObserver(
  event: AgentEvent,
  jobId: string,
): ObserverEvent | undefined {
  switch (event.type) {
    case "message_update": {
      const deltaEvent = event.assistantMessageEvent;
      if (deltaEvent.type === "text_delta" && deltaEvent.delta.length > 0) {
        return {
          type: OBSERVER_EVENT.TEXT_DELTA,
          jobId,
          delta: deltaEvent.delta,
        };
      }
      if (
        deltaEvent.type === "thinking_delta" &&
        deltaEvent.delta.length > 0
      ) {
        return {
          type: OBSERVER_EVENT.THINKING_DELTA,
          jobId,
          delta: deltaEvent.delta,
        };
      }
      return undefined;
    }
    case "tool_execution_start":
      return {
        type: OBSERVER_EVENT.TOOL_START,
        jobId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      };
    case "tool_execution_end":
      return {
        type: OBSERVER_EVENT.TOOL_END,
        jobId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
      };
    default:
      return undefined;
  }
}

export function jobEnqueuedEvent(job: InboxJob): ObserverEvent {
  return {
    type: OBSERVER_EVENT.JOB_ENQUEUED,
    jobId: job.id,
    kind: job.kind,
    clientId: job.clientId,
    promptPreview: promptPreview(job.prompt),
    at: observerTimestamp(),
  };
}

export function jobStartedEvent(job: InboxJob): ObserverEvent {
  return {
    type: OBSERVER_EVENT.JOB_STARTED,
    jobId: job.id,
    kind: job.kind,
    clientId: job.clientId,
    promptPreview: promptPreview(job.prompt),
    at: observerTimestamp(),
  };
}

export function jobFinishedEvent(
  job: InboxJob,
  status: "completed" | "failed" | "cancelled",
): ObserverEvent {
  return {
    type: OBSERVER_EVENT.JOB_FINISHED,
    jobId: job.id,
    kind: job.kind,
    clientId: job.clientId,
    status,
    at: observerTimestamp(),
  };
}
