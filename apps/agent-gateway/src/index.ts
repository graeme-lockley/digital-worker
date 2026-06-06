import { parseCli } from "./cli.js";
import {
  buildCorrelationId,
  CorrelationRegistry,
} from "./correlation-registry.js";
import { Mailbox } from "./mailbox.js";
import { Notifier } from "./notifier.js";
import { startServer } from "./server.js";
import { GatewayStore } from "./store.js";
import { TelegramAdapter } from "./telegram/adapter.js";

async function main(): Promise<void> {
  const options = parseCli();
  const mailbox = new Mailbox();
  const correlations = new CorrelationRegistry();
  const store = new GatewayStore(options.dataDir);

  const persisted = await store.load();
  if (persisted) {
    mailbox.restore(persisted.messages);
    if (persisted.correlations) {
      correlations.restore(persisted.correlations);
    }
  }

  const telegram = new TelegramAdapter({
    token: options.telegramToken,
    allowedChatIds: options.allowedChatIds,
    onError: (error) => {
      console.error("telegram adapter error:", error);
    },
  });

  if (persisted) {
    telegram.setUpdateOffset(persisted.telegramOffset);
  }

  const persist = async (): Promise<void> => {
    await store.save({
      messages: mailbox.exportAll(),
      telegramOffset: telegram.getUpdateOffset(),
      correlations: correlations.exportAll(),
    });
  };

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
      correlations.register(correlationId, {
        channel: stored.channel,
        threadId,
        sender: stored.sender,
      });
    }
    void persist().catch((error) => {
      console.error("persist failed:", error);
    });
    notifier.onMailboxChanged();
  });

  notifier.replayUnread();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, stopping agent-gateway`);
    notifier.dispose();
    await telegram.stop();
    await persist();
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
    { mailbox, telegram, notifier, correlations, persist },
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
