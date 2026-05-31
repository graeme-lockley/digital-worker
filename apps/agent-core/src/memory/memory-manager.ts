import type { Agent } from "@earendil-works/pi-agent-core";
import {
  estimateContextTokens,
  generateSummary,
  shouldCompact,
  type CompactionSettings,
} from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type {
  MaintainMemoryResult,
  MaintainMemoryScope,
} from "@digital-worker/agent-core-protocol";

import type { MemoryIndex } from "./memory-index.js";
import type { MemoryStore } from "./memory-store.js";
import { formatDate, yesterdayDate } from "./paths.js";
import { runMaintenance, type RollupDeps } from "./rollup.js";

export type MemoryConfig = {
  enabled: boolean;
  flushSoftThresholdTokens: number;
  flushMinTurns: number;
  nudgeInterval: number;
  bootstrapBudget: number;
  contextWindow: number;
  flushTimeoutMs: number;
  searchEnabled: boolean;
  ollamaBaseUrl: string;
  distillBinary: string;
};

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enabled: true,
  flushSoftThresholdTokens: 4000,
  flushMinTurns: 6,
  nudgeInterval: 10,
  bootstrapBudget: 8000,
  contextWindow: 128_000,
  flushTimeoutMs: 60_000,
  searchEnabled: true,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  distillBinary: "distill",
};

const FLUSH_USER_PROMPT = `Session memory flush. Review the conversation and persist durable facts, decisions, corrections, and open threads using the remember tool. Do not store transient task state. If nothing is worth storing, reply with exactly: NO_REPLY`;

const FLUSH_SYSTEM_APPEND = `You are performing a silent memory flush before context compaction or session end. Use remember for episodic memory. Use update_user or update_identity only for profile/self-knowledge that belongs there. Reply NO_REPLY if nothing to store.`;

export type MemoryManagerDeps = {
  store: MemoryStore;
  index: MemoryIndex;
  config: MemoryConfig;
  model: Model<string>;
  apiKey: string;
  getAgent: () => Agent | undefined;
  rebuildSystemPrompt: () => void;
};

export class MemoryManager {
  private flushInProgress = false;
  private flushedThisCycle = false;

  constructor(private readonly deps: MemoryManagerDeps) {}

  /** Wire agent reference after session creation. */
  setGetAgent(getAgent: () => Agent | undefined): void {
    this.deps.getAgent = getAgent;
  }

  /** Wire system prompt rebuild callback. */
  setRebuildSystemPrompt(rebuild: () => void): void {
    this.deps.rebuildSystemPrompt = rebuild;
  }

  get store(): MemoryStore {
    return this.deps.store;
  }

  get index(): MemoryIndex {
    return this.deps.index;
  }

  get config(): MemoryConfig {
    return this.deps.config;
  }

  async initialize(): Promise<void> {
    if (!this.deps.config.enabled) {
      return;
    }
    await this.deps.store.ensureDirs();
    try {
      await this.deps.index.reindex(this.deps.store);
    } catch {
      // index rebuild is best-effort on startup
    }
  }

  async loadBootstrap(): Promise<string> {
    if (!this.deps.config.enabled) {
      return "";
    }
    return loadBootstrapSection(
      this.deps.store,
      this.deps.config.bootstrapBudget,
    );
  }

  async recordTurn(): Promise<void> {
    if (!this.deps.config.enabled) {
      return;
    }
    const manifest = await this.deps.store.readManifest();
    manifest.turnCount += 1;
    await this.deps.store.writeManifest(manifest);
  }

  async shouldFlush(): Promise<boolean> {
    if (!this.deps.config.enabled || this.flushInProgress || this.flushedThisCycle) {
      return false;
    }
    const manifest = await this.deps.store.readManifest();
    const turnsSinceFlush = manifest.turnCount - manifest.lastFlushTurnCount;
    if (turnsSinceFlush < this.deps.config.flushMinTurns) {
      return false;
    }

    if (
      this.deps.config.nudgeInterval > 0 &&
      turnsSinceFlush >= this.deps.config.nudgeInterval &&
      turnsSinceFlush % this.deps.config.nudgeInterval === 0
    ) {
      return true;
    }

    const agent = this.deps.getAgent();
    if (!agent) {
      return false;
    }

    const estimate = estimateContextTokens(agent.state.messages);
    const settings: CompactionSettings = {
      enabled: true,
      reserveTokens: 20_000,
      keepRecentTokens: 20_000,
    };
    const softThreshold =
      this.deps.config.contextWindow -
      settings.reserveTokens -
      this.deps.config.flushSoftThresholdTokens;

    return (
      estimate.tokens >= softThreshold ||
      shouldCompact(estimate.tokens, this.deps.config.contextWindow, settings)
    );
  }

