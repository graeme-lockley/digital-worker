import type { NormalizedInbound } from "../channel-adapter.js";

import { TelegramAdapter } from "./adapter.js";

export type TelegramBotDefinition = {
  botId: string;
  token: string;
  agentCoreUrl: string;
  allowedChatIds: Set<string>;
};

export class TelegramBotRegistry {
  private readonly adapters = new Map<string, TelegramAdapter>();
  private readonly agentCoreUrlByBotId = new Map<string, string>();
  private readonly offsets = new Map<string, number>();
  private running = false;

  constructor(
    private readonly bots: TelegramBotDefinition[],
    private readonly onError?: (botId: string, error: unknown) => void,
  ) {
    for (const bot of bots) {
      this.adapters.set(
        bot.botId,
        new TelegramAdapter({
          botId: bot.botId,
          token: bot.token,
          allowedChatIds: bot.allowedChatIds,
        }),
      );
      this.agentCoreUrlByBotId.set(bot.botId, bot.agentCoreUrl);
    }
  }

  get botIds(): string[] {
    return [...this.adapters.keys()];
  }

  defaultBotId(): string {
    const first = this.bots[0];
    if (!first) {
      throw new Error("no telegram bots configured");
    }
    return first.botId;
  }

  resolveBotId(botId?: string): string {
    if (botId?.trim()) {
      const resolved = botId.trim();
      if (!this.adapters.has(resolved)) {
        throw new Error(`unknown telegram bot id: ${resolved}`);
      }
      return resolved;
    }
    if (this.adapters.size === 1) {
      return this.defaultBotId();
    }
    throw new Error("botId is required when multiple telegram bots are configured");
  }

  agentCoreUrlFor(botId: string): string {
    const url = this.agentCoreUrlByBotId.get(botId);
    if (!url) {
      throw new Error(`no agent-core url for bot ${botId}`);
    }
    return url;
  }

  getAdapter(botId: string): TelegramAdapter {
    const adapter = this.adapters.get(botId);
    if (!adapter) {
      throw new Error(`unknown telegram bot id: ${botId}`);
    }
    return adapter;
  }

  getOffset(botId: string): number {
    return this.offsets.get(botId) ?? 0;
  }

  restoreOffsets(offsets: Record<string, number>): void {
    for (const [botId, offset] of Object.entries(offsets)) {
      if (this.adapters.has(botId)) {
        this.offsets.set(botId, offset);
        this.getAdapter(botId).setUpdateOffset(offset);
      }
    }
  }

  exportOffsets(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const botId of this.adapters.keys()) {
      out[botId] = this.getAdapter(botId).getUpdateOffset();
    }
    return out;
  }

  async start(onMessage: (botId: string, message: NormalizedInbound) => void): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    await Promise.all(
      [...this.adapters.entries()].map(([botId, adapter]) =>
        adapter.start((message) => {
          onMessage(botId, message);
        }),
      ),
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    await Promise.all([...this.adapters.values()].map((adapter) => adapter.stop()));
  }
}
