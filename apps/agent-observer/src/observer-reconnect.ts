import {
  OBSERVER_EVENT,
  type ObserverEvent,
} from "@digital-worker/agent-core-protocol";

import { waitForAgentHealth } from "./agent-health.js";
import {
  ObserverClientError,
  streamObserver,
} from "./observer-client.js";

export const INITIAL_RECONNECT_BACKOFF_MS = 500;
export const MAX_RECONNECT_BACKOFF_MS = 30_000;
export const RECONNECT_HEALTH_TIMEOUT_MS = 60_000;

export type ObserverReconnectCallbacks = {
  onEvent: (event: ObserverEvent) => void;
  onStreamClosed: () => void;
  onReconnecting: (attempt: number, delayMs: number) => void;
  onTransientError: (message: string) => void;
};

export type RunObserverReconnectLoopOptions = ObserverReconnectCallbacks & {
  agentBaseUrl: string;
  signal: AbortSignal;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

function nextBackoff(current: number): number {
  return Math.min(current * 2, MAX_RECONNECT_BACKOFF_MS);
}

/** Maintain a live observer SSE connection with backoff reconnect. */
export async function runObserverReconnectLoop(
  options: RunObserverReconnectLoopOptions,
): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 0;
  let backoff = INITIAL_RECONNECT_BACKOFF_MS;

  while (!options.signal.aborted) {
    if (attempt > 0) {
      options.onReconnecting(attempt, backoff);
      await sleep(backoff);
      if (options.signal.aborted) {
        return;
      }

      try {
        await waitForAgentHealth(options.agentBaseUrl, {
          timeoutMs: RECONNECT_HEALTH_TIMEOUT_MS,
          fetchFn: options.fetchFn,
          sleep,
          signal: options.signal,
        });
      } catch {
        if (options.signal.aborted) {
          return;
        }
        options.onTransientError(
          "agent unreachable (waiting for it to come back online)",
        );
        backoff = nextBackoff(backoff);
        attempt += 1;
        continue;
      }
    }

    try {
      await streamObserver({
        agentBaseUrl: options.agentBaseUrl,
        signal: options.signal,
        fetchFn: options.fetchFn,
        onEvent: (event) => {
          if (event.type === OBSERVER_EVENT.HELLO) {
            backoff = INITIAL_RECONNECT_BACKOFF_MS;
            attempt = 0;
          }
          options.onEvent(event);
        },
      });

      if (options.signal.aborted) {
        return;
      }

      options.onStreamClosed();
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }

      const message =
        error instanceof ObserverClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : "observer connection failed";
      options.onTransientError(message);
    }

    attempt += 1;
    backoff = nextBackoff(backoff);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
