# Agent-core HTTP API specification

Normative HTTP surface for every **digital worker agent** process (today: `apps/agent-core`).

**TypeScript source of truth:** `@digital-worker/agent-core-protocol`

## Base URL

Each agent registers an `endpoint.url` (e.g. `http://127.0.0.1:3000`). All paths below are relative to that base.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness (not versioned) |
| `GET` | `/api/v1` | Service metadata |
| `POST` | `/api/v1/heartbeat` | Register poll target |
| `POST` | `/api/v1/chat` | Streaming chat — see [chat-streaming](./chat-streaming.md) |
| `POST` | `/api/v1/command` | Operator commands — see below |

Constants: `AGENT_CORE_PATHS` in `packages/agent-core-protocol/src/paths.ts`.

## GET /health

**Response 200**

```json
{ "status": "ok" }
```

## GET /api/v1

**Response 200**

```json
{
  "service": "agent-core",
  "agentId": "<uuid>",
  "sessionId": "<uuid>",
  "queueDepth": 0,
  "version": "0.0.0"
}
```

| Field | Meaning |
|-------|---------|
| `agentId` | Stable agent id (CLI `--agent-id` or generated) |
| `sessionId` | Stable worker session id for chat SSE |
| `queueDepth` | Inbox size + active job (0 when idle) |

## POST /api/v1/heartbeat

Called by **agent-register** heartbeat monitor.

**Request body** (optional JSON):

```typescript
interface HeartbeatRequest {
  polledAt: string; // ISO timestamp from register
}
```

**Response 200**

```typescript
interface HeartbeatResponse {
  agentId: string;
  status: "ok";
  timestamp: string; // ISO timestamp from agent
}
```

Empty or invalid JSON body is tolerated (handler treats as empty object).

## POST /api/v1/chat

See [chat-streaming.md](./chat-streaming.md).

## POST /api/v1/command

Operator control plane. Handled **out-of-band** — does not enqueue on the chat inbox. See [worker-runtime.md](./worker-runtime.md#operator-commands).

**Request body**

```typescript
interface CommandRequest {
  command: "status" | "abandon" | "shutdown" | "restart" | "maintain_memory";
  clientId: string;
  sessionId?: string;
  scope?: "weekly" | "monthly" | "reindex" | "prune"; // maintain_memory only
}
```

**Responses 200**

`status`:

```typescript
interface StatusResult {
  sessionId: string;
  queueDepth: number;
  queuedCount: number;
  active: { jobId: string; clientId: string; runningForMs: number } | null;
  uptimeMs: number;
}
```

`abandon`:

```typescript
interface AbandonResult {
  abandonedActive: boolean;
  drainedQueued: number;
}
```

`shutdown`:

```typescript
interface ShutdownResult {
  accepted: true;
  action: "shutdown";
}
```

`restart`:

```typescript
interface RestartResult {
  accepted: true;
  action: "restart";
}
```

After responding, restart deregisters and exits with code **75** (`RESTART_EXIT_CODE`). The Docker dev-workstation image wraps agent-core in `restart-loop.sh`, which relaunches the process on that exit code. Local `pnpm dev` without the loop spawns a detached replacement process instead.

`maintain_memory`:

```typescript
interface MaintainMemoryResult {
  scope: "weekly" | "monthly" | "reindex" | "prune" | "all";
  processedPeriods: string[];
  deduped: number;
  promoted: number;
  durationMs: number;
}
```

Runs memory roll-up or reindex out-of-band. Invoked by in-container cron or operators. See [memory.md](./memory.md).

**Validation errors**

| Condition | HTTP | Error code |
|-----------|------|------------|
| Invalid JSON | 400 | `INVALID_REQUEST` |
| Missing/blank `clientId` | 400 | `INVALID_REQUEST` |
| Unknown `command` | 400 | `UNKNOWN_COMMAND` |
| `sessionId` mismatch | 409 | `SESSION_MISMATCH` |

Constants: `AGENT_COMMAND` in `packages/agent-core-protocol/src/command.ts`.

## Error responses (JSON)

Non-SSE errors use:

```typescript
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

**Error codes** (`AGENT_CORE_ERROR_CODES`):

| Code | Typical HTTP |
|------|----------------|
| `INVALID_REQUEST` | 400 |
| `SESSION_MISMATCH` | 409 |
| `UNKNOWN_COMMAND` | 400 |
| `NOT_FOUND` | 404 |
| `INTERNAL_ERROR` | 500 (also SSE `error` events) |

## Not implemented

| Planned | Protocol types |
|---------|------------------|
| Inter-agent message delivery | `DeliverMessageRequest`, `DeliverMessageResponse` in `message.ts` |

No route is mounted yet — see [roadmap.md](../roadmap.md).

## CLI configuration

Required and common flags for agent-core:

| Flag | Required | Purpose |
|------|----------|---------|
| `--register-url` | yes | agent-register base URL |
| `--provider` | yes | pi-ai provider id |
| `--model` | yes | Model id or `provider/model` |
| `--agent-name` | no | Workspace folder name (default `Aida`) |
| `--workspace-dir` | no | Override workspace path (default `./workspace/<agent-name>`) |
| `--tools-cwd` | no | Builtin tool working directory (default: workspace directory) |
| `--api-key` | no | LLM key override |
| `--host`, `--port` | no | Bind address (default `127.0.0.1:3000`) |
| `--agent-id` | no | Registration id (generated if omitted) |
| `--endpoint-url` | no | Advertised URL when bind address is not routable |
| `--skills` | no | Comma-separated register metadata |
| `--purpose` | no | Override MANDATE-derived purpose |
| `--memory` / `--no-memory` | no | Episodic memory (default on) |
| `--memory-flush-soft-threshold-tokens` | no | Pre-compaction flush margin (default 4000) |
| `--memory-flush-min-turns` | no | Minimum turns before flush (default 6) |
| `--memory-nudge-interval` | no | Periodic flush interval in turns (default 10) |
| `--memory-bootstrap-budget` | no | Recent memory chars in prompt (default 8000) |
| `--no-memory-search` | no | Disable memory_search tool |

Full local run: [deployment/local-development.md](../deployment/local-development.md).

## Lifecycle

See [worker-runtime.md](./worker-runtime.md) for startup/shutdown order and registration timing.
