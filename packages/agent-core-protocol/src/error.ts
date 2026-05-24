/** Standard error body returned by any agent HTTP API. */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export const AGENT_CORE_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SESSION_MISMATCH: "SESSION_MISMATCH",
} as const;

export type AgentCoreErrorCode =
  (typeof AGENT_CORE_ERROR_CODES)[keyof typeof AGENT_CORE_ERROR_CODES];
