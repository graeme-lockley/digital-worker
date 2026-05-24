import { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";

import {
  assertApiKeyConfigured,
  getConfiguredModel,
  resolveApiKey,
  type LlmOptions,
} from "./llm-config.js";
import { createUpdateIdentityTool, type UpdateIdentityDeps } from "./tools/update-identity.js";
import { buildSystemPrompt, type WorkspaceIdentity } from "./workspace/index.js";

export type CreateLlmAgentOptions = {
  llm: LlmOptions;
  apiKey?: string;
  /** Override resolved model (e.g. pi-ai faux provider in tests). */
  model?: Model<string>;
  identity: WorkspaceIdentity;
  getIdentity: () => WorkspaceIdentity;
  setIdentityContent: (content: string) => void;
  identityStore: UpdateIdentityDeps["identityStore"];
};

export function createLlmAgent(options: CreateLlmAgentOptions): Agent {
  assertApiKeyConfigured(options.llm.provider, options.apiKey);
  const systemPrompt = buildSystemPrompt(options.identity);
  const model = options.model ?? getConfiguredModel(options.llm);

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools: [],
    },
    getApiKey: (provider) =>
      resolveApiKey(provider, options.apiKey) ?? resolveApiKey(options.llm.provider, options.apiKey),
  });

  const tool = createUpdateIdentityTool({
    identityStore: options.identityStore,
    getIdentity: options.getIdentity,
    setIdentityContent: options.setIdentityContent,
    agent,
  });
  agent.state.tools = [tool];

  return agent;
}
