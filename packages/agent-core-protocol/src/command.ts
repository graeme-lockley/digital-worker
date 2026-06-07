/** Operator command names accepted by POST /api/v1/command. */
export const AGENT_COMMAND = {
  STATUS: "status",
  ABANDON: "abandon",
  SHUTDOWN: "shutdown",
  RESTART: "restart",
  COMPACT: "compact",
  MAINTAIN_MEMORY: "maintain_memory",
  LIST_MODELS: "list_models",
  SET_MODEL: "set_model",
} as const;

/** Scope for maintain_memory maintenance runs. */
export type MaintainMemoryScope = "weekly" | "monthly" | "reindex" | "prune";

export type AgentCommandName =
  (typeof AGENT_COMMAND)[keyof typeof AGENT_COMMAND];

/** POST body: submit an operator command. */
export interface CommandRequest {
  /** Operator command to run. */
  command: AgentCommandName;
  /** Ephemeral client id (e.g. TUI instance). */
  clientId: string;
  /** Optional session for correlation with the worker session id. */
  sessionId?: string;
  /** Scope for maintain_memory (defaults to weekly + monthly when omitted). */
  scope?: MaintainMemoryScope;
  /**
   * Optional model id or provider/model shorthand.
   * Used by the set_model command.
   */
  model?: string;
}

export interface ActiveJobStatus {
  jobId: string;
  clientId: string;
  runningForMs: number;
}

/** How a context compaction was triggered. */
export type CompactionReason = "manual" | "threshold" | "overflow";

/** Summary of a single context compaction event. */
export interface CompactionSummary {
  timestamp: string;
  tokensBefore: number;
  tokensAfter: number;
  reason: CompactionReason | "unknown";
}

export interface ModelDescriptor {
  provider: string;
  id: string;
  /** Optional UI label (fallback: provider/id). */
  label?: string;
  /** True when this model is currently active on the worker. */
  current: boolean;
}

export interface StatusResult {
  sessionId: string;
  queueDepth: number;
  queuedCount: number;
  active: ActiveJobStatus | null;
  uptimeMs: number;
  /** Estimated tokens currently in the session context. */
  contextTokens: number;
  /** Configured context window maximum (tokens). */
  contextWindowMax: number;
  /** Most recent compactions (newest last), up to 10 entries. */
  recentCompactions: CompactionSummary[];
}

export interface AbandonResult {
  abandonedActive: boolean;
  drainedQueued: number;
}

export interface ShutdownResult {
  accepted: true;
  action: "shutdown";
}

export interface RestartResult {
  accepted: true;
  action: "restart";
}

export interface MaintainMemoryResult {
  scope: MaintainMemoryScope | "all";
  processedPeriods: string[];
  deduped: number;
  promoted: number;
  durationMs: number;
}

export interface ListModelsResult {
  models: ModelDescriptor[];
  current: ModelDescriptor;
}

export interface SetModelResult {
  model: ModelDescriptor;
}

export interface CompactResult {
  compacted: true;
  tokensBefore: number;
  tokensAfter: number;
  reason: CompactionReason;
  summary: string;
}

export type CommandResponse =
  | StatusResult
  | AbandonResult
  | ShutdownResult
  | RestartResult
  | CompactResult
  | MaintainMemoryResult
  | ListModelsResult
  | SetModelResult;
