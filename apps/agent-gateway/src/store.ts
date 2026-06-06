import fs from "node:fs/promises";
import path from "node:path";

import type {
  CorrelationEntry,
  InboundMessage,
} from "@digital-worker/agent-gateway-protocol";

export type PersistedState = {
  messages: InboundMessage[];
  telegramOffset: number;
  correlations?: Record<string, CorrelationEntry>;
};

export class GatewayStore {
  private saveChain: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string) {}

  private statePath(): string {
    return path.join(this.dataDir, "state.json");
  }

  async load(): Promise<PersistedState | null> {
    try {
      const raw = await fs.readFile(this.statePath(), "utf8");
      return JSON.parse(raw) as PersistedState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /** Serializes writes so concurrent saves cannot race on the temp file. */
  async save(state: PersistedState): Promise<void> {
    this.saveChain = this.saveChain
      .catch(() => {})
      .then(() => this.writeState(state));
    await this.saveChain;
  }

  private async writeState(state: PersistedState): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const target = this.statePath();
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tmp, target);
  }
}
