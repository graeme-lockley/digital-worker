import { describe, expect, it, vi } from "vitest";

import {
  parseAllowedChatIds,
  TelegramAdapter,
  type TelegramUpdate,
} from "./adapter.js";

describe("TelegramAdapter", () => {
  const allowed = parseAllowedChatIds("8672094762");

  it("normalizes allowed messages", () => {
    const adapter = new TelegramAdapter({
      token: "test-token",
      allowedChatIds: allowed,
    });

    const update: TelegramUpdate = {
      update_id: 42,
      message: {
        message_id: 7,
        chat: { id: 8672094762, type: "private" },
        from: { id: 8672094762, username: "graeme", first_name: "Graeme" },
        text: "  Hello Aida  ",
        date: 1717660800,
      },
    };

    const normalized = adapter.normalizeUpdate(update);
    expect(normalized).toMatchObject({
      id: "telegram-default-42",
      channel: "telegram",
      sender: "graeme",
      text: "Hello Aida",
      threadId: "8672094762",
    });
  });

  it("drops messages from non-allowlisted chat ids", () => {
    const adapter = new TelegramAdapter({
      token: "test-token",
      allowedChatIds: allowed,
    });

    const update: TelegramUpdate = {
      update_id: 43,
      message: {
        message_id: 8,
        chat: { id: 999, type: "private" },
        text: "spam",
        date: 1717660800,
      },
    };

    expect(adapter.normalizeUpdate(update)).toBeNull();
  });

  it("reports blocked chats once via onBlockedChat", () => {
    const onBlockedChat = vi.fn();
    const adapter = new TelegramAdapter({
      token: "test-token",
      botId: "aidadigitalbot",
      allowedChatIds: allowed,
      onBlockedChat,
    });

    const groupUpdate: TelegramUpdate = {
      update_id: 50,
      message: {
        message_id: 10,
        chat: { id: -1001234567890, type: "supergroup" },
        from: { id: 1, username: "graeme" },
        text: "hello team",
        date: 1717660800,
      },
    };

    expect(adapter.normalizeUpdate(groupUpdate)).toBeNull();
    expect(onBlockedChat).toHaveBeenCalledTimes(1);
    expect(onBlockedChat).toHaveBeenCalledWith({
      botId: "aidadigitalbot",
      chatId: "-1001234567890",
      chatType: "supergroup",
    });

    expect(adapter.normalizeUpdate(groupUpdate)).toBeNull();
    expect(onBlockedChat).toHaveBeenCalledTimes(1);
  });

  it("drops messages without text", () => {
    const adapter = new TelegramAdapter({
      token: "test-token",
      allowedChatIds: allowed,
    });

    const update: TelegramUpdate = {
      update_id: 44,
      message: {
        message_id: 9,
        chat: { id: 8672094762, type: "private" },
        date: 1717660800,
      },
    };

    expect(adapter.normalizeUpdate(update)).toBeNull();
  });

  it("sends markdown as HTML with parse_mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    });

    const adapter = new TelegramAdapter({
      token: "test-token",
      allowedChatIds: allowed,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await adapter.send("Hello **world**", "8672094762");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { parse_mode?: string; text: string };
    expect(body.parse_mode).toBe("HTML");
    expect(body.text).toContain("<b>world</b>");
  });

  it("falls back to plain text when HTML send is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: async () => "Bad Request: can't parse entities",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 2 } }),
      });

    const adapter = new TelegramAdapter({
      token: "test-token",
      allowedChatIds: allowed,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await adapter.send("Hello **world**", "8672094762");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string,
    ) as { parse_mode?: string; text: string };
    expect(fallbackBody.parse_mode).toBeUndefined();
    expect(fallbackBody.text).toBe("Hello **world**");
  });
});

describe("parseAllowedChatIds", () => {
  it("parses comma-separated ids", () => {
    const ids = parseAllowedChatIds("111, 222 ,333");
    expect([...ids]).toEqual(["111", "222", "333"]);
  });
});
