import { describe, expect, it, vi } from "vitest";

import { Mailbox } from "./mailbox.js";
import { Notifier } from "./notifier.js";
import { createApp } from "./server.js";
import { TelegramAdapter } from "./telegram/adapter.js";

describe("gateway server", () => {
  it("returns unread messages and marks them read", async () => {
    const mailbox = new Mailbox();
    mailbox.add({
      id: "1",
      channel: "telegram",
      sender: "graeme",
      text: "hello",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });

    const telegram = new TelegramAdapter({
      token: "test",
      allowedChatIds: new Set(["1"]),
    });
    const notifier = new Notifier({
      agentCoreUrl: "http://127.0.0.1:3000",
      mailbox,
      clientId: "test",
      renotifyIntervalMs: 0,
    });

    const app = createApp({ mailbox, telegram, notifier });
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

    const mailbox = new Mailbox();
    const telegram = new TelegramAdapter({
      token: "test-token",
      allowedChatIds: new Set(["8672094762"]),
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    const notifier = new Notifier({
      agentCoreUrl: "http://127.0.0.1:3000",
      mailbox,
      clientId: "test",
      renotifyIntervalMs: 0,
    });

    const app = createApp({ mailbox, telegram, notifier });
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
});
