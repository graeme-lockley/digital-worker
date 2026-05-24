import {
  AGENT_CORE_PATHS,
  type HeartbeatRequest,
  type HeartbeatResponse,
} from "@digital-worker/agent-core-protocol";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { registerChatRoute } from "./chat.js";
import type { ServerOptions } from "./cli.js";
import type { WorkerRuntime } from "./worker-runtime.js";

export type AppContext = {
  agentId: string;
  sessionId: string;
  runtime: WorkerRuntime;
};

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/api/v1", (c) =>
    c.json({
      service: "agent-core",
      agentId: ctx.agentId,
      sessionId: ctx.sessionId,
      queueDepth: ctx.runtime.queueDepth,
      version: "0.0.0",
    }),
  );

  registerChatRoute(app, ctx);

  app.post(AGENT_CORE_PATHS.heartbeat, async (c) => {
    await c.req.json<HeartbeatRequest>().catch(() => ({}));
    const response: HeartbeatResponse = {
      agentId: ctx.agentId,
      status: "ok",
      timestamp: new Date().toISOString(),
    };
    return c.json(response);
  });

  return app;
}

export function startServer(
  options: ServerOptions,
  ctx: AppContext,
  onListening?: () => void | Promise<void>,
): void {
  const app = createApp(ctx);

  serve(
    {
      fetch: app.fetch,
      hostname: options.host,
      port: options.port,
    },
    (info) => {
      console.log(`agent-core listening on http://${info.address}:${info.port}`);
      void onListening?.();
    },
  );
}
