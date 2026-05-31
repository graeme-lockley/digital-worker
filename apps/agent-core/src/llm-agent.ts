import path from "node:path";

import type { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import {
  assertApiKeyConfigured,
  getConfiguredModel,
  resolveApiKey,
  type LlmOptions,
} from "./llm-config.js";
import {
  AGENT_BROWSER_TOOL_NAME,
  resolvePiAgentBrowserExtensionPath,
} from "./tools/pi-browser-plugin.js";
import { createUpdateIdentityTool, type UpdateIdentityDeps } from "./tools/update-identity.js";
import { createUpdateUserTool, type UpdateUserDeps } from "./tools/update-user.js";
import { createRefreshSkillsTool } from "./tools/refresh-skills.js";
import { SkillRegistry } from "./skills/skill-registry.js";
import { buildSystemPrompt, skillsDir, type WorkspaceIdentity } from "./workspace/index.js";

const BASE_TOOL_NAMES = [
  "read",
  "write",
  "bash",
  "ls",
  "update_identity",
  "update_user",
  "refresh_skills",
] as const;

function buildToolAllowlist(browserEnabled: boolean): string[] {
  return browserEnabled
    ? [...BASE_TOOL_NAMES, AGENT_BROWSER_TOOL_NAME]
    : [...BASE_TOOL_NAMES];
}

/** Proxy so identity tools can mutate agent.state before the session Agent exists. */
function createAgentProxy(agentRef: { current?: Agent }): Agent {
  return new Proxy({} as Agent, {
    get(_target, prop, receiver) {
      if (!agentRef.current) {
        throw new Error("LLM agent is not initialized yet");
      }
      return Reflect.get(agentRef.current, prop, receiver);
    },
    set(_target, prop, value, receiver) {
      if (!agentRef.current) {
        throw new Error("LLM agent is not initialized yet");
      }
      return Reflect.set(agentRef.current, prop, value, receiver);
    },
  });
}

export type CreateLlmAgentOptions = {
  llm: LlmOptions;
  apiKey?: string;
  /** Working directory for read/write/bash/ls tools. */
  toolsCwd: string;
  /** Load pi-agent-browser-native and expose agent_browser. Default true. */
  browserEnabled?: boolean;
  /** Override resolved model (e.g. pi-ai faux provider in tests). */
  model?: Model<string>;
  identity: WorkspaceIdentity;
  getIdentity: () => WorkspaceIdentity;
  setIdentityContent: (content: string) => void;
  setUserContent: (content: string) => void;
  identityStore: UpdateIdentityDeps["identityStore"];
  userStore: UpdateUserDeps["userStore"];
};

export async function createLlmAgent(options: CreateLlmAgentOptions): Promise<Agent> {
  assertApiKeyConfigured(options.llm.provider, options.apiKey);
  const model = options.model ?? getConfiguredModel(options.llm);
  const browserEnabled = options.browserEnabled ?? true;
  const tools = buildToolAllowlist(browserEnabled);

  const agentDir = path.join(options.toolsCwd, ".agent-core-pi");
  const settingsManager = SettingsManager.create(options.toolsCwd, agentDir);

  const skillRegistry = new SkillRegistry(skillsDir(options.toolsCwd));
  await skillRegistry.refresh();

  const resourceLoader = new DefaultResourceLoader({
    cwd: options.toolsCwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: browserEnabled
      ? [resolvePiAgentBrowserExtensionPath()]
      : [],
    systemPromptOverride: () =>
      buildSystemPrompt(options.getIdentity(), skillRegistry.formatForPrompt()),
  });
  await resourceLoader.reload();

  const authStorage = AuthStorage.inMemory();
  const apiKey = resolveApiKey(options.llm.provider, options.apiKey);
  if (apiKey) {
    authStorage.setRuntimeApiKey(options.llm.provider, apiKey);
  }
  const modelRegistry = ModelRegistry.create(authStorage);

  const agentRef: { current?: Agent } = {};
  const agentProxy = createAgentProxy(agentRef);
  const getSkillsSection = () => skillRegistry.formatForPrompt();

  const identityTool = createUpdateIdentityTool({
    identityStore: options.identityStore,
    getIdentity: options.getIdentity,
    setIdentityContent: options.setIdentityContent,
    getSkillsSection,
    agent: agentProxy,
  });
  const userTool = createUpdateUserTool({
    userStore: options.userStore,
    getIdentity: options.getIdentity,
    setUserContent: options.setUserContent,
    getSkillsSection,
    agent: agentProxy,
  });
  const refreshSkillsTool = createRefreshSkillsTool({
    skillRegistry,
    getIdentity: options.getIdentity,
    agent: agentProxy,
  });

  const { session } = await createAgentSession({
    resourceLoader,
    model,
    cwd: options.toolsCwd,
    sessionManager: SessionManager.inMemory(options.toolsCwd),
    settingsManager,
    authStorage,
    modelRegistry,
    customTools: [identityTool, userTool, refreshSkillsTool],
    tools,
  });

  agentRef.current = session.agent;
  return session.agent;
}
