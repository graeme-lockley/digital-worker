import { describe, expect, it } from "vitest";

import {
  CHAT_STREAM_EVENT,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";

import { parseSseBuffer } from "./chat-fire-client.js";

describe("parseSseBuffer", () => {
  it("parses token and done SSE events", () => {
    const token: ChatStreamEvent = {
      type: CHAT_STREAM_EVENT.TOKEN,
      sessionId: "s1",
      token: "hello",
    };
    const done: ChatStreamEvent = {
      type: CHAT_STREAM_EVENT.DONE,
      sessionId: "s1",
      messageId: "m1",
    };
    const buffer = `data: ${JSON.stringify(token)}\n\ndata: ${JSON.stringify(done)}\n\npartial`;
    const { events, rest } = parseSseBuffer(buffer);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(token);
    expect(events[1]).toEqual(done);
    expect(rest).toBe("partial");
  });
});
