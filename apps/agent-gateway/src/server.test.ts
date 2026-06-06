import { describe, expect, it, vi } from "vitest";

import { CorrelationRegistry } from "./correlation-registry.js";
import { Mailbox } from "./mailbox.js";
import { Notifier } from "./notifier.js";
import { createApp } from "./server.js";
import { TelegramAdapter } from "./telegram/adapter.js";

function createTestContext(options?: {
  fetchFn?: typeof fetch;
}) {
  const mailbox = new Mailbox();
  const correlations = new CorrelationRegistry();
  correlations.register("telegram:8672094762", {
    channel: "telegram",
    threadId: "8672094762",
    sender: "graeme",
  });

  const telegram = new TelegramAdapter({
    token: "test-token",
    allowedChatIds: new Set(["8672094762"]),
    fetchFn: options?.fetchFn,
  });

  const notifier = new Notifier({
    agentCoreUrl: "http://127.0.0.1:3000",
    mailbox,
    clientId: "test",
    inFlightTimeoutMs: 0,
  });

  const persist = vi.fn().mockResolvedValue(undefined);

  return { mailbox, correlations, telegram, notifier, persist };
}

describe("gateway server", () => {
  it("returns unread messages and marks them read", async () => {
    const { mailbox, correlations, telegram, notifier, persist } =
      createTestContext();
    mailbox.add({
      id: "1",
      channel: "telegram",
      sender: "graeme",
      text: "hello",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });

    const app = createApp({ mailbox, telegram, notifier, correlations, persist });
    const response = await app.request("/api/v1/messages");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      messages: Array<{ text: string }>;
      unreadCount: number;
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.text).toBe("hello");
    expect(body.unreadCount).toBe(0);
  });

  it("sends outbound telegram messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 99 } }),
    });

    const { mailbox, correlations, telegram, notifier, persist } =
      createTestContext({ fetchFn: fetchMock as unknown as typeof fetch });

    const app = createApp({ mailbox, telegram, notifier, correlations, persist });
    const response = await app.request("/api/v1/outbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "telegram",
        text: "Hi Graeme",
        threadId: "8672094762",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { delivered: boolean };
    expect(body.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("delivers auto-reply by correlation and acks messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });

    const { mailbox, correlations, telegram, notifier, persist } =
      createTestContext({ fetchFn: fetchMock as unknown as typeof fetch });

    mailbox.add({
      id: "msg-1",
      channel: "telegram",
      sender: "graeme",
      text: "hello",
      threadId: "8672094762",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });

    const app = createApp({ mailbox, telegram, notifier, correlations, persist });
    const response = await app.request("/api/v1/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        correlationId: "telegram:8672094762",
        text: "Hi back",
        messageIds: ["msg-1"],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { delivered: boolean };
    expect(body.delivered).toBe(true);
    expect(mailbox.unreadCount()).toBe(0);
    expect(persist).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns 404 for unknown correlation on reply", async () => {
    const { mailbox, correlations, telegram, notifier, persist } =
      createTestContext();

    const app = createApp({ mailbox, telegram, notifier, correlations, persist });
    const response = await app.request("/api/v1/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        correlationId: "telegram:unknown",
        text: "Hi",
      }),
    });

    expect(response.status).toBe(404);
  });
});
