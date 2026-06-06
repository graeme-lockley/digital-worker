import { describe, expect, it, vi } from "vitest";

import { Mailbox } from "./mailbox.js";
import { Notifier } from "./notifier.js";

describe("Notifier", () => {
  it("builds doorbell prompt from unread messages", () => {
    const mailbox = new Mailbox();
    const notifier = new Notifier({
      agentCoreUrl: "http://127.0.0.1:3000",
      mailbox,
      clientId: "test",
    });

    const prompt = notifier.buildPrompt(2, ["graeme", "graeme"]);
    expect(prompt).toContain("2 new Telegram messages");
    expect(prompt).toContain("graeme");
    expect(prompt).toContain("telegram skill");
  });

  it("debounces notification until burst settles", async () => {
    vi.useFakeTimers();

    const mailbox = new Mailbox();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    });

    const notifier = new Notifier({
      agentCoreUrl: "http://127.0.0.1:3000",
      mailbox,
      clientId: "test",
      debounceMs: 200,
      renotifyIntervalMs: 0,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    mailbox.add({
      id: "1",
      channel: "telegram",
      sender: "graeme",
      text: "one",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });
    notifier.onMailboxChanged();

    mailbox.add({
      id: "2",
      channel: "telegram",
      sender: "graeme",
      text: "two",
      receivedAt: "2026-06-06T10:00:01.000Z",
    });
    notifier.onMailboxChanged();

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    notifier.dispose();
    vi.useRealTimers();
  });

  it("suppresses notify while notification is outstanding", async () => {
    vi.useFakeTimers();

    const mailbox = new Mailbox();
    let resolveRead: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRead = () =>
            resolve({
              ok: true,
              body: {
                getReader: () => ({
                  read: async () => ({ done: true, value: undefined }),
                }),
              },
            } as unknown as Response);
        }),
    );

    const notifier = new Notifier({
      agentCoreUrl: "http://127.0.0.1:3000",
      mailbox,
      clientId: "test",
      debounceMs: 0,
      renotifyIntervalMs: 0,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    mailbox.add({
      id: "1",
      channel: "telegram",
      sender: "graeme",
      text: "one",
      receivedAt: "2026-06-06T10:00:00.000Z",
    });
    notifier.onMailboxChanged();
    await vi.advanceTimersByTimeAsync(0);

    mailbox.add({
      id: "2",
      channel: "telegram",
      sender: "graeme",
      text: "two",
      receivedAt: "2026-06-06T10:00:01.000Z",
    });
    notifier.onMailboxChanged();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRead?.();
    await Promise.resolve();

    notifier.dispose();
    vi.useRealTimers();
  });
});
