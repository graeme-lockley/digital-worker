import type { ChannelAdapter, NormalizedInbound } from "../channel-adapter.js";

export type { NormalizedInbound } from "../channel-adapter.js";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
    date: number;
  };
};

export type TelegramAdapterOptions = {
  token: string;
  allowedChatIds: Set<string>;
  fetchFn?: typeof fetch;
  pollTimeoutSeconds?: number;
  onError?: (error: unknown) => void;
};

export class TelegramAdapter implements ChannelAdapter {
  readonly channel = "telegram";
  private offset = 0;
  private running = false;
  private pollPromise?: Promise<void>;

  constructor(private readonly options: TelegramAdapterOptions) {}

  getUpdateOffset(): number {
    return this.offset;
  }

  setUpdateOffset(offset: number): void {
    this.offset = offset;
  }

  async start(onMessage: (message: NormalizedInbound) => void): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.pollPromise = this.pollLoop(onMessage);
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.pollPromise;
  }

  normalizeUpdate(update: TelegramUpdate): NormalizedInbound | null {
    const msg = update.message;
    if (!msg?.text?.trim()) {
      return null;
    }

    const chatId = String(msg.chat.id);
    if (!this.options.allowedChatIds.has(chatId)) {
      return null;
    }

    const sender =
      msg.from?.username ??
      msg.from?.first_name ??
      String(msg.from?.id ?? chatId);

    return {
      id: `telegram-${update.update_id}`,
      channel: this.channel,
      sender,
      text: msg.text.trim(),
      threadId: chatId,
      receivedAt: new Date(msg.date * 1000).toISOString(),
    };
  }

  async send(
    text: string,
    threadId?: string,
  ): Promise<{ providerMessageId?: string }> {
    const chatId = threadId ?? [...this.options.allowedChatIds][0];
    if (!chatId) {
      throw new Error("no telegram chat id configured");
    }

    const fetchFn = this.options.fetchFn ?? fetch;
    const url = `https://api.telegram.org/bot${this.options.token}/sendMessage`;
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`telegram sendMessage failed: ${detail}`);
    }

    const payload = (await response.json()) as {
      ok: boolean;
      result?: { message_id: number };
    };
    return {
      providerMessageId: payload.result?.message_id
        ? String(payload.result.message_id)
        : undefined,
    };
  }

  private async pollLoop(
    onMessage: (message: NormalizedInbound) => void,
  ): Promise<void> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const timeout = this.options.pollTimeoutSeconds ?? 30;

    while (this.running) {
      try {
        const url = new URL(
          `https://api.telegram.org/bot${this.options.token}/getUpdates`,
        );
        url.searchParams.set("offset", String(this.offset + 1));
        url.searchParams.set("timeout", String(timeout));

        const response = await fetchFn(url);
        if (!response.ok) {
          throw new Error(`getUpdates failed: ${response.status}`);
        }

        const payload = (await response.json()) as {
          ok: boolean;
          result?: TelegramUpdate[];
        };

        if (!payload.ok || !payload.result) {
          continue;
        }

        for (const update of payload.result) {
          this.offset = Math.max(this.offset, update.update_id);
          const normalized = this.normalizeUpdate(update);
          if (normalized) {
            onMessage(normalized);
          }
        }
      } catch (error) {
        this.options.onError?.(error);
        await sleep(2000);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseAllowedChatIds(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}
