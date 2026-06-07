import path from "node:path";

import type { Agent } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import {
  type AgentSession,
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
  createCheckMessagesTool,
  createSendMessageTool,
} from "./tools/gateway-messages.js";
import {
  createListAgentsTool,
  createSendToAgentTool,
} from "./tools/agent-messages.js";
import {
  createCancelScheduledEventTool,
  createListScheduledEventsTool,
  createListScheduledRunsTool,
  createScheduleEventTool,
} from "./tools/scheduler.js";
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
  "check_messages",
  "send_message",
  "list_agents",
  "send_to_agent",
  "schedule_event",
  "list_scheduled_events",
  "list_scheduled_runs",
  "cancel_scheduled_event",
] as const;

function buildToolAllowlist(
  browserEnabled: boolean,
  memorySearchEnabled: boolean,
  gatewayEnabled: boolean,
  interAgentEnabled: boolean,
  schedulerEnabled: boolean,
): string[] {
  const names = BASE_TOOL_NAMES.filter((n) => {
    if (!memorySearchEnabled && n === "memory_search") {
      return false;
    }
    if (!gatewayEnabled && (n === "check_messages" || n === "send_message")) {
      return false;
    }
    if (!interAgentEnabled && (n === "list_agents" || n === "send_to_agent")) {
      return false;
    }
    if (
      !schedulerEnabled &&
      (n === "schedule_event" ||
        n === "list_scheduled_events" ||
        n === "list_scheduled_runs" ||
        n === "cancel_scheduled_event")
    ) {
      return false;
    }
    return true;
  });
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
  /** Optional roster for native Pi model cycling/picker. */
  scopedModels?: Array<{ model: Model<string> }>;
  identity: WorkspaceIdentity;
  getIdentity: () => WorkspaceIdentity;
  setIdentityContent: (content: string) => void;
  setUserContent: (content: string) => void;
  identityStore: UpdateIdentityDeps["identityStore"];
  userStore: UpdateUserDeps["userStore"];
  memoryManager?: MemoryManager;
  initialMemorySection?: string;
  /** agent-gateway base URL; enables check_messages and send_message tools. */
  gatewayUrl?: string;
  /** agent-register base URL; enables list_agents and send_to_agent tools. */
  registerUrl?: string;
  /** This worker's registration id; required for inter-agent tools. */
  agentId?: string;
  /** agent-scheduler base URL; enables scheduling tools. */
  schedulerUrl?: string;
};

export type CreateLlmAgentResult = {
  session: AgentSession;
};

export async function createLlmAgent(
  options: CreateLlmAgentOptions,
): Promise<CreateLlmAgentResult> {
  assertApiKeyConfigured(options.llm.provider, options.apiKey);
  const model = options.model ?? getConfiguredModel(options.llm);
  const browserEnabled = options.browserEnabled ?? true;
  const memoryEnabled = options.memoryManager?.config.enabled ?? false;
  const memorySearchEnabled =
    memoryEnabled && (options.memoryManager?.config.searchEnabled ?? true);
  const gatewayEnabled = Boolean(options.gatewayUrl?.trim());
  const interAgentEnabled = Boolean(
    options.registerUrl?.trim() && options.agentId?.trim(),
  );
  const schedulerEnabled = Boolean(
    options.schedulerUrl?.trim() && options.agentId?.trim(),
  );
  const tools = buildToolAllowlist(
    browserEnabled,
    memorySearchEnabled,
    gatewayEnabled,
    interAgentEnabled,
    schedulerEnabled,
  );

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

  if (gatewayEnabled && options.gatewayUrl) {
    const gatewayDeps = { gatewayUrl: options.gatewayUrl };
    customTools.push(
      createCheckMessagesTool(gatewayDeps),
      createSendMessageTool(gatewayDeps),
    );
  }

  if (interAgentEnabled && options.registerUrl && options.agentId) {
    const agentMessageDeps = {
      registerUrl: options.registerUrl,
      agentId: options.agentId,
    };
    customTools.push(
      createListAgentsTool(agentMessageDeps),
      createSendToAgentTool(agentMessageDeps),
    );
  }

  if (schedulerEnabled && options.schedulerUrl && options.agentId) {
    const schedulerDeps = {
      schedulerUrl: options.schedulerUrl,
      agentId: options.agentId,
    };
    customTools.push(
      createScheduleEventTool(schedulerDeps),
      createListScheduledEventsTool(schedulerDeps),
      createListScheduledRunsTool(schedulerDeps),
      createCancelScheduledEventTool(schedulerDeps),
    );
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
    scopedModels: options.scopedModels,
  });

  agentRef.current = session.agent;
  if (options.memoryManager) {
    options.memoryManager.setGetAgent(() => agentRef.current);
  }
  return { session };
}
