import { describe, expect, it, vi } from "vitest";

import { Mailbox } from "./mailbox.js";
import { Notifier } from "./notifier.js";

describe("Notifier", () => {
  it("posts channel message notify with correlation fields", async () => {
    vi.useFakeTimers();

    const mailbox = new Mailbox();
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });

    const notifier = new Notifier({
      agentCoreUrl: "http://127.0.0.1:3000",
      mailbox,
      clientId: "test",
      debounceMs: 200,
      inFlightTimeoutMs: 0,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    mailbox.add({
      id: "msg-1",
      channel: "telegram",
      sender: "graeme",
      text: "hello there",
      threadId: "8672094762",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });
    notifier.onMailboxChanged();

    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlArg, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(urlArg)).toContain("/api/v1/notify");
    const body = JSON.parse(String(init.body)) as {
      prompt: string;
      correlationId: string;
      threadId: string;
      sender: string;
      messageIds: string[];
    };
    expect(body.prompt).toBe("hello there");
    expect(body.correlationId).toBe("telegram:8672094762");
    expect(body.threadId).toBe("8672094762");
    expect(body.sender).toBe("graeme");
    expect(body.messageIds).toEqual(["msg-1"]);
    expect(mailbox.unreadCount()).toBe(1);

    notifier.dispose();
    vi.useRealTimers();
  });

  it("coalesces burst messages on the same thread", async () => {
    vi.useFakeTimers();

    const mailbox = new Mailbox();
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });

    const notifier = new Notifier({
      agentCoreUrl: "http://127.0.0.1:3000",
      mailbox,
      clientId: "test",
      debounceMs: 200,
      inFlightTimeoutMs: 0,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    mailbox.add({
      id: "1",
      channel: "telegram",
      sender: "graeme",
      text: "one",
      threadId: "123",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });
    notifier.onMailboxChanged();

    mailbox.add({
      id: "2",
      channel: "telegram",
      sender: "graeme",
      text: "two",
      threadId: "123",
      receivedAt: "2026-06-06T10:00:01.000Z",
    });
    notifier.onMailboxChanged();

    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as { prompt: string; messageIds: string[] };
    expect(body.prompt).toBe("one\n\ntwo");
    expect(body.messageIds).toEqual(["1", "2"]);

    notifier.dispose();
    vi.useRealTimers();
  });

  it("skips duplicate notify for in-flight message ids", async () => {
    vi.useFakeTimers();

    const mailbox = new Mailbox();
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });

    const notifier = new Notifier({
      agentCoreUrl: "http://127.0.0.1:3000",
      mailbox,
      clientId: "test",
      debounceMs: 0,
      inFlightTimeoutMs: 0,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    mailbox.add({
      id: "1",
      channel: "telegram",
      sender: "graeme",
      text: "one",
      threadId: "123",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });
    notifier.onMailboxChanged();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    notifier.onMailboxChanged();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    notifier.dispose();
    vi.useRealTimers();
  });
});
