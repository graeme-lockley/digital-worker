import { parseCli } from "./cli.js";
import { buildAgentEndpointUrl } from "./endpoint.js";
import { createLlmAgent } from "./llm-agent.js";
import {
  MemoryIndex,
  MemoryManager,
  MemoryStore,
} from "./memory/index.js";
import { spawnReplacementProcess, usesRestartLoop, RESTART_EXIT_CODE } from "./process-restart.js";
import { deregisterAgent, registerAgent } from "./registration.js";
import { getConfiguredModel, resolveApiKey } from "./llm-config.js";
import { startServer } from "./server.js";
import {
  extractPurposeFromMandate,
  loadWorkspace,
} from "./workspace/index.js";
import { WorkerRuntime } from "./worker-runtime.js";

async function main(): Promise<void> {
  const options = parseCli();
  const endpointUrl =
    options.endpointUrl ?? buildAgentEndpointUrl(options.host, options.port);

  const loaded = await loadWorkspace({
    agentName: options.agentName,
    workspaceDir: options.workspaceDir,
  });

  let identitySnapshot = { ...loaded.identity };

  const memoryStore = new MemoryStore(options.workspaceDir);
  const memoryIndex = new MemoryIndex(memoryStore.paths);
  const model = getConfiguredModel(options.llm);
  const apiKey = resolveApiKey(options.llm.provider, options.apiKey) ?? "";

  let memoryManager: MemoryManager | undefined;
  if (options.memory.enabled) {
    memoryManager = new MemoryManager({
      store: memoryStore,
      index: memoryIndex,
      config: options.memory,
      model,
      apiKey,
      getAgent: () => undefined,
      rebuildSystemPrompt: () => {},
    });
    await memoryManager.initialize();
  }

  const initialMemorySection = memoryManager
    ? await memoryManager.loadBootstrap()
    : "";

  const agent = await createLlmAgent({
    llm: options.llm,
    apiKey: options.apiKey,
    toolsCwd: options.toolsCwd,
    browserEnabled: options.browserEnabled,
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

  const sessionId = crypto.randomUUID();
  const runtime = new WorkerRuntime(agent, sessionId, memoryManager);
  runtime.start();

  const purpose =
    options.purpose ?? extractPurposeFromMandate(loaded.identity.mandate);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, stopping worker ${options.agentId}`);
    try {
      await runtime.stop();
      memoryIndex.close();
      await deregisterAgent({
        registerUrl: options.registerUrl,
        agentId: options.agentId,
      });
      console.log(`deregistered agent ${options.agentId}`);
    } catch (error) {
      console.error("shutdown failed:", error);
    } finally {
      process.exit(0);
    }
  };

  const restart = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, restarting worker ${options.agentId}`);
    try {
      await runtime.stop();
      memoryIndex.close();
      await deregisterAgent({
        registerUrl: options.registerUrl,
        agentId: options.agentId,
      });
      if (usesRestartLoop()) {
        console.log(
          `deregistered agent ${options.agentId}, exiting for restart loop`,
        );
        process.exit(RESTART_EXIT_CODE);
      }
      console.log(
        `deregistered agent ${options.agentId}, spawning replacement`,
      );
      spawnReplacementProcess();
    } catch (error) {
      console.error("restart failed:", error);
      process.exit(1);
      return;
    }
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  startServer(
    options,
    {
      agentId: options.agentId,
      sessionId,
      runtime,
      memoryManager,
      onShutdown: shutdown,
      onRestart: restart,
    },
    async () => {
      await registerAgent({
        registerUrl: options.registerUrl,
        agentId: options.agentId,
        name: options.name,
        purpose,
        skills: options.skills,
        endpointUrl,
      });
      console.log(
        `registered agent ${options.agentId} (${options.name}) with ${options.registerUrl}`,
      );
      console.log(
        `LLM ${options.llm.provider}/${options.llm.modelId} workspace ${options.workspaceDir}`,
      );
    },
  );
}

main().catch((error: unknown) => {
  console.error("agent-core failed to start:", error);
  process.exit(1);
});
