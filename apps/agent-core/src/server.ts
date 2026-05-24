import { serve } from "@hono/node-server";
import { Hono } from "hono";

import type { ServerOptions } from "./cli.js";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/api/v1", (c) =>
    c.json({
      service: "agent-core",
      version: "0.0.0",
    }),
  );

  return app;
}

export function startServer(options: ServerOptions): void {
  const app = createApp();

  serve(
    {
      fetch: app.fetch,
      hostname: options.host,
      port: options.port,
    },
    (info) => {
      console.log(`agent-core listening on http://${info.address}:${info.port}`);
    },
  );
}
