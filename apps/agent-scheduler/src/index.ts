import { parseCli } from "./cli.js";
import { startServer } from "./server.js";
import { SchedulerStore } from "./store/scheduler-store.js";
import { TickLoop } from "./tick-loop.js";

async function main(): Promise<void> {
  const options = parseCli();
  const store = await SchedulerStore.create(options.dbUrl, {
    authToken: options.dbAuthToken,
    legacyDataDir: options.legacyDataDir,
  });

  const now = Date.now();
  await store.recoverStaleLeases(now);
  const adjusted = await store.applyMissedPolicy(now);
  if (adjusted > 0) {
    console.log(`adjusted ${adjusted} overdue cron event(s) per missed policy`);
  }

  const tickLoop = new TickLoop({
    store,
    registerUrl: options.registerUrl,
    leaseMs: options.leaseMs,
    clientId: options.clientId,
    chatTimeoutMs: options.chatTimeoutMs,
    gatewayUrl: options.gatewayUrl,
    onError: (error, context) => {
      console.error(`tick error for event ${context.eventId}:`, error);
    },
  });
  tickLoop.start(options.tickIntervalMs);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, stopping agent-scheduler`);
    tickLoop.stop();
    await store.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  startServer(
    options.host,
    options.port,
    { store, registerUrl: options.registerUrl, tickLoop },
    () => {
      console.log(
        `agent-scheduler ready on http://${options.host}:${options.port} (register ${options.registerUrl}${options.gatewayUrl ? `, gateway ${options.gatewayUrl}` : ""})`,
      );
    },
  );
}

main().catch((error: unknown) => {
  console.error("agent-scheduler failed to start:", error);
  process.exit(1);
});
