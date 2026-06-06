import { serve } from "@hono/node-server";
import { Hono } from "hono";

import type { Mailbox } from "./mailbox.js";
import type { Notifier } from "./notifier.js";
import type { TelegramAdapter } from "./telegram/adapter.js";
import {
  GATEWAY_PATHS,
  type AckRequest,
  type AckResponse,
  type OutboundRequest,
  type OutboundResponse,
} from "@digital-worker/agent-gateway-protocol";

export type GatewayContext = {
  mailbox: Mailbox;
  telegram: TelegramAdapter;
  notifier: Notifier;
};

export function createApp(ctx: GatewayContext): Hono {
  const app = new Hono();

  app.get(GATEWAY_PATHS.health, (c) => c.json({ status: "ok" }));

  app.get(GATEWAY_PATHS.messages, (c) => {
    const peek = c.req.query("peek") === "true";
    const messages = peek
      ? ctx.mailbox.peekUnread()
      : ctx.mailbox.readUnread();
    return c.json({
      messages,
      unreadCount: ctx.mailbox.unreadCount(),
    });
  });

  app.post(GATEWAY_PATHS.ack, async (c) => {
    let body: AckRequest;
    try {
      body = await c.req.json<AckRequest>();
    } catch {
      return c.json({ error: { message: "invalid JSON body" } }, 400);
    }

    if (!Array.isArray(body.ids)) {
      return c.json({ error: { message: "ids array is required" } }, 400);
    }

    const response: AckResponse = { acked: ctx.mailbox.ack(body.ids) };
    return c.json(response);
  });

  app.post(GATEWAY_PATHS.outbound, async (c) => {
    let body: OutboundRequest;
    try {
      body = await c.req.json<OutboundRequest>();
    } catch {
      return c.json({ error: { message: "invalid JSON body" } }, 400);
    }

    if (!body.channel?.trim() || !body.text?.trim()) {
      return c.json(
        { error: { message: "channel and text are required" } },
        400,
      );
    }

    if (body.channel.trim() !== "telegram") {
      return c.json(
        { error: { message: `unsupported channel: ${body.channel}` } },
        400,
      );
    }

    try {
      const result = await ctx.telegram.send(
        body.text.trim(),
        body.threadId?.trim(),
      );
      const response: OutboundResponse = {
        delivered: true,
        providerMessageId: result.providerMessageId,
      };
      return c.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: { message } }, 502);
    }
  });

  app.get("/api/v1", (c) =>
    c.json({
      service: "agent-gateway",
      channels: ["telegram"],
      unreadCount: ctx.mailbox.unreadCount(),
      version: "0.0.0",
    }),
  );

  return app;
}

export type ServerOptions = {
  host: string;
  port: number;
};

export function startServer(
  options: ServerOptions,
  ctx: GatewayContext,
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
      console.log(
        `agent-gateway listening on http://${info.address}:${info.port}`,
      );
      void onListening?.();
    },
  );
}
