import {
  AGENT_CORE_ERROR_CODES,
  AGENT_CORE_PATHS,
  type NotifyRequest,
  type NotifyResponse,
} from "@digital-worker/agent-core-protocol";
import type { Context } from "hono";

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

  const jobId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const abortController = new AbortController();

  void ctx.runtime
    .enqueue({
      kind: "notify",
      id: jobId,
      messageId,
      clientId: body.clientId.trim(),
      prompt: body.prompt.trim(),
      sessionId: ctx.sessionId,
      enqueueAt: Date.now(),
      signal: abortController.signal,
    })
    .catch((error) => {
      console.error("notify job failed:", error);
    });

  const response: NotifyResponse = {
    jobId,
    acceptedAt: new Date().toISOString(),
  };
  return c.json(response, 202);
}
