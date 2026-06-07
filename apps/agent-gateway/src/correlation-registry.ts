import type { CorrelationEntry } from "@digital-worker/agent-gateway-protocol";

export class CorrelationRegistry {
  private readonly entries = new Map<string, CorrelationEntry>();

  register(correlationId: string, entry: CorrelationEntry): void {
    this.entries.set(correlationId, { ...entry });
  }

  resolve(correlationId: string): CorrelationEntry | undefined {
    const entry = this.entries.get(correlationId);
    return entry ? { ...entry } : undefined;
  }

  restore(entries: Record<string, CorrelationEntry>): void {
    this.entries.clear();
    for (const [id, entry] of Object.entries(entries)) {
      this.entries.set(id, { ...entry });
    }
  }

  exportAll(): Record<string, CorrelationEntry> {
    const out: Record<string, CorrelationEntry> = {};
    for (const [id, entry] of this.entries) {
      out[id] = { ...entry };
    }
    return out;
  }

  clear(): void {
    this.entries.clear();
  }
}

export function buildCorrelationId(
  channel: string,
  threadId: string,
  botId?: string,
): string {
  if (botId?.trim()) {
    return `${channel}:${botId.trim()}:${threadId}`;
  }
  return `${channel}:${threadId}`;
}

export function parseCorrelationId(correlationId: string): {
  channel: string;
  threadId: string;
  botId?: string;
} {
  const parts = correlationId.split(":");
  if (parts.length === 2) {
    return { channel: parts[0]!, threadId: parts[1]! };
  }
  if (parts.length === 3) {
    return { channel: parts[0]!, botId: parts[1], threadId: parts[2]! };
  }
  throw new Error(`invalid correlation id: ${correlationId}`);
}
