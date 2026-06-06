import type { ObserverEvent } from "@digital-worker/agent-core-protocol";

export type ObserverEmit = (event: ObserverEvent) => Promise<void>;

export class ObserverHub {
  private readonly subscribers = new Set<ObserverEmit>();

  subscribe(emit: ObserverEmit): () => void {
    this.subscribers.add(emit);
    return () => {
      this.subscribers.delete(emit);
    };
  }

  async publish(event: ObserverEvent): Promise<void> {
    const subscribers = [...this.subscribers];
    await Promise.all(
      subscribers.map(async (emit) => {
        try {
          await emit(event);
        } catch {
          this.subscribers.delete(emit);
        }
      }),
    );
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}
