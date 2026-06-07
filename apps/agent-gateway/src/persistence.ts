import type { CorrelationEntry, InboundMessage } from "@digital-worker/agent-gateway-protocol";

import type { GatewayStore } from "./store/gateway-store.js";

export type GatewayPersistence = {
  onInboundMessage: (
    message: InboundMessage,
    botId: string,
    telegramOffset: number,
    correlation?: { id: string; entry: CorrelationEntry },
  ) => Promise<void>;
  onMessagesRead: (ids: string[]) => Promise<void>;
  onShutdown: (telegramOffsets: Record<string, number>) => Promise<void>;
};

export function createPersistence(
  store: GatewayStore,
): GatewayPersistence {
  return {
    onInboundMessage: async (message, botId, telegramOffset, correlation) => {
      await store.upsertMessage(message);
      if (correlation) {
        await store.upsertCorrelation(correlation.id, correlation.entry);
      }
      await store.setTelegramOffset(botId, telegramOffset);
    },
    onMessagesRead: async (ids) => {
      await store.markMessagesRead(ids);
    },
    onShutdown: async (telegramOffsets) => {
      for (const [botId, offset] of Object.entries(telegramOffsets)) {
        await store.setTelegramOffset(botId, offset);
      }
    },
  };
}
