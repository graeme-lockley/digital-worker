/** Operator command names accepted by POST /api/v1/command. */
export const AGENT_COMMAND = {
  STATUS: "status",
  ABANDON: "abandon",
  SHUTDOWN: "shutdown",
  RESTART: "restart",
  MAINTAIN_MEMORY: "maintain_memory",
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
}

export interface ActiveJobStatus {
  jobId: string;
  clientId: string;
  runningForMs: number;
}

export interface StatusResult {
  sessionId: string;
  queueDepth: number;
  queuedCount: number;
  active: ActiveJobStatus | null;
  uptimeMs: number;
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

export type CommandResponse =
  | StatusResult
  | AbandonResult
  | ShutdownResult
  | RestartResult
  | MaintainMemoryResult;
