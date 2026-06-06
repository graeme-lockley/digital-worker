import {
  AGENT_CORE_PATHS,
  type NotifyRequest,
} from "@digital-worker/agent-core-protocol";

import type { InboundMessage } from "@digital-worker/agent-gateway-protocol";

import { buildCorrelationId } from "./correlation-registry.js";
import type { Mailbox } from "./mailbox.js";

export type NotifierOptions = {
  agentCoreUrl: string;
  mailbox: Mailbox;
  clientId: string;
  /** Debounce rapid bursts before notifying (ms). */
  debounceMs?: number;
  /** Retry in-flight notify after this interval if still unread (ms). */
  inFlightTimeoutMs?: number;
  fetchFn?: typeof fetch;
  onError?: (error: unknown) => void;
};

type ThreadKey = string;

export class Notifier {
  private readonly debounceTimers = new Map<ThreadKey, ReturnType<typeof setTimeout>>();
  private readonly inFlightByThread = new Map<ThreadKey, Set<string>>();
  private readonly retryTimers = new Map<ThreadKey, ReturnType<typeof setTimeout>>();

  constructor(private readonly options: NotifierOptions) {}

  /** Call when new messages arrive in the mailbox or on startup replay. */
  onMailboxChanged(): void {
    const unread = this.options.mailbox.peekUnread();
    if (unread.length === 0) {
      return;
    }

    const byThread = groupUnreadByThread(unread);
    for (const [threadKey, messages] of byThread) {
      this.scheduleThreadNotify(threadKey, messages);
    }
  }

  /** Replay any still-unread messages (e.g. after restart). */
  replayUnread(): void {
    this.onMailboxChanged();
  }

  /** Clear in-flight tracking after a successful reply delivery. */
  onReplyDelivered(messageIds: string[]): void {
    for (const [threadKey, ids] of this.inFlightByThread) {
      for (const id of messageIds) {
        ids.delete(id);
      }
      if (ids.size === 0) {
        this.inFlightByThread.delete(threadKey);
        const retryTimer = this.retryTimers.get(threadKey);
        if (retryTimer) {
          clearTimeout(retryTimer);
          this.retryTimers.delete(threadKey);
        }
      }
    }
  }

  /** Clear in-flight tracking on notify failure so messages can be retried. */
  onNotifyFailed(threadKey: ThreadKey, messageIds: string[]): void {
    const ids = this.inFlightByThread.get(threadKey);
    if (!ids) {
      return;
    }
    for (const id of messageIds) {
      ids.delete(id);
    }
    if (ids.size === 0) {
      this.inFlightByThread.delete(threadKey);
    }
    this.scheduleRetry(threadKey);
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.retryTimers.clear();
  }

  private scheduleThreadNotify(
    threadKey: ThreadKey,
    messages: InboundMessage[],
  ): void {
    const pending = messages.filter(
      (m) => !this.isMessageInFlight(threadKey, m.id),
    );
    if (pending.length === 0) {
      return;
    }

    const existing = this.debounceTimers.get(threadKey);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(
      threadKey,
      setTimeout(() => {
        this.debounceTimers.delete(threadKey);
        void this.sendThreadNotification(threadKey);
      }, this.options.debounceMs ?? 500),
    );
  }

  private scheduleRetry(threadKey: ThreadKey): void {
    const timeout = this.options.inFlightTimeoutMs ?? 5 * 60 * 1000;
    if (timeout <= 0) {
      return;
    }

    const existing = this.retryTimers.get(threadKey);
    if (existing) {
      clearTimeout(existing);
    }

    this.retryTimers.set(
      threadKey,
      setTimeout(() => {
        this.retryTimers.delete(threadKey);
        void this.sendThreadNotification(threadKey);
      }, timeout),
    );
  }

  private isMessageInFlight(threadKey: ThreadKey, messageId: string): boolean {
    return this.inFlightByThread.get(threadKey)?.has(messageId) ?? false;
  }

  private markInFlight(threadKey: ThreadKey, messageIds: string[]): void {
    let ids = this.inFlightByThread.get(threadKey);
    if (!ids) {
      ids = new Set();
      this.inFlightByThread.set(threadKey, ids);
    }
    for (const id of messageIds) {
      ids.add(id);
    }
  }

  private async sendThreadNotification(threadKey: ThreadKey): Promise<void> {
    const unread = this.options.mailbox.peekUnread();
    const threadMessages = unread.filter(
      (m) => threadKeyForMessage(m) === threadKey,
    );
    const pending = threadMessages.filter(
      (m) => !this.isMessageInFlight(threadKey, m.id),
    );

    if (pending.length === 0) {
      return;
    }

    const first = pending[0]!;
    const channel = first.channel;
    const threadId = first.threadId ?? threadKey;
    const sender = first.sender;
    const correlationId = buildCorrelationId(channel, threadId);
    const messageIds = pending.map((m) => m.id);
    const prompt = pending.map((m) => m.text.trim()).join("\n\n");

    this.markInFlight(threadKey, messageIds);

    try {
      await this.postNotify({
        clientId: this.options.clientId,
        prompt,
        channel,
        correlationId,
        threadId,
        sender,
        messageIds,
      });
    } catch (error) {
      this.onNotifyFailed(threadKey, messageIds);
      this.options.onError?.(error);
    }
  }

  private async postNotify(body: NotifyRequest): Promise<void> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const url = new URL(AGENT_CORE_PATHS.notify, this.options.agentCoreUrl);
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

function threadKeyForMessage(message: InboundMessage): ThreadKey {
  return `${message.channel}:${message.threadId ?? "default"}`;
}

function groupUnreadByThread(
  messages: InboundMessage[],
): Map<ThreadKey, InboundMessage[]> {
  const groups = new Map<ThreadKey, InboundMessage[]>();
  for (const message of messages) {
    const key = threadKeyForMessage(message);
    const list = groups.get(key) ?? [];
    list.push(message);
    groups.set(key, list);
  }
  return groups;
}
