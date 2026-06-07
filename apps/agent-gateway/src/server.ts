import { serve } from "@hono/node-server";
import { Hono } from "hono";

import type { CorrelationRegistry } from "./correlation-registry.js";
import type { Mailbox } from "./mailbox.js";
import type { Notifier } from "./notifier.js";
import type { GatewayPersistence } from "./persistence.js";
import type { TelegramAdapter } from "./telegram/adapter.js";
import {
  GATEWAY_PATHS,
  type AckRequest,
  type AckResponse,
  type OutboundRequest,
  type OutboundResponse,
  type ReplyRequest,
  type ReplyResponse,
} from "@digital-worker/agent-gateway-protocol";

export type GatewayContext = {
  mailbox: Mailbox;
  telegram: TelegramAdapter;
  notifier: Notifier;
  correlations: CorrelationRegistry;
  persistence: GatewayPersistence;
};

export function createApp(ctx: GatewayContext): Hono {
  const app = new Hono();

  app.get(GATEWAY_PATHS.health, (c) => c.json({ status: "ok" }));

  app.get(GATEWAY_PATHS.messages, async (c) => {
    const peek = c.req.query("peek") === "true";
    const messages = peek
      ? ctx.mailbox.peekUnread()
      : ctx.mailbox.readUnread();
    if (!peek && messages.length > 0) {
      await ctx.persistence.onMessagesRead(messages.map((message) => message.id));
    }
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
    if (response.acked > 0) {
      await ctx.persistence.onMessagesRead(body.ids);
    }
    return c.json(response);
  });

  app.post(GATEWAY_PATHS.reply, async (c) => {
    let body: ReplyRequest;
    try {
      body = await c.req.json<ReplyRequest>();
    } catch {
      return c.json({ error: { message: "invalid JSON body" } }, 400);
    }

    if (!body.correlationId?.trim() || !body.text?.trim()) {
      return c.json(
        { error: { message: "correlationId and text are required" } },
        400,
      );
    }

    const route = ctx.correlations.resolve(body.correlationId.trim());
    if (!route) {
      return c.json(
        { error: { message: `unknown correlation: ${body.correlationId}` } },
        404,
      );
    }

    if (route.channel !== "telegram") {
      return c.json(
        { error: { message: `unsupported channel: ${route.channel}` } },
        400,
      );
    }

    try {
      const result = await ctx.telegram.send(
        body.text.trim(),
        route.threadId,
      );
      const messageIds = body.messageIds ?? [];
      if (messageIds.length > 0) {
        ctx.mailbox.ack(messageIds);
        ctx.notifier.onReplyDelivered(messageIds);
        await ctx.persistence.onMessagesRead(messageIds);
      }

      const response: ReplyResponse = {
        delivered: true,
        providerMessageId: result.providerMessageId,
      };
      return c.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: { message } }, 502);
    }
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
