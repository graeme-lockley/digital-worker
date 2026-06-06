import {
  AGENT_CORE_PATHS,
  CHAT_STREAM_ACCEPT,
  CHAT_STREAM_EVENT,
  type ChatPromptRequest,
  type ChatStreamEvent,
  type NotifyRequest,
} from "@digital-worker/agent-core-protocol";

import type { Mailbox } from "./mailbox.js";

export type NotifierOptions = {
  agentCoreUrl: string;
  mailbox: Mailbox;
  clientId: string;
  /** Debounce rapid bursts before notifying (ms). */
  debounceMs?: number;
  /** Re-notify if unread messages remain after this interval (ms). */
  renotifyIntervalMs?: number;
  /** Use async notify endpoint instead of chat (Phase 2). */
  useNotifyEndpoint?: boolean;
  fetchFn?: typeof fetch;
  onError?: (error: unknown) => void;
};

export class Notifier {
  private notificationOutstanding = false;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private renotifyTimer?: ReturnType<typeof setTimeout>;
  private lastUnreadBeforeNotify = 0;

  constructor(private readonly options: NotifierOptions) {}

  /** Call when new messages arrive in the mailbox. */
  onMailboxChanged(): void {
    if (this.options.mailbox.unreadCount() === 0) {
      return;
    }

    if (this.notificationOutstanding) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.sendNotification();
    }, this.options.debounceMs ?? 500);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.renotifyTimer) {
      clearTimeout(this.renotifyTimer);
    }
  }

  buildPrompt(unreadCount: number, senders: string[]): string {
    const senderList = [...new Set(senders)].join(", ");
    const noun =
      unreadCount === 1 ? "Telegram message" : "Telegram messages";
    return `You have ${unreadCount} new ${noun} from ${senderList}. Read them with your telegram skill when you choose to.`;
  }

  private async sendNotification(): Promise<void> {
    if (this.notificationOutstanding) {
      return;
    }

    const unread = this.options.mailbox.peekUnread();
    if (unread.length === 0) {
      return;
    }

    this.notificationOutstanding = true;
    this.lastUnreadBeforeNotify = unread.length;

    const prompt = this.buildPrompt(
      unread.length,
      unread.map((m) => m.sender),
    );

    try {
      if (this.options.useNotifyEndpoint) {
        await this.postNotify(prompt, unread.length);
      } else {
        await this.postChat(prompt);
      }
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.notificationOutstanding = false;
      this.scheduleRenotifyIfNeeded();
    }
  }

  private scheduleRenotifyIfNeeded(): void {
    if (this.renotifyTimer) {
      clearTimeout(this.renotifyTimer);
      this.renotifyTimer = undefined;
    }

    const interval = this.options.renotifyIntervalMs ?? 5 * 60 * 1000;
    if (interval <= 0) {
      return;
    }

    this.renotifyTimer = setTimeout(() => {
      this.renotifyTimer = undefined;
      const unread = this.options.mailbox.unreadCount();
      if (unread > 0 && !this.notificationOutstanding) {
        void this.sendNotification();
      }
    }, interval);
  }

  private async postChat(prompt: string): Promise<void> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const url = new URL(AGENT_CORE_PATHS.chat, this.options.agentCoreUrl);
    const body: ChatPromptRequest = {
      clientId: this.options.clientId,
      prompt,
    };

    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: CHAT_STREAM_ACCEPT,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`chat notify failed: ${response.status}`);
    }

    if (!response.body) {
      return;
    }

    await drainSse(response.body);
  }

  private async postNotify(prompt: string, unreadCount: number): Promise<void> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const url = new URL(AGENT_CORE_PATHS.notify, this.options.agentCoreUrl);
    const body: NotifyRequest = {
      clientId: this.options.clientId,
      prompt,
      channel: "telegram",
      unreadCount,
    };
    const response = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status !== 202) {
      throw new Error(`notify failed: ${response.status}`);
    }
  }
}

async function drainSse(body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const dataLine = block
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) {
        continue;
      }
      const json = dataLine.slice(6).trim();
      if (!json) {
        continue;
      }
      const event = JSON.parse(json) as ChatStreamEvent;
      if (
        event.type === CHAT_STREAM_EVENT.DONE ||
        event.type === CHAT_STREAM_EVENT.ERROR
      ) {
        return;
      }
    }
  }
}
