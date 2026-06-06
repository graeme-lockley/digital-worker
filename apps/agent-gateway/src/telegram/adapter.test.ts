import { describe, expect, it } from "vitest";

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
      id: "telegram-42",
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
});

describe("parseAllowedChatIds", () => {
  it("parses comma-separated ids", () => {
    const ids = parseAllowedChatIds("111, 222 ,333");
    expect([...ids]).toEqual(["111", "222", "333"]);
  });
});
