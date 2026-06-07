import { estimateContextTokens } from "@earendil-works/pi-agent-core";
import {
  AGENT_COMMAND,
  AGENT_CORE_ERROR_CODES,
  type AgentCommandName,
  type CommandRequest,
  type CommandResponse,
  type ModelDescriptor,
} from "@digital-worker/agent-core-protocol";

import type { AppContext } from "./server.js";
import { ResolveScopedModelError, resolveScopedModel } from "./resolve-scoped-model.js";

export type OperatorCommandSuccess = {
  ok: true;
  status: 200;
  response: CommandResponse;
};

export type OperatorCommandFailure = {
  ok: false;
  status: number;
  error: { code: string; message: string };
};

export type OperatorCommandResult = OperatorCommandSuccess | OperatorCommandFailure;

export async function executeOperatorCommand(
  ctx: AppContext,
  body: CommandRequest,
): Promise<OperatorCommandResult> {
  const command = body.command.trim() as AgentCommandName;

  switch (command) {
    case AGENT_COMMAND.STATUS:
      return { ok: true, status: 200, response: ctx.runtime.getStatus() };
    case AGENT_COMMAND.ABANDON:
      return { ok: true, status: 200, response: ctx.runtime.abandon() };
    case AGENT_COMMAND.SHUTDOWN:
      queueMicrotask(() => {
        void ctx.onShutdown("command");
      });
      return {
        ok: true,
        status: 200,
        response: { accepted: true as const, action: "shutdown" as const },
      };
    case AGENT_COMMAND.RESTART:
      queueMicrotask(() => {
        void ctx.onRestart("command");
      });
      return {
        ok: true,
        status: 200,
        response: { accepted: true as const, action: "restart" as const },
      };
    case AGENT_COMMAND.COMPACT: {
      if (ctx.memoryManager) {
        await ctx.memoryManager.runFlush("command");
      }
      try {
        const result = await ctx.session.compact();
        const tokensAfter = estimateContextTokens(
          ctx.session.agent.state.messages,
        ).tokens;
        return {
          ok: true,
          status: 200,
          response: {
            compacted: true,
            tokensBefore: result.tokensBefore,
            tokensAfter,
            reason: "manual",
            summary: result.summary,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "compaction failed";
        return {
          ok: false,
          status: 400,
          error: {
            code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
            message,
          },
        };
      }
    }
    case AGENT_COMMAND.MAINTAIN_MEMORY: {
      if (!ctx.memoryManager) {
        return {
          ok: false,
          status: 503,
          error: {
            code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
            message: "memory subsystem is disabled",
          },
        };
      }
      const result = await ctx.memoryManager.runMaintenance(body.scope);
      return { ok: true, status: 200, response: result };
    }
    case AGENT_COMMAND.LIST_MODELS: {
      const current = ctx.session.model;
      if (!current) {
        return {
          ok: false,
          status: 503,
          error: {
            code: AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
            message: "no active model on session",
          },
        };
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
      return {
        ok: true,
        status: 200,
        response: { models, current: currentDescriptor },
      };
    }
    case AGENT_COMMAND.SET_MODEL: {
      const raw = body.model?.trim();
      if (!raw) {
        return {
          ok: false,
          status: 400,
          error: {
            code: AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
            message: "model is required for set_model",
          },
        };
      }

      let resolved;
      try {
        resolved = resolveScopedModel(ctx.session, raw);
      } catch (error) {
        if (error instanceof ResolveScopedModelError) {
          const status =
            error.code === AGENT_CORE_ERROR_CODES.INTERNAL_ERROR ? 503 : 400;
          return {
            ok: false,
            status,
            error: { code: error.code, message: error.message },
          };
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
      return { ok: true, status: 200, response: { model: responseModel } };
    }
    default:
      return {
        ok: false,
        status: 400,
        error: {
          code: AGENT_CORE_ERROR_CODES.UNKNOWN_COMMAND,
          message: "unknown or missing command",
        },
      };
  }
}
