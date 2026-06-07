/** HTTP paths implemented by agent-scheduler. */
export const SCHEDULER_PATHS = {
  health: "/health",
  events: "/api/v1/events",
  runs: "/api/v1/runs",
  agents: "/api/v1/agents",
} as const;

export const SCHEDULER_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  INVALID_CRON: "INVALID_CRON",
} as const;

export type SchedulerErrorCode =
  (typeof SCHEDULER_ERROR_CODES)[keyof typeof SCHEDULER_ERROR_CODES];

export interface ApiError {
  code: SchedulerErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export type ScheduledEventStatus =
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type ScheduledRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "interrupted";

/** Policy when an event is overdue after scheduler restart. */
export type MissedFirePolicy = "fire-once" | "skip";

/** When a previous run is still in progress. v1 default: skip. */
export type OverlapPolicy = "skip";

export type DeliveryHint =
  | "internal"
  | "agent-likely"
  | "scheduler-fallback"
  | "not-detected"
  | "n/a";

/** Optional fallback delivery target when the agent does not send_message. */
export interface DeliverTo {
  channel: string;
  threadId?: string;
}

export interface ScheduledEvent {
  id: string;
  agentId: string;
  model: string;
  prompt: string;
  /** When true, no delivery suffix is appended and fallback delivery is skipped. */
  internalOnly?: boolean;
  deliverTo?: DeliverTo;
  /** Standard 5-field cron when recurring. */
  cron?: string;
  /** Next fire time (epoch ms). Always set in storage. */
  fireAt: number;
  timezone: string;
  missedPolicy: MissedFirePolicy;
  status: ScheduledEventStatus;
  leaseUntil?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduledRun {
  id: string;
  eventId: string;
  scheduledFor: number;
  startedAt: number;
  finishedAt?: number;
  status: ScheduledRunStatus;
  model: string;
  transcript: string;
  error?: string;
  attempt: number;
  /** Scheduler sent transcript via gateway outbound after a successful run. */
  deliverFallback?: boolean;
  /** Computed when listing or fetching runs (not persisted). */
  deliveryHint?: DeliveryHint;
}

/** Run row joined with parent event fields for list views. */
export interface ScheduledRunSummary extends ScheduledRun {
  agentId: string;
  prompt: string;
  cron?: string;
}

export interface CreateEventRequest {
  agentId: string;
  model: string;
  prompt: string;
  cron?: string;
  /** ISO-8601 one-shot fire time. */
  fireAt?: string;
  timezone?: string;
  missedPolicy?: MissedFirePolicy;
  createdBy: string;
  internalOnly?: boolean;
  deliverTo?: DeliverTo;
}

export interface CreateEventResponse {
  event: ScheduledEvent;
}

export interface ListEventsResponse {
  events: ScheduledEvent[];
}

export interface EventDetailResponse {
  event: ScheduledEvent;
  recentRuns: ScheduledRun[];
}

export interface ListRunsResponse {
  runs: ScheduledRunSummary[];
  total: number;
}

export interface RunDetailResponse {
  run: ScheduledRun;
  event: ScheduledEvent;
}

export interface ListSchedulerAgentsResponse {
  agents: Array<{ agentId: string; name?: string }>;
}

export function isScheduledEventStatus(value: string): value is ScheduledEventStatus {
  return (
    value === "active" ||
    value === "paused" ||
    value === "completed" ||
    value === "cancelled"
  );
}

export function isScheduledRunStatus(value: string): value is ScheduledRunStatus {
  return (
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "interrupted"
  );
}

export function isMissedFirePolicy(value: string): value is MissedFirePolicy {
  return value === "fire-once" || value === "skip";
}
