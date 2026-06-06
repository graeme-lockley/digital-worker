import {
  AGENT_CORE_PATHS,
  OBSERVER_EVENT,
  type ObserverEvent,
} from "@digital-worker/agent-core-protocol";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

import {
  OBSERVER_SSE_PING_INTERVAL_MS,
  startObserverKeepalive,
} from "./observer-keepalive.js";
import type { AppContext } from "./server.js";

export function registerObserverRoute(
  app: {
    get: (
      path: string,
      handler: (c: Context) => Response | Promise<Response>,
    ) => void;
  },
  ctx: AppContext,
): void {
  app.get(AGENT_CORE_PATHS.observer, (c) => handleObserver(c, ctx));
}

async function handleObserver(c: Context, ctx: AppContext): Promise<Response> {
  return streamSSE(c, async (stream) => {
    const emit = async (event: ObserverEvent): Promise<void> => {
      await stream.writeSSE({ data: JSON.stringify(event) });
    };

    const hello: ObserverEvent = {
      type: OBSERVER_EVENT.HELLO,
      agentId: ctx.agentId,
      sessionId: ctx.sessionId,
    };
    await emit(hello);

    const unsubscribe = ctx.observer.subscribe(emit);
    const stopKeepalive = startObserverKeepalive(
      (chunk): Promise<void> => stream.write(chunk).then(() => undefined),
      OBSERVER_SSE_PING_INTERVAL_MS,
      c.req.raw.signal,
    );

    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", () => {
        stopKeepalive();
        unsubscribe();
        resolve();
      });
    });
  });
}
