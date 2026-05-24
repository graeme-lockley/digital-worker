import { parseCli } from "./cli.js";
import { buildAgentEndpointUrl } from "./endpoint.js";
import { deregisterAgent, registerAgent } from "./registration.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const options = parseCli();
  const endpointUrl = buildAgentEndpointUrl(options.host, options.port);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, deregistering agent ${options.agentId}`);
    try {
      await deregisterAgent({
        registerUrl: options.registerUrl,
        agentId: options.agentId,
      });
      console.log(`deregistered agent ${options.agentId}`);
    } catch (error) {
      console.error("deregistration failed:", error);
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

  startServer(options, { agentId: options.agentId }, async () => {
    await registerAgent({
      registerUrl: options.registerUrl,
      agentId: options.agentId,
      name: options.name,
      purpose: options.purpose,
      skills: options.skills,
      endpointUrl,
    });
    console.log(
      `registered agent ${options.agentId} with ${options.registerUrl}`,
    );
  });
}

main().catch((error: unknown) => {
  console.error("agent-core failed to start:", error);
  process.exit(1);
});
