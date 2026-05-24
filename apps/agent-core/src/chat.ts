import {
  AGENT_CORE_ERROR_CODES,
  AGENT_CORE_PATHS,
  CHAT_STREAM_EVENT,
  type ChatPromptRequest,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

import type { AppContext } from "./server.js";
import type { ChatJob } from "./worker-runtime.js";

export function registerChatRoute(
  app: {
    post: (
      path: string,
      handler: (c: Context) => Response | Promise<Response>,
    ) => void;
  },
  ctx: AppContext,
): void {
  app.post(AGENT_CORE_PATHS.chat, (c) => handleChat(c, ctx));
}

async function handleChat(c: Context, ctx: AppContext): Promise<Response> {
  let body: ChatPromptRequest;
  try {
    body = await c.req.json<ChatPromptRequest>();
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

  const messageId = crypto.randomUUID();
  const abortController = new AbortController();

  c.req.raw.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  return streamSSE(c, async (stream) => {
    const emit = async (event: ChatStreamEvent): Promise<void> => {
      await stream.writeSSE({ data: JSON.stringify(event) });
    };

    const job: ChatJob = {
      id: crypto.randomUUID(),
      messageId,
      clientId: body.clientId.trim(),
      prompt: body.prompt.trim(),
      sessionId: ctx.sessionId,
      enqueueAt: Date.now(),
      emit,
      signal: abortController.signal,
    };

    try {
      await ctx.runtime.enqueue(job);
    } catch (error) {
      if (!abortController.signal.aborted) {
        const event: ChatStreamEvent = {
          type: CHAT_STREAM_EVENT.ERROR,
          code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "request failed",
        };
        await stream.writeSSE({ data: JSON.stringify(event) });
      }
    }
  });
}
