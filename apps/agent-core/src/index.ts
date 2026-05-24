import { parseCli } from "./cli.js";
import { buildAgentEndpointUrl } from "./endpoint.js";
import { createLlmAgent } from "./llm-agent.js";
import { deregisterAgent, registerAgent } from "./registration.js";
import { startServer } from "./server.js";
import {
  extractPurposeFromMandate,
  loadWorkspace,
  type WorkspaceIdentity,
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

  const agent = createLlmAgent({
    llm: options.llm,
    apiKey: options.apiKey,
    toolsCwd: options.toolsCwd,
    identity: identitySnapshot,
    identityStore: loaded.identityStore,
    getIdentity: () => identitySnapshot,
    setIdentityContent: (content) => {
      identitySnapshot = { ...identitySnapshot, identity: content };
    },
  });

  const sessionId = crypto.randomUUID();
  const runtime = new WorkerRuntime(agent, sessionId);
  runtime.start();

  const purpose =
    options.purpose ?? extractPurposeFromMandate(loaded.identity.mandate);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, stopping worker ${options.agentId}`);
    try {
      await runtime.stop();
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

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  startServer(
    options,
    { agentId: options.agentId, sessionId, runtime },
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
