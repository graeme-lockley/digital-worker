import { parseCli } from "./cli.js";
import {
  buildCorrelationId,
  CorrelationRegistry,
} from "./correlation-registry.js";
import { Mailbox } from "./mailbox.js";
import { Notifier } from "./notifier.js";
import { createPersistence } from "./persistence.js";
import { startServer } from "./server.js";
import { GatewayStore } from "./store/gateway-store.js";
import { TelegramAdapter } from "./telegram/adapter.js";

async function main(): Promise<void> {
  const options = parseCli();
  const mailbox = new Mailbox();
  const correlations = new CorrelationRegistry();
  const store = await GatewayStore.create(options.dbUrl, {
    authToken: options.dbAuthToken,
    legacyDataDir: options.legacyDataDir,
  });
  const persistence = createPersistence(store);

  const bootstrap = await store.loadBootstrap();
  if (bootstrap.messages.length > 0) {
    mailbox.restore(bootstrap.messages);
  }
  if (Object.keys(bootstrap.correlations).length > 0) {
    correlations.restore(bootstrap.correlations);
  }

  const telegram = new TelegramAdapter({
    token: options.telegramToken,
    allowedChatIds: options.allowedChatIds,
    onError: (error) => {
      console.error("telegram adapter error:", error);
    },
  });

  telegram.setUpdateOffset(bootstrap.telegramOffset);

  const notifier = new Notifier({
    agentCoreUrl: options.agentCoreUrl,
    mailbox,
    clientId: "agent-gateway",
    inFlightTimeoutMs: options.renotifyIntervalMs,
    onError: (error) => {
      console.error("notifier error:", error);
    },
  });

  await telegram.start((message) => {
    const stored = mailbox.add(message);
    const threadId = stored.threadId ?? [...options.allowedChatIds][0];
    if (threadId) {
      const correlationId = buildCorrelationId(stored.channel, threadId);
      const entry = {
        channel: stored.channel,
        threadId,
        sender: stored.sender,
      };
      correlations.register(correlationId, entry);
      void persistence
        .onInboundMessage(
          stored,
          telegram.getUpdateOffset(),
          { id: correlationId, entry },
        )
        .catch((error) => {
          console.error("persist failed:", error);
        });
    } else {
      void persistence
        .onInboundMessage(stored, telegram.getUpdateOffset())
        .catch((error) => {
          console.error("persist failed:", error);
        });
    }
    notifier.onMailboxChanged();
  });

  notifier.replayUnread();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, stopping agent-gateway`);
    notifier.dispose();
    await telegram.stop();
    await persistence.onShutdown(telegram.getUpdateOffset());
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
    { host: options.host, port: options.port },
    { mailbox, telegram, notifier, correlations, persistence },
    () => {
      console.log(
        `telegram gateway ready (agent-core ${options.agentCoreUrl}, ${options.allowedChatIds.size} allowed chat(s))`,
      );
    },
  );
}

main().catch((error: unknown) => {
  console.error("agent-gateway failed to start:", error);
  process.exit(1);
});
