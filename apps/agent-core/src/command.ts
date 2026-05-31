import {
  AGENT_COMMAND,
  AGENT_CORE_ERROR_CODES,
  AGENT_CORE_PATHS,
  type AgentCommandName,
  type CommandRequest,
} from "@digital-worker/agent-core-protocol";
import type { Context } from "hono";

import type { AppContext } from "./server.js";

const KNOWN_COMMANDS = new Set<string>(Object.values(AGENT_COMMAND));

function isAgentCommandName(value: string): value is AgentCommandName {
  return KNOWN_COMMANDS.has(value);
}

export function registerCommandRoute(
  app: {
    post: (
      path: string,
      handler: (c: Context) => Response | Promise<Response>,
    ) => void;
  },
  ctx: AppContext,
): void {
  app.post(AGENT_CORE_PATHS.command, (c) => handleCommand(c, ctx));
}

async function handleCommand(c: Context, ctx: AppContext): Promise<Response> {
  let body: CommandRequest;
  try {
    body = await c.req.json<CommandRequest>();
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

  if (!body.clientId?.trim()) {
    return c.json(
      {
        error: {
          code: AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
          message: "clientId is required",
        },
      },
      400,
    );
  }

  if (!body.command?.trim() || !isAgentCommandName(body.command.trim())) {
    return c.json(
      {
        error: {
          code: AGENT_CORE_ERROR_CODES.UNKNOWN_COMMAND,
          message: "unknown or missing command",
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

  const command = body.command.trim();

  switch (command) {
    case AGENT_COMMAND.STATUS:
      return c.json(ctx.runtime.getStatus());
    case AGENT_COMMAND.ABANDON:
      return c.json(ctx.runtime.abandon());
    case AGENT_COMMAND.SHUTDOWN: {
      const response = c.json({
        accepted: true as const,
        action: "shutdown" as const,
      });
      queueMicrotask(() => {
        void ctx.onShutdown("command");
      });
      return response;
    }
    case AGENT_COMMAND.RESTART: {
      const response = c.json({
        accepted: true as const,
        action: "restart" as const,
      });
      queueMicrotask(() => {
        void ctx.onRestart("command");
      });
      return response;
    }
    default:
      return c.json(
        {
          error: {
            code: AGENT_CORE_ERROR_CODES.UNKNOWN_COMMAND,
            message: "unknown or missing command",
          },
        },
        400,
      );
  }
}
