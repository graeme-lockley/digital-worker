import path from "node:path";
import { copyFile, mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  fauxAssistantMessage,
  fauxText,
  registerFauxProvider,
  type FauxProviderRegistration,
} from "@earendil-works/pi-ai";

import { createLlmAgent } from "./llm-agent.js";
import { MemoryIndex, MemoryManager, MemoryStore, DEFAULT_MEMORY_CONFIG } from "./memory/index.js";
import { createApp, type AppContext } from "./server.js";
import { loadWorkspace } from "./workspace/index.js";
import { WorkerRuntime } from "./worker-runtime.js";

export const TEST_SESSION_ID = "test-worker-session";
export const TEST_AGENT_ID = "test-agent-id";

export function repoWorkspacePath(agentName = "Aida"): string {
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(srcDir, "../../..");
  return path.join(repoRoot, "workspace", agentName);
}

async function createIsolatedWorkspace(agentName = "Aida"): Promise<string> {
  const source = repoWorkspacePath(agentName);
  const dir = await mkdtemp(path.join(tmpdir(), "dw-agent-test-"));
  for (const file of ["MANDATE.md", "SOUL.md", "IDENTITY.md", "USER.md"]) {
    await copyFile(path.join(source, file), path.join(dir, file));
  }
  await mkdir(path.join(dir, "skills"), { recursive: true });
  const skillSource = path.join(source, "skills", "skill-authoring", "SKILL.md");
  try {
    await mkdir(path.join(dir, "skills", "skill-authoring"), { recursive: true });
    await copyFile(skillSource, path.join(dir, "skills", "skill-authoring", "SKILL.md"));
  } catch {
    // optional skill
  }
  return dir;
}

export type TestHarness = {
  app: ReturnType<typeof createApp>;
  registration: FauxProviderRegistration;
  runtime: WorkerRuntime;
  ctx: AppContext;
};

export async function createTestHarness(
  responseText = "Hello from faux",
): Promise<TestHarness> {
  const registration = registerFauxProvider();
  registration.setResponses([
    fauxAssistantMessage([fauxText(responseText)]),
  ]);
  const model = registration.getModel();

  const loaded = await loadWorkspace({
    agentName: "Aida",
    workspaceDir: await createIsolatedWorkspace(),
  });

  let identitySnapshot = { ...loaded.identity };
  const workspaceDir = loaded.identity.workspaceDir;

  const memoryStore = new MemoryStore(workspaceDir);
  await memoryStore.ensureDirs();
  const memoryIndex = new MemoryIndex(memoryStore.paths);
  const memoryManager = new MemoryManager({
    store: memoryStore,
    index: memoryIndex,
    config: { ...DEFAULT_MEMORY_CONFIG, enabled: true },
    model,
    apiKey: "faux-test-key",
    getAgent: () => undefined,
    rebuildSystemPrompt: () => {},
  });
  await memoryManager.initialize();
  const initialMemorySection = await memoryManager.loadBootstrap();

  const agent = await createLlmAgent({
    llm: { provider: model.provider, modelId: model.id },
    model,
    apiKey: "faux-test-key",
    toolsCwd: workspaceDir,
    browserEnabled: false,
    identity: identitySnapshot,
    identityStore: loaded.identityStore,
    userStore: loaded.userStore,
    getIdentity: () => identitySnapshot,
    setIdentityContent: (content) => {
      identitySnapshot = { ...identitySnapshot, identity: content };
    },
    setUserContent: (content) => {
      identitySnapshot = { ...identitySnapshot, user: content };
    },
    memoryManager,
    initialMemorySection,
  });

  memoryManager.setGetAgent(() => agent);

  const runtime = new WorkerRuntime(agent, TEST_SESSION_ID, memoryManager);
  runtime.start();

  const ctx: AppContext = {
    agentId: TEST_AGENT_ID,
    sessionId: TEST_SESSION_ID,
    runtime,
    memoryManager,
    onShutdown: async () => {},
    onRestart: async () => {},
  };

  return {
    app: createApp(ctx),
    registration,
    runtime,
    ctx,
  };
}

export async function disposeTestHarness(harness: TestHarness): Promise<void> {
  await harness.runtime.stop();
  harness.ctx.memoryManager?.index.close();
  harness.registration.unregister();
}
