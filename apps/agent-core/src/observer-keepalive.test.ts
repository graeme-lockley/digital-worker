import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OBSERVER_SSE_PING_COMMENT,
  startObserverKeepalive,
} from "./observer-keepalive.js";

describe("startObserverKeepalive", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes SSE comment pings on interval until aborted", async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const write = vi.fn(async (chunk: string) => {
      writes.push(chunk);
    });
    const controller = new AbortController();

    const stop = startObserverKeepalive(write, 1_000, controller.signal);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(write).toHaveBeenCalledWith(OBSERVER_SSE_PING_COMMENT);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(write).toHaveBeenCalledTimes(3);

    controller.abort();
    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(write).toHaveBeenCalledTimes(3);
  });
});
