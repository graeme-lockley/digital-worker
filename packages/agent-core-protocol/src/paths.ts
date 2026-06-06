/** HTTP paths implemented by every agent (e.g. agent-core). */
export const AGENT_CORE_PATHS = {
  heartbeat: "/api/v1/heartbeat",
  chat: "/api/v1/chat",
  command: "/api/v1/command",
  notify: "/api/v1/notify",
  deliver: "/api/v1/deliver",
  observer: "/api/v1/observer",
  health: "/health",
} as const;

/** Accept header for SSE chat responses. */
export const CHAT_STREAM_ACCEPT = "text/event-stream";
