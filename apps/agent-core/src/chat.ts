import {
  AGENT_CORE_ERROR_CODES,
  AGENT_CORE_PATHS,
  CHAT_STREAM_EVENT,
  type ChatPromptRequest,
  type ChatStreamEvent,
} from "@digital-worker/agent-core-protocol";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

const PARROT_PREFIX = "Echo: ";
const TOKEN_DELAY_MS = 25;

export function registerChatRoute(app: {
  post: (
    path: string,
    handler: (c: Context) => Response | Promise<Response>,
  ) => void;
}): void {
  app.post(AGENT_CORE_PATHS.chat, handleChat);
}

async function handleChat(c: Context): Promise<Response> {
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

  const sessionId = body.sessionId ?? crypto.randomUUID();
  const messageId = crypto.randomUUID();

  return streamSSE(c, async (stream) => {
    try {
      const text = `${PARROT_PREFIX}${body.prompt}`;
      for (const token of text) {
        const event: ChatStreamEvent = {
          type: CHAT_STREAM_EVENT.TOKEN,
          sessionId,
          token,
        };
        await stream.writeSSE({ data: JSON.stringify(event) });
        await delay(TOKEN_DELAY_MS);
      }

      const done: ChatStreamEvent = {
        type: CHAT_STREAM_EVENT.DONE,
        sessionId,
        messageId,
      };
      await stream.writeSSE({ data: JSON.stringify(done) });
    } catch (error) {
      const event: ChatStreamEvent = {
        type: CHAT_STREAM_EVENT.ERROR,
        code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : "stream failed",
      };
      await stream.writeSSE({ data: JSON.stringify(event) });
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
