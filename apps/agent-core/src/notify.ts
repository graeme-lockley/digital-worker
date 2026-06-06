import {
  AGENT_CORE_ERROR_CODES,
  AGENT_CORE_PATHS,
  type NotifyRequest,
  type NotifyResponse,
} from "@digital-worker/agent-core-protocol";
import type { Context } from "hono";

import { createGatewayReplyForCorrelation } from "./gateway-reply.js";
import type { NotifyJob } from "./job-types.js";
import type { AppContext } from "./server.js";

export function registerNotifyRoute(
  app: {
    post: (
      path: string,
      handler: (c: Context) => Response | Promise<Response>,
    ) => void;
  },
  ctx: AppContext,
): void {
  app.post(AGENT_CORE_PATHS.notify, (c) => handleNotify(c, ctx));
}

export function buildChannelMessagePrompt(
  correlationId: string,
  sender: string,
  text: string,
): string {
  return `[conversation ${correlationId} from ${sender}]
${sender}: ${text}

(Reply normally — your reply is delivered to this conversation automatically. Use send_message only to reach a different conversation.)`;
}

async function handleNotify(c: Context, ctx: AppContext): Promise<Response> {
  let body: NotifyRequest;
  try {
    body = await c.req.json<NotifyRequest>();
  } catch {
    return c.json(
      {
        error: {
          code: AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
          message: "invalid JSON body",
        },
      },
      400,
    );
  }

  if (!body.clientId?.trim() || !body.prompt?.trim()) {
    return c.json(
      {
        error: {
          code: AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
          message: "clientId and prompt are required",
        },
      },
      400,
    );
  }

  if (
    body.sessionId &&
    body.sessionId.trim() !== "" &&
    body.sessionId !== ctx.sessionId
  ) {
    return c.json(
      {
        error: {
          code: AGENT_CORE_ERROR_CODES.SESSION_MISMATCH,
          message: "sessionId does not match this worker",
        },
      },
      409,
    );
  }

  const correlationId = body.correlationId?.trim();
  const sender = body.sender?.trim() ?? "unknown";
  const prompt = correlationId
    ? buildChannelMessagePrompt(correlationId, sender, body.prompt.trim())
    : body.prompt.trim();

  const jobId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const abortController = new AbortController();

  const job: NotifyJob = {
    kind: "notify",
    id: jobId,
    messageId,
    clientId: body.clientId.trim(),
    prompt,
    sessionId: ctx.sessionId,
    enqueueAt: Date.now(),
    signal: abortController.signal,
    correlationId,
    channel: body.channel?.trim(),
    threadId: body.threadId?.trim(),
    sender: body.sender?.trim(),
    messageIds: body.messageIds,
  };

  if (correlationId && ctx.gatewayUrl) {
    job.deliver = createGatewayReplyForCorrelation(
      ctx.gatewayUrl,
      correlationId,
    );
  }

  void ctx.runtime
    .enqueue(job)
    .catch((error) => {
      console.error("notify job failed:", error);
    });

  const response: NotifyResponse = {
    jobId,
    acceptedAt: new Date().toISOString(),
  };
  return c.json(response, 202);
}
