import { describe, expect, it, vi } from "vitest";

import {
  CHAT_STREAM_EVENT,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";

import { parseSseBuffer, streamChat } from "./chat-client.js";

describe("parseSseBuffer", () => {
  it("parses SSE data lines", () => {
    const token: ChatStreamEvent = {
      type: CHAT_STREAM_EVENT.TOKEN,
      sessionId: "s1",
      token: "a",
    };
    const buffer = `data: ${JSON.stringify(token)}\n\n`;
    const { events } = parseSseBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(token);
  });
});

describe("streamChat", () => {
  it("invokes onEvent for streamed tokens", async () => {
    const token: ChatStreamEvent = {
      type: CHAT_STREAM_EVENT.TOKEN,
      sessionId: "s1",
      token: "hi",
    };
    const done: ChatStreamEvent = {
      type: CHAT_STREAM_EVENT.DONE,
      sessionId: "s1",
      messageId: "m1",
    };
    const body = `data: ${JSON.stringify(token)}\n\ndata: ${JSON.stringify(done)}\n\n`;

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
    });

    const events: ChatStreamEvent[] = [];
    await streamChat({
      agentBaseUrl: "http://127.0.0.1:3000",
      clientId: "tui-1",
      prompt: "hello",
      onEvent: (e) => events.push(e),
      fetchFn,
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe(CHAT_STREAM_EVENT.TOKEN);
    expect(events[1]?.type).toBe(CHAT_STREAM_EVENT.DONE);
  });
});
