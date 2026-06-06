import { OBSERVER_EVENT } from "@digital-worker/agent-core-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INITIAL_RECONNECT_BACKOFF_MS,
  runObserverReconnectLoop,
} from "./observer-reconnect.js";

const helloEvent = {
  type: OBSERVER_EVENT.HELLO,
  agentId: "agent-1",
  sessionId: "session-1",
} as const;

vi.mock("./observer-client.js", () => ({
  ObserverClientError: class ObserverClientError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ObserverClientError";
    }
  },
  streamObserver: vi.fn(),
}));

vi.mock("./agent-health.js", () => ({
  waitForAgentHealth: vi.fn(async () => {}),
}));

import { waitForAgentHealth } from "./agent-health.js";
import { streamObserver } from "./observer-client.js";

describe("runObserverReconnectLoop", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reconnects after the stream closes", async () => {
    const streamObserverMock = vi.mocked(streamObserver);
    streamObserverMock
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async ({ signal, onEvent }) => {
        onEvent(helloEvent);
        if (!signal) {
          return;
        }
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      });

    const sleeps: number[] = [];
    const controller = new AbortController();
    const onStreamClosed = vi.fn();
    const onReconnecting = vi.fn();

    const loop = runObserverReconnectLoop({
      agentBaseUrl: "http://127.0.0.1:3000",
      signal: controller.signal,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      onEvent: vi.fn(),
      onStreamClosed,
      onReconnecting,
      onTransientError: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(onStreamClosed).toHaveBeenCalledTimes(1);
    });
    expect(onReconnecting).toHaveBeenCalledWith(
      1,
      INITIAL_RECONNECT_BACKOFF_MS * 2,
    );
    expect(sleeps).toEqual([INITIAL_RECONNECT_BACKOFF_MS * 2]);
    await vi.waitFor(() => {
      expect(waitForAgentHealth).toHaveBeenCalledTimes(1);
    });

    controller.abort();
    await loop;
    expect(streamObserverMock).toHaveBeenCalledTimes(2);
  });

  it("backs off after transient connection errors", async () => {
    const streamObserverMock = vi.mocked(streamObserver);
    streamObserverMock.mockRejectedValue(new Error("connection reset"));

    const sleeps: number[] = [];
    const controller = new AbortController();
    const onTransientError = vi.fn();

    const loop = runObserverReconnectLoop({
      agentBaseUrl: "http://127.0.0.1:3000",
      signal: controller.signal,
      sleep: async (ms) => {
        sleeps.push(ms);
        if (sleeps.length >= 2) {
          controller.abort();
        }
      },
      onEvent: vi.fn(),
      onStreamClosed: vi.fn(),
      onReconnecting: vi.fn(),
      onTransientError,
    });

    await loop;

    expect(onTransientError).toHaveBeenCalledWith("connection reset");
    expect(sleeps).toEqual([
      INITIAL_RECONNECT_BACKOFF_MS * 2,
      INITIAL_RECONNECT_BACKOFF_MS * 4,
    ]);
  });
});
