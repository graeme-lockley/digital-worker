/** Standard error body returned by the agent register HTTP API. */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export const AGENT_REGISTER_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
  AGENT_ALREADY_REGISTERED: "AGENT_ALREADY_REGISTERED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type AgentRegisterErrorCode =
  (typeof AGENT_REGISTER_ERROR_CODES)[keyof typeof AGENT_REGISTER_ERROR_CODES];
