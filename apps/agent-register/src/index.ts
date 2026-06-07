import { parseCli } from "./cli.js";
import { HeartbeatMonitor } from "./heartbeat-monitor.js";
import { AgentRegistryStore } from "./store.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const options = parseCli();
  const store = await AgentRegistryStore.create(
    options.dbUrl,
    options.dbAuthToken,
  );
  const heartbeatMonitor = new HeartbeatMonitor({
    store,
    intervalMs: options.heartbeatIntervalMs,
    requestTimeoutMs: options.heartbeatTimeoutMs,
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, stopping agent-register`);
    heartbeatMonitor.stop();
    await store.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  startServer(options, { store, heartbeatMonitor });
}

main().catch((error: unknown) => {
  console.error("agent-register failed to start:", error);
  process.exit(1);
});
