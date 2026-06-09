import { describe, expect, it, vi } from "vitest";

import { CorrelationRegistry } from "./correlation-registry.js";
import { Mailbox } from "./mailbox.js";
import { Notifier } from "./notifier.js";
import type { GatewayPersistence } from "./persistence.js";
import { createApp } from "./server.js";
import { TelegramBotRegistry } from "./telegram/bot-registry.js";

const TEST_BOT = "testbot";

function createTestContext(options?: {
  fetchFn?: typeof fetch;
}) {
  const mailbox = new Mailbox();
  const correlations = new CorrelationRegistry();
  correlations.register(`telegram:${TEST_BOT}:8672094762`, {
    channel: "telegram",
    threadId: "8672094762",
    sender: "graeme",
    botId: TEST_BOT,
  });

  const telegramBots = new TelegramBotRegistry([
    {
      botId: TEST_BOT,
      token: "test-token",
      agentCoreUrl: "http://127.0.0.1:3000",
      allowedChatIds: new Set(["8672094762"]),
    },
  ]);

  const notifier = new Notifier({
    resolveAgentCoreUrl: (botId) => telegramBots.agentCoreUrlFor(botId),
    mailbox,
    clientId: "test",
    inFlightTimeoutMs: 0,
  });

  const persistence: GatewayPersistence = {
    onInboundMessage: vi.fn().mockResolvedValue(undefined),
    onMessagesRead: vi.fn().mockResolvedValue(undefined),
    onShutdown: vi.fn().mockResolvedValue(undefined),
  };

  return { mailbox, correlations, telegramBots, notifier, persistence };
}

describe("gateway server", () => {
  it("returns unread messages, marks them read, and persists", async () => {
    const { mailbox, correlations, telegramBots, notifier, persistence } =
      createTestContext();
    mailbox.add({
      id: "1",
      channel: "telegram",
      botId: TEST_BOT,
      sender: "graeme",
      text: "hello",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });

    const app = createApp({
      mailbox,
      telegramBots,
      notifier,
      correlations,
      persistence,
    });
    const response = await app.request("/api/v1/messages");
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      messages: Array<{ text: string }>;
      unreadCount: number;
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.text).toBe("hello");
    expect(body.unreadCount).toBe(0);
    expect(persistence.onMessagesRead).toHaveBeenCalledWith(["1"]);
  });

  it("sends outbound telegram messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 99 } }),
    });

    const { mailbox, correlations, telegramBots, notifier, persistence } =
      createTestContext({ fetchFn: fetchMock as unknown as typeof fetch });

    const adapter = telegramBots.getAdapter(TEST_BOT);
    (adapter as unknown as { options: { fetchFn: typeof fetch } }).options.fetchFn =
      fetchMock as unknown as typeof fetch;

    const app = createApp({
      mailbox,
      telegramBots,
      notifier,
      correlations,
      persistence,
    });
    const response = await app.request("/api/v1/outbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "telegram",
        text: "Hi Graeme",
        threadId: "8672094762",
        botId: TEST_BOT,
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

    const { mailbox, correlations, telegramBots, notifier, persistence } =
      createTestContext({ fetchFn: fetchMock as unknown as typeof fetch });

    const adapter = telegramBots.getAdapter(TEST_BOT);
    (adapter as unknown as { options: { fetchFn: typeof fetch } }).options.fetchFn =
      fetchMock as unknown as typeof fetch;

    mailbox.add({
      id: "msg-1",
      channel: "telegram",
      botId: TEST_BOT,
      sender: "graeme",
      text: "hello",
      threadId: "8672094762",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });

    const app = createApp({
      mailbox,
      telegramBots,
      notifier,
      correlations,
      persistence,
    });
    const response = await app.request("/api/v1/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        correlationId: `telegram:${TEST_BOT}:8672094762`,
        text: "Hi back",
        messageIds: ["msg-1"],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { delivered: boolean };
    expect(body.delivered).toBe(true);
    expect(mailbox.unreadCount()).toBe(0);
    expect(persistence.onMessagesRead).toHaveBeenCalledWith(["msg-1"]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns 404 for unknown correlation on reply", async () => {
    const { mailbox, correlations, telegramBots, notifier, persistence } =
      createTestContext();

    const app = createApp({
      mailbox,
      telegramBots,
      notifier,
      correlations,
      persistence,
    });
    const response = await app.request("/api/v1/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        correlationId: "telegram:unknown:999",
        text: "Hi",
      }),
    });

    expect(response.status).toBe(404);
  });

  it("fans out group auto-replies to other configured bots", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });

    const groupId = "-5286192919";
    const mailbox = new Mailbox();
    const correlations = new CorrelationRegistry();
    correlations.register(`telegram:aidadigitalbot:${groupId}`, {
      channel: "telegram",
      threadId: groupId,
      sender: "graeme",
      botId: "aidadigitalbot",
    });

    const telegramBots = new TelegramBotRegistry([
      {
        botId: "aidadigitalbot",
        token: "aida-token",
        agentCoreUrl: "http://agent-core-aida:3000",
        allowedChatIds: new Set([groupId]),
      },
      {
        botId: "riaandigitalbot",
        token: "riaan-token",
        agentCoreUrl: "http://agent-core-riaan:3000",
        allowedChatIds: new Set([groupId]),
      },
    ]);

    for (const botId of ["aidadigitalbot", "riaandigitalbot"] as const) {
      const adapter = telegramBots.getAdapter(botId);
      (adapter as unknown as { options: { fetchFn: typeof fetch } }).options.fetchFn =
        fetchMock as unknown as typeof fetch;
    }

    const notifier = new Notifier({
      resolveAgentCoreUrl: (botId) => telegramBots.agentCoreUrlFor(botId),
      mailbox,
      clientId: "test",
      inFlightTimeoutMs: 0,
    });

    const persistence: GatewayPersistence = {
      onInboundMessage: vi.fn().mockResolvedValue(undefined),
      onMessagesRead: vi.fn().mockResolvedValue(undefined),
      onShutdown: vi.fn().mockResolvedValue(undefined),
    };

    mailbox.add({
      id: "msg-group",
      channel: "telegram",
      botId: "aidadigitalbot",
      sender: "graeme",
      text: "hello group",
      threadId: groupId,
      receivedAt: "2026-06-06T10:00:00.000Z",
    });

    const app = createApp({
      mailbox,
      telegramBots,
      notifier,
      correlations,
      persistence,
    });
    const response = await app.request("/api/v1/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        correlationId: `telegram:aidadigitalbot:${groupId}`,
        text: "Reply from Aida",
        messageIds: ["msg-group"],
      }),
    });

    expect(response.status).toBe(200);
    const peerMessages = mailbox
      .peekUnread()
      .filter((message) => message.botId === "riaandigitalbot");
    expect(peerMessages).toHaveLength(1);
    expect(peerMessages[0]?.sender).toBe("aidadigitalbot");
    expect(peerMessages[0]?.text).toBe("Reply from Aida");
    expect(peerMessages[0]?.threadId).toBe(groupId);
    expect(persistence.onInboundMessage).toHaveBeenCalled();
  });
});
