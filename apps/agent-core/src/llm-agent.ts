import path from "node:path";

import type { Agent } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
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
import type { MemoryManager } from "./memory/index.js";
import { SkillRegistry } from "./skills/skill-registry.js";
import { createMemorySearchTool } from "./tools/memory-search.js";
import {
  AGENT_BROWSER_TOOL_NAME,
  resolvePiAgentBrowserExtensionPath,
} from "./tools/pi-browser-plugin.js";
import { createRefreshSkillsTool } from "./tools/refresh-skills.js";
import { createRememberTool } from "./tools/remember.js";
import { createUpdateIdentityTool, type UpdateIdentityDeps } from "./tools/update-identity.js";
import { createUpdateUserTool, type UpdateUserDeps } from "./tools/update-user.js";
import { buildSystemPrompt, skillsDir, type WorkspaceIdentity } from "./workspace/index.js";

const BASE_TOOL_NAMES = [
  "read",
  "write",
  "bash",
  "ls",
  "update_identity",
  "update_user",
  "refresh_skills",
  "remember",
  "memory_search",
] as const;

function buildToolAllowlist(
  browserEnabled: boolean,
  memorySearchEnabled: boolean,
): string[] {
  const names = BASE_TOOL_NAMES.filter(
    (n) => memorySearchEnabled || n !== "memory_search",
  );
  return browserEnabled ? [...names, AGENT_BROWSER_TOOL_NAME] : [...names];
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
  memoryManager?: MemoryManager;
  initialMemorySection?: string;
};

export async function createLlmAgent(options: CreateLlmAgentOptions): Promise<Agent> {
  assertApiKeyConfigured(options.llm.provider, options.apiKey);
  const model = options.model ?? getConfiguredModel(options.llm);
  const browserEnabled = options.browserEnabled ?? true;
  const memoryEnabled = options.memoryManager?.config.enabled ?? false;
  const memorySearchEnabled =
    memoryEnabled && (options.memoryManager?.config.searchEnabled ?? true);
  const tools = buildToolAllowlist(browserEnabled, memorySearchEnabled);

  const agentDir = path.join(options.toolsCwd, ".agent-core-pi");
  const settingsManager = SettingsManager.create(options.toolsCwd, agentDir);

  const skillRegistry = new SkillRegistry(skillsDir(options.toolsCwd));
  await skillRegistry.refresh();

  let memorySection = options.initialMemorySection ?? "";

  const getMemorySection = async (): Promise<string> => {
    if (options.memoryManager) {
      memorySection = await options.memoryManager.loadBootstrap();
    }
    return memorySection;
  };

  const rebuildSystemPrompt = (): void => {
    const agent = agentRef.current;
    if (!agent) {
      return;
    }
    void getMemorySection().then((section) => {
      agent.state.systemPrompt = buildSystemPrompt(
        options.getIdentity(),
        skillRegistry.formatForPrompt(),
        section,
      );
    });
  };

  if (options.memoryManager) {
    options.memoryManager.setRebuildSystemPrompt(rebuildSystemPrompt);
  }

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
      buildSystemPrompt(
        options.getIdentity(),
        skillRegistry.formatForPrompt(),
        memorySection,
      ),
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
    getMemorySection,
    agent: agentProxy,
  });
  const userTool = createUpdateUserTool({
    userStore: options.userStore,
    getIdentity: options.getIdentity,
    setUserContent: options.setUserContent,
    getSkillsSection,
    getMemorySection,
    agent: agentProxy,
  });
  const refreshSkillsTool = createRefreshSkillsTool({
    skillRegistry,
    getIdentity: options.getIdentity,
    getMemorySection,
    agent: agentProxy,
  });

  const customTools: AgentTool[] = [identityTool, userTool, refreshSkillsTool];
  if (options.memoryManager) {
    customTools.push(
      createRememberTool({
        memoryManager: options.memoryManager,
        getIdentity: options.getIdentity,
        getSkillsSection,
        getMemorySection,
        agent: agentProxy,
      }),
    );
    if (memorySearchEnabled) {
      customTools.push(
        createMemorySearchTool({ memoryManager: options.memoryManager }),
      );
    }
  }

  const { session } = await createAgentSession({
    resourceLoader,
    model,
    cwd: options.toolsCwd,
    sessionManager: SessionManager.inMemory(options.toolsCwd),
    settingsManager,
    authStorage,
    modelRegistry,
    customTools,
    tools,
  });

  agentRef.current = session.agent;
  if (options.memoryManager) {
    options.memoryManager.setGetAgent(() => agentRef.current);
  }
  return session.agent;
}
