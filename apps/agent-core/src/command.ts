import {
  AGENT_COMMAND,
  AGENT_CORE_ERROR_CODES,
  AGENT_CORE_PATHS,
  type ModelDescriptor,
  type AgentCommandName,
  type CommandRequest,
} from "@digital-worker/agent-core-protocol";
import type { Context } from "hono";

import type { AppContext } from "./server.js";
import { ResolveScopedModelError, resolveScopedModel } from "./resolve-scoped-model.js";

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
    case AGENT_COMMAND.MAINTAIN_MEMORY: {
      if (!ctx.memoryManager) {
        return c.json(
          {
            error: {
              code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
              message: "memory subsystem is disabled",
            },
          },
          503,
        );
      }
      const result = await ctx.memoryManager.runMaintenance(body.scope);
      return c.json(result);
    }
    case AGENT_COMMAND.LIST_MODELS: {
      const current = ctx.session.model;
      if (!current) {
        return c.json(
          {
            error: {
              code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
              message: "no active model on session",
            },
          },
          503,
        );
      }
      const models = ctx.models.map((m) => ({
        ...m,
        current: m.provider === current.provider && m.id === current.id,
      }));
      const currentDescriptor = models.find((m) => m.current) ?? {
        provider: current.provider,
        id: current.id,
        current: true,
      };
      return c.json({ models, current: currentDescriptor });
    }
    case AGENT_COMMAND.SET_MODEL: {
      const raw = body.model?.trim();
      if (!raw) {
        return c.json(
          {
            error: {
              code: AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
              message: "model is required for set_model",
            },
          },
          400,
        );
      }

      let resolved;
      try {
        resolved = resolveScopedModel(ctx.session, raw);
      } catch (error) {
        if (error instanceof ResolveScopedModelError) {
          const status =
            error.code === AGENT_CORE_ERROR_CODES.INTERNAL_ERROR ? 503 : 400;
          return c.json({ error: { code: error.code, message: error.message } }, status);
        }
        throw error;
      }

      await ctx.session.setModel(resolved);
      ctx.memoryManager?.setModel(resolved);

      const responseModel: ModelDescriptor = {
        provider: resolved.provider,
        id: resolved.id,
        current: true,
      };
      return c.json({ model: responseModel });
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
