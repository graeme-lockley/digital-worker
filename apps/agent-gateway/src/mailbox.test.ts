import { describe, expect, it } from "vitest";

import { Mailbox } from "./mailbox.js";

describe("Mailbox", () => {
  it("tracks unread count and marks read on readUnread", () => {
    const mailbox = new Mailbox();
    mailbox.add({
      id: "1",
      channel: "telegram",
      sender: "graeme",
      text: "hello",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });

    expect(mailbox.unreadCount()).toBe(1);
    const unread = mailbox.readUnread();
    expect(unread).toHaveLength(1);
    expect(unread[0]?.text).toBe("hello");
    expect(mailbox.unreadCount()).toBe(0);
  });

  it("peeks without marking read", () => {
    const mailbox = new Mailbox();
    mailbox.add({
      id: "1",
      channel: "telegram",
      sender: "graeme",
      text: "hello",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });

    expect(mailbox.peekUnread()).toHaveLength(1);
    expect(mailbox.unreadCount()).toBe(1);
  });

  it("acks specific message ids", () => {
    const mailbox = new Mailbox();
    mailbox.add({
      id: "a",
      channel: "telegram",
      sender: "graeme",
      text: "one",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });
    mailbox.add({
      id: "b",
      channel: "telegram",
      sender: "graeme",
      text: "two",
      receivedAt: "2026-06-06T10:01:00.000Z",
    });

    expect(mailbox.ack(["a"])).toBe(1);
    expect(mailbox.unreadCount()).toBe(1);
  });
});