  async runFlush(reason: string): Promise<boolean> {
    if (!this.deps.config.enabled || this.flushInProgress) {
      return false;
    }
    const agent = this.deps.getAgent();
    if (!agent) {
      return false;
    }

    const manifest = await this.deps.store.readManifest();
    const turnsSinceFlush = manifest.turnCount - manifest.lastFlushTurnCount;
    if (turnsSinceFlush < this.deps.config.flushMinTurns) {
      return false;
    }

    this.flushInProgress = true;
    try {
      const previousPrompt = agent.state.systemPrompt;
      agent.state.systemPrompt = `${previousPrompt}\n\n${FLUSH_SYSTEM_APPEND}`;

      const flushPromise = agent.prompt(
        `[memory-flush:${reason}] ${FLUSH_USER_PROMPT}`,
      );
      const timeout = new Promise<void>((_, reject) => {
        setTimeout(
          () => reject(new Error("memory flush timed out")),
          this.deps.config.flushTimeoutMs,
        );
      });
      await Promise.race([flushPromise, timeout]);

      manifest.lastFlushAt = new Date().toISOString();
      manifest.lastFlushTurnCount = manifest.turnCount;
      await this.deps.store.writeManifest(manifest);
      this.flushedThisCycle = true;
      await this.onMemoryChanged();
      return true;
    } catch (error) {
      console.warn(`memory flush (${reason}) failed:`, error);
      return false;
    } finally {
      this.flushInProgress = false;
      const agentAfter = this.deps.getAgent();
      if (agentAfter) {
        this.deps.rebuildSystemPrompt();
      }
    }
  }

  resetFlushCycle(): void {
    this.flushedThisCycle = false;
  }

  async onMemoryChanged(): Promise<void> {
    if (!this.deps.config.enabled) {
      return;
    }
    try {
      const today = formatDate();
      const dailyFile = `${this.deps.store.paths.dailyDir}/${today}.md`;
      await this.deps.index.upsertFile(dailyFile);
      const memoryMd = this.deps.store.paths.memoryMdPath;
      await this.deps.index.upsertFile(memoryMd);
    } catch {
      // best effort
    }
    this.deps.rebuildSystemPrompt();
  }

  async runMaintenance(
    scope?: MaintainMemoryScope,
  ): Promise<MaintainMemoryResult> {
    const started = Date.now();
    if (scope === "reindex") {
      const count = await this.deps.index.reindex(this.deps.store);
      return {
        scope: "reindex",
        processedPeriods: [`reindexed:${count}`],
        deduped: 0,
        promoted: 0,
        durationMs: Date.now() - started,
      };
    }

    const rollupDeps: RollupDeps = {
      store: this.deps.store,
      model: this.deps.model,
      apiKey: this.deps.apiKey,
      ollamaBaseUrl: this.deps.config.ollamaBaseUrl,
      distillBinary: this.deps.config.distillBinary,
    };

    const result = await runMaintenance(rollupDeps, scope);
    await this.deps.index.reindex(this.deps.store);
    this.deps.rebuildSystemPrompt();

    return {
      scope: scope ?? "all",
      processedPeriods: result.processedPeriods,
      deduped: result.deduped,
      promoted: result.promoted,
      durationMs: Date.now() - started,
    };
  }
}

function truncateBootstrap(content: string, budget: number): string {
  if (content.length <= budget) {
    return content;
  }
  return `${content.slice(0, budget - 20)}\n\n[truncated]\n`;
}

export async function loadBootstrapSection(
  store: MemoryStore,
  budget: number,
): Promise<string> {
  const today = formatDate();
  const yesterday = yesterdayDate();
  const parts: string[] = [];
  const memoryMd = (await store.readMemoryMd()).trim();
  if (memoryMd.length > 0) {
    parts.push("## Curated long-term (MEMORY.md)\n", memoryMd);
  }
  const yesterdayContent = (await store.readDaily(yesterday)).trim();
  if (yesterdayContent.length > 0) {
    parts.push(`## Yesterday (${yesterday})\n`, yesterdayContent);
  }
  const todayContent = (await store.readDaily(today)).trim();
  if (todayContent.length > 0) {
    parts.push(`## Today (${today})\n`, todayContent);
  }
  if (parts.length === 0) {
    return "";
  }
  const content = `# Recent memory\n\n${parts.join("\n\n")}`;
  return truncateBootstrap(content, budget);
}
