import {
  AGENT_CORE_ERROR_CODES,
  AGENT_CORE_PATHS,
  AGENT_MESSAGE_TYPE,
  type AgentMessagePayload,
  type DeliverMessageRequest,
  type DeliverMessageResponse,
} from "@digital-worker/agent-core-protocol";
import type { Context } from "hono";

import type { MessageJob } from "./job-types.js";
import type { AppContext } from "./server.js";

export function registerDeliverRoute(
  app: {
    post: (
      path: string,
      handler: (c: Context) => Response | Promise<Response>,
    ) => void;
  },
  ctx: AppContext,
): void {
  app.post(AGENT_CORE_PATHS.deliver, (c) => handleDeliver(c, ctx));
}

export function buildAgentMessagePrompt(
  fromAgentId: string,
  text: string,
): string {
  return `[message from agent ${fromAgentId}]
${text}

(This is an inter-agent message. There is no automatic reply; use send_to_agent to respond.)`;
}

function parsePayload(payload: unknown): AgentMessagePayload | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof (payload as AgentMessagePayload).text === "string" &&
    (payload as AgentMessagePayload).text.trim().length > 0
  ) {
    return { text: (payload as AgentMessagePayload).text.trim() };
  }
  return undefined;
}

async function handleDeliver(c: Context, ctx: AppContext): Promise<Response> {
  let body: DeliverMessageRequest;
  try {
    body = await c.req.json<DeliverMessageRequest>();
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

  const message = body.message;
  if (!message || typeof message !== "object") {
    return c.json(
      {
        error: {
          code: AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
          message: "message is required",
        },
      },
      400,
    );
  }

  const fromAgentId = message.fromAgentId?.trim();
  const toAgentId = message.toAgentId?.trim();
  const payload = parsePayload(message.payload);

  if (!fromAgentId || !toAgentId || !payload) {
    return c.json(
      {
        error: {
          code: AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
          message:
            "message.fromAgentId, message.toAgentId, and message.payload.text are required",
        },
      },
      400,
    );
  }

  if (toAgentId !== ctx.agentId) {
    return c.json(
      {
        error: {
          code: AGENT_CORE_ERROR_CODES.NOT_FOUND,
          message: "message.toAgentId does not match this worker",
        },
      },
      404,
    );
  }

  const messageId = message.messageId?.trim() || crypto.randomUUID();
  const messageType = message.type?.trim() || AGENT_MESSAGE_TYPE;
  const jobId = crypto.randomUUID();
  const abortController = new AbortController();

  const job: MessageJob = {
    kind: "message",
    id: jobId,
    messageId,
    clientId: fromAgentId,
    prompt: buildAgentMessagePrompt(fromAgentId, payload.text),
    sessionId: ctx.sessionId,
    enqueueAt: Date.now(),
    signal: abortController.signal,
    fromAgentId,
    messageType,
  };

  void ctx.runtime
    .enqueue(job)
    .catch((error) => {
      console.error("deliver job failed:", error);
    });

  const response: DeliverMessageResponse = {
    messageId,
    acceptedAt: new Date().toISOString(),
  };
  return c.json(response, 202);
}
