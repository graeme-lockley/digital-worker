import { parseCli } from "./cli.js";
import {
  buildCorrelationId,
  CorrelationRegistry,
} from "./correlation-registry.js";
import { Mailbox } from "./mailbox.js";
import { Notifier } from "./notifier.js";
import { createPersistence } from "./persistence.js";
import { startServer } from "./server.js";
import { GatewayStore, type GatewayBootstrap } from "./store/gateway-store.js";
import { TelegramBotRegistry } from "./telegram/bot-registry.js";
import { normalizeTelegramBootstrap } from "./telegram/telegram-bot-config.js";

async function main(): Promise<void> {
  const options = parseCli();
  const mailbox = new Mailbox();
  const correlations = new CorrelationRegistry();
  const store = await GatewayStore.create(options.dbUrl, {
    authToken: options.dbAuthToken,
    legacyDataDir: options.legacyDataDir,
  });
  const persistence = createPersistence(store);

  const bootstrap = normalizeTelegramBootstrap(
    await store.loadBootstrap(),
    options.telegramBots,
  ) as GatewayBootstrap;
  if (bootstrap.messages.length > 0) {
    mailbox.restore(bootstrap.messages);
  }
  if (Object.keys(bootstrap.correlations).length > 0) {
    correlations.restore(bootstrap.correlations);
  }

  const telegramBots = new TelegramBotRegistry(
    options.telegramBots,
    (botId, error) => {
      console.error(`telegram adapter error (${botId}):`, error);
    },
  );
  telegramBots.restoreOffsets(bootstrap.telegramOffsets);

  const notifier = new Notifier({
    resolveAgentCoreUrl: (botId) => telegramBots.agentCoreUrlFor(botId),
    mailbox,
    clientId: "agent-gateway",
    inFlightTimeoutMs: options.renotifyIntervalMs,
    onError: (error) => {
      console.error("notifier error:", error);
    },
  });

  await telegramBots.start((botId, message) => {
    const stored = mailbox.add({
      ...message,
      botId: message.botId ?? botId,
    });
    const threadId = stored.threadId ?? [...options.allowedChatIds][0];
    if (threadId) {
      const correlationId = buildCorrelationId(stored.channel, threadId, botId);
      const entry = {
        channel: stored.channel,
        threadId,
        sender: stored.sender,
        botId,
      };
      correlations.register(correlationId, entry);
      void persistence
        .onInboundMessage(
          stored,
          botId,
          telegramBots.getAdapter(botId).getUpdateOffset(),
          { id: correlationId, entry },
        )
        .catch((error) => {
          console.error("persist failed:", error);
        });
    } else {
      void persistence
        .onInboundMessage(
          stored,
          botId,
          telegramBots.getAdapter(botId).getUpdateOffset(),
        )
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
    await telegramBots.stop();
    await persistence.onShutdown(telegramBots.exportOffsets());
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
    { mailbox, telegramBots, notifier, correlations, persistence },
    () => {
      const botSummary = options.telegramBots
        .map((bot) => `${bot.botId}→${bot.agentCoreUrl}`)
        .join(", ");
      console.log(
        `telegram gateway ready (${botSummary}, ${options.allowedChatIds.size} allowed chat(s))`,
      );
    },
  );
}

main().catch((error: unknown) => {
  console.error("agent-gateway failed to start:", error);
  process.exit(1);
});
