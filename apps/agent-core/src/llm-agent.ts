import { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";

import {
  assertApiKeyConfigured,
  getConfiguredModel,
  resolveApiKey,
  type LlmOptions,
} from "./llm-config.js";
import { createUpdateIdentityTool, type UpdateIdentityDeps } from "./tools/update-identity.js";
import { createUpdateUserTool, type UpdateUserDeps } from "./tools/update-user.js";
import { createBuiltinPiTools } from "./tools/builtin-tools.js";
import { buildSystemPrompt, type WorkspaceIdentity } from "./workspace/index.js";

export type CreateLlmAgentOptions = {
  llm: LlmOptions;
  apiKey?: string;
  /** Working directory for read/write/bash/ls tools. */
  toolsCwd: string;
  /** Override resolved model (e.g. pi-ai faux provider in tests). */
  model?: Model<string>;
  identity: WorkspaceIdentity;
  getIdentity: () => WorkspaceIdentity;
  setIdentityContent: (content: string) => void;
  setUserContent: (content: string) => void;
  identityStore: UpdateIdentityDeps["identityStore"];
  userStore: UpdateUserDeps["userStore"];
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

  const identityTool = createUpdateIdentityTool({
    identityStore: options.identityStore,
    getIdentity: options.getIdentity,
    setIdentityContent: options.setIdentityContent,
    agent,
  });
  const userTool = createUpdateUserTool({
    userStore: options.userStore,
    getIdentity: options.getIdentity,
    setUserContent: options.setUserContent,
    agent,
  });
  agent.state.tools = [
    ...createBuiltinPiTools(options.toolsCwd),
    identityTool,
    userTool,
  ];

  return agent;
}
