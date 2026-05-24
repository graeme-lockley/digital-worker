import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fauxAssistantMessage,
  fauxText,
  registerFauxProvider,
  type FauxProviderRegistration,
} from "@earendil-works/pi-ai";

import { createLlmAgent } from "./llm-agent.js";
import { createApp, type AppContext } from "./server.js";
import { loadWorkspace } from "./workspace/index.js";
import { WorkerRuntime } from "./worker-runtime.js";

export const TEST_SESSION_ID = "test-worker-session";
export const TEST_AGENT_ID = "test-agent-id";

export function repoWorkspacePath(agentName = "agent-core"): string {
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(srcDir, "../../..");
  return path.join(repoRoot, "workspace", agentName);
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
    agentName: "agent-core",
    workspaceDir: repoWorkspacePath(),
  });

  let identitySnapshot = { ...loaded.identity };
  const agent = createLlmAgent({
    llm: { provider: model.provider, modelId: model.id },
    model,
    apiKey: "faux-test-key",
    identity: identitySnapshot,
    identityStore: loaded.identityStore,
    getIdentity: () => identitySnapshot,
    setIdentityContent: (content) => {
      identitySnapshot = { ...identitySnapshot, identity: content };
    },
  });

  const runtime = new WorkerRuntime(agent, TEST_SESSION_ID);
  runtime.start();

  const ctx: AppContext = {
    agentId: TEST_AGENT_ID,
    sessionId: TEST_SESSION_ID,
    runtime,
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
  harness.registration.unregister();
}
