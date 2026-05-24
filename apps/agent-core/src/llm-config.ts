import {
  getEnvApiKey,
  getModel,
  getModels,
  getProviders,
  type Model,
} from "@earendil-works/pi-ai";

export type LlmOptions = {
  provider: string;
  modelId: string;
  apiKey?: string;
};

export function parseModelArg(modelArg: string): {
  provider?: string;
  modelId: string;
} {
  const slash = modelArg.indexOf("/");
  if (slash === -1) {
    return { modelId: modelArg };
  }
  return {
    provider: modelArg.slice(0, slash),
    modelId: modelArg.slice(slash + 1),
  };
}

export function resolveModel(provider: string, modelId: string): Model<string> {
  const providers = getProviders();
  if (!providers.includes(provider as (typeof providers)[number])) {
    throw new Error(
      `unknown provider "${provider}" (known: ${providers.slice(0, 8).join(", ")}...)`,
    );
  }

  const models = getModels(provider as (typeof providers)[number]);
  const match = models.find((m) => m.id === modelId);
  if (!match) {
    throw new Error(`unknown model "${modelId}" for provider "${provider}"`);
  }
  return match;
}

export function resolveLlmOptions(provider: string, modelArg: string): LlmOptions {
  const parsed = parseModelArg(modelArg);
  const resolvedProvider = parsed.provider ?? provider;
  const model = resolveModel(resolvedProvider, parsed.modelId);
  return {
    provider: model.provider,
    modelId: model.id,
  };
}

export function getConfiguredModel(options: LlmOptions): Model<string> {
  return getModel(
    options.provider as Parameters<typeof getModel>[0],
    options.modelId as Parameters<typeof getModel>[1],
  );
}

export function resolveApiKey(
  provider: string,
  apiKeyOverride?: string,
): string | undefined {
  const trimmed = apiKeyOverride?.trim();
  if (trimmed) {
    return trimmed;
  }
  const envKey = getEnvApiKey(provider);
  if (!envKey?.trim() || envKey.trim() === "") {
    return undefined;
  }
  return envKey.trim();
}

export function assertApiKeyConfigured(
  provider: string,
  apiKeyOverride?: string,
): void {
  if (!resolveApiKey(provider, apiKeyOverride)) {
    throw new Error(
      `no API key for provider "${provider}" (set env or --api-key)`,
    );
  }
}
