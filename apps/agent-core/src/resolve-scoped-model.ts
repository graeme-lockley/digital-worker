import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { AGENT_CORE_ERROR_CODES } from "@digital-worker/agent-core-protocol";

import { parseModelArg } from "./llm-config.js";

export class ResolveScopedModelError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ResolveScopedModelError";
    this.code = code;
  }
}

/** Resolve a roster model from provider/model or bare model id shorthand. */
export function resolveScopedModel(
  session: AgentSession,
  modelArg: string,
): Model<string> {
  const raw = modelArg.trim();
  if (!raw) {
    throw new ResolveScopedModelError(
      AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
      "model is required",
    );
  }

  const sessionModel = session.model;
  if (!sessionModel) {
    throw new ResolveScopedModelError(
      AGENT_CORE_ERROR_CODES.INTERNAL_ERROR,
      "no active model on session",
    );
  }

  const parsed = parseModelArg(raw);
  const provider = parsed.provider ?? sessionModel.provider;
  const resolved = session.scopedModels.find(
    (entry) =>
      entry.model.provider === provider && entry.model.id === parsed.modelId,
  )?.model;

  if (!resolved) {
    throw new ResolveScopedModelError(
      AGENT_CORE_ERROR_CODES.INVALID_REQUEST,
      `model ${provider}/${parsed.modelId} is not in the allowed roster`,
    );
  }

  return resolved;
}
