import type { InboundMessage } from "@digital-worker/agent-gateway-protocol";

export type MailboxOptions = {
  /** When true, readUnread returns messages without marking them read. */
  peek?: boolean;
};

export class Mailbox {
  private readonly messages = new Map<string, InboundMessage>();

  add(message: Omit<InboundMessage, "read">): InboundMessage {
    const stored: InboundMessage = { ...message, read: false };
    this.messages.set(stored.id, stored);
    return stored;
  }

  unreadCount(): number {
    let count = 0;
    for (const message of this.messages.values()) {
      if (!message.read) {
        count += 1;
      }
    }
    return count;
  }

  /** Returns unread messages sorted by receivedAt ascending. Marks them read unless peeking. */
  readUnread(options?: MailboxOptions): InboundMessage[] {
    const unread = [...this.messages.values()]
      .filter((m) => !m.read)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

    if (!options?.peek) {
      for (const message of unread) {
        message.read = true;
      }
    }

    return unread.map((m) => ({ ...m }));
  }

  peekUnread(): InboundMessage[] {
    return this.readUnread({ peek: true });
  }

  ack(ids: string[]): number {
    let acked = 0;
    for (const id of ids) {
      const message = this.messages.get(id);
      if (message && !message.read) {
        message.read = true;
        acked += 1;
      }
    }
    return acked;
  }

  /** Restore messages from persistence (Phase 2). */
  restore(messages: InboundMessage[]): void {
    this.messages.clear();
    for (const message of messages) {
      this.messages.set(message.id, { ...message });
    }
  }

  /** Export all messages for persistence (Phase 2). */
  exportAll(): InboundMessage[] {
    return [...this.messages.values()].map((m) => ({ ...m }));
  }

  clear(): void {
    this.messages.clear();
  }
}
