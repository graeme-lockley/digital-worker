import { randomUUID } from "node:crypto";

import { buildCorrelationId } from "../correlation-registry.js";
import type { GatewayContext } from "../server.js";

export function isTelegramGroupChatId(threadId: string | undefined): boolean {
  if (!threadId?.trim()) {
    return false;
  }
  const parsed = Number(threadId.trim());
  return Number.isFinite(parsed) && parsed < 0;
}

/** Notify other configured bots when an agent posts to a Telegram group. */
export async function fanOutGroupAgentMessage(
  ctx: GatewayContext,
  options: { senderBotId: string; threadId: string; text: string },
): Promise<void> {
  const threadId = options.threadId.trim();
  if (!isTelegramGroupChatId(threadId)) {
    return;
  }

  const senderBotId = options.senderBotId.trim();
  const otherBotIds = ctx.telegramBots.botIds.filter((id) => id !== senderBotId);
  if (otherBotIds.length === 0) {
    return;
  }

  for (const botId of otherBotIds) {
    const stored = ctx.mailbox.add({
      id: `telegram-peer-${randomUUID()}`,
      channel: "telegram",
      botId,
      sender: senderBotId,
      text: options.text.trim(),
      threadId,
      receivedAt: new Date().toISOString(),
    });

    const correlationId = buildCorrelationId(stored.channel, threadId, botId);
    const entry = {
      channel: stored.channel,
      threadId,
      sender: senderBotId,
      botId,
    };
    ctx.correlations.register(correlationId, entry);

    await ctx.persistence
      .onInboundMessage(
        stored,
        botId,
        ctx.telegramBots.getAdapter(botId).getUpdateOffset(),
        { id: correlationId, entry },
      )
      .catch((error) => {
        console.error("group peer fan-out persist failed:", error);
      });
  }

  ctx.notifier.onMailboxChanged();
}
