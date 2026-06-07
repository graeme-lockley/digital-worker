import { describe, expect, it } from "vitest";

import { GatewayStore } from "./gateway-store.js";

describe("GatewayStore", () => {
  it("persists and loads bootstrap state", async () => {
    const store = await GatewayStore.create(":memory:");

    await store.upsertMessage({
      id: "msg-1",
      channel: "telegram",
      sender: "graeme",
      text: "hello",
      threadId: "123",
      receivedAt: "2026-06-07T10:00:00.000Z",
      read: false,
    });
    await store.upsertCorrelation("telegram:123", {
      channel: "telegram",
      threadId: "123",
      sender: "graeme",
    });
    await store.setTelegramOffset(42);

    const loaded = await store.loadBootstrap();
    expect(loaded.messages).toHaveLength(1);
    expect(loaded.messages[0]?.text).toBe("hello");
    expect(loaded.correlations["telegram:123"]?.threadId).toBe("123");
    expect(loaded.telegramOffset).toBe(42);

    await store.close();
  });

  it("marks messages read", async () => {
    const store = await GatewayStore.create(":memory:");

    await store.upsertMessage({
      id: "msg-1",
      channel: "telegram",
      sender: "graeme",
      text: "hello",
      receivedAt: "2026-06-07T10:00:00.000Z",
      read: false,
    });
    await store.markMessagesRead(["msg-1"]);

    const loaded = await store.loadBootstrap();
    expect(loaded.messages[0]?.read).toBe(true);

    await store.close();
  });

  it("prunes read messages older than the retention window", async () => {
    const store = await GatewayStore.create(":memory:");
    const oldRead = "2020-01-01T00:00:00.000Z";
    const recentRead = new Date().toISOString();

    await store.upsertMessage({
      id: "old-read",
      channel: "telegram",
      sender: "graeme",
      text: "old",
      receivedAt: oldRead,
      read: true,
    });
    await store.upsertMessage({
      id: "recent-read",
      channel: "telegram",
      sender: "graeme",
      text: "recent",
      receivedAt: recentRead,
      read: true,
    });
    await store.upsertMessage({
      id: "old-unread",
      channel: "telegram",
      sender: "graeme",
      text: "still here",
      receivedAt: oldRead,
      read: false,
    });

    const deleted = await store.pruneReadMessagesOlderThan(30);
    expect(deleted).toBe(1);

    const loaded = await store.loadBootstrap();
    expect(loaded.messages.map((message) => message.id).sort()).toEqual([
      "old-unread",
      "recent-read",
    ]);

    await store.close();
  });

  it("serializes concurrent writes", async () => {
    const store = await GatewayStore.create(":memory:");

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.setTelegramOffset(i)),
    );

    const loaded = await store.loadBootstrap();
    expect(typeof loaded.telegramOffset).toBe("number");

    await store.close();
  });
});
