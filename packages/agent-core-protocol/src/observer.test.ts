import { describe, expect, it } from "vitest";

import {
  OBSERVER_EVENT,
  OBSERVER_STREAM_ACCEPT,
  type ObserverEvent,
} from "./observer.js";

describe("observer protocol", () => {
  it("defines stable event discriminants", () => {
    expect(OBSERVER_EVENT.HELLO).toBe("hello");
    expect(OBSERVER_EVENT.JOB_ENQUEUED).toBe("job_enqueued");
    expect(OBSERVER_EVENT.JOB_STARTED).toBe("job_started");
    expect(OBSERVER_EVENT.JOB_FINISHED).toBe("job_finished");
    expect(OBSERVER_EVENT.TEXT_DELTA).toBe("text_delta");
    expect(OBSERVER_EVENT.THINKING_DELTA).toBe("thinking_delta");
    expect(OBSERVER_EVENT.TOOL_START).toBe("tool_start");
    expect(OBSERVER_EVENT.TOOL_END).toBe("tool_end");
  });

  it("accepts a representative event union", () => {
    const events: ObserverEvent[] = [
      {
        type: OBSERVER_EVENT.HELLO,
        agentId: "agent-1",
        sessionId: "session-1",
      },
      {
        type: OBSERVER_EVENT.JOB_ENQUEUED,
        jobId: "job-1",
        kind: "notify",
        clientId: "gateway",
        promptPreview: "You have 1 new message",
        at: "2026-06-06T10:00:00.000Z",
      },
      {
        type: OBSERVER_EVENT.THINKING_DELTA,
        jobId: "job-1",
        delta: "Let me think...",
      },
      {
        type: OBSERVER_EVENT.TOOL_START,
        jobId: "job-1",
        toolCallId: "tc-1",
        toolName: "read",
        args: { path: "foo.txt" },
      },
    ];

    expect(events).toHaveLength(4);
    expect(OBSERVER_STREAM_ACCEPT).toBe("text/event-stream");
  });
});
