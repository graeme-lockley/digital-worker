import { describe, expect, it } from "vitest";

import { isTelegramGroupChatId } from "./group-peer-fanout.js";

describe("isTelegramGroupChatId", () => {
  it("returns true for negative Telegram chat ids", () => {
    expect(isTelegramGroupChatId("-5286192919")).toBe(true);
    expect(isTelegramGroupChatId("-1001234567890")).toBe(true);
  });

  it("returns false for private DM ids and invalid values", () => {
    expect(isTelegramGroupChatId("8672094762")).toBe(false);
    expect(isTelegramGroupChatId("")).toBe(false);
    expect(isTelegramGroupChatId(undefined)).toBe(false);
  });
});
