import { OBSERVER_EVENT } from "@digital-worker/agent-core-protocol";
import { describe, expect, it } from "vitest";

import {
  jobEnqueuedEvent,
  jobFinishedEvent,
  jobStartedEvent,
  mapAgentEventToObserver,
  promptPreview,
} from "./observer-map.js";

describe("observer-map", () => {
  const job = {
    kind: "chat" as const,
    id: "job-1",
    messageId: "msg-1",
    clientId: "client-1",
    prompt: "hello world",
    sessionId: "session-1",
    enqueueAt: Date.now(),
    signal: new AbortController().signal,
    emit: async () => {},
  };

  it("truncates long prompt previews", () => {
    const long = "x".repeat(200);
    expect(promptPreview(long).endsWith("…")).toBe(true);
    expect(promptPreview("short")).toBe("short");
  });

  it("maps lifecycle events", () => {
    expect(jobEnqueuedEvent(job).type).toBe(OBSERVER_EVENT.JOB_ENQUEUED);
    expect(jobStartedEvent(job).type).toBe(OBSERVER_EVENT.JOB_STARTED);
    const finished = jobFinishedEvent(job, "completed");
    expect(finished.type).toBe(OBSERVER_EVENT.JOB_FINISHED);
    if (finished.type === OBSERVER_EVENT.JOB_FINISHED) {
      expect(finished.status).toBe("completed");
    }
  });

  it("maps pi agent events", () => {
    expect(
      mapAgentEventToObserver(
        {
          type: "message_update",
          message: {} as never,
          assistantMessageEvent: {
            type: "text_delta",
            delta: "hi",
            contentIndex: 0,
            partial: {} as never,
          },
        },
        "job-1",
      ),
    ).toEqual({
      type: OBSERVER_EVENT.TEXT_DELTA,
      jobId: "job-1",
      delta: "hi",
    });

    expect(
      mapAgentEventToObserver(
        {
          type: "message_update",
          message: {} as never,
          assistantMessageEvent: {
            type: "thinking_delta",
            delta: "hmm",
            contentIndex: 0,
            partial: {} as never,
          },
        },
        "job-1",
      ),
    ).toEqual({
      type: OBSERVER_EVENT.THINKING_DELTA,
      jobId: "job-1",
      delta: "hmm",
    });

    expect(
      mapAgentEventToObserver(
        {
          type: "tool_execution_start",
          toolCallId: "tc-1",
          toolName: "read",
          args: { path: "a.txt" },
        },
        "job-1",
      ),
    ).toMatchObject({
      type: OBSERVER_EVENT.TOOL_START,
      toolName: "read",
    });
  });
});
