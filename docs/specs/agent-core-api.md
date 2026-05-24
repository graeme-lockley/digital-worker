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
| `--agent-name` | no | Workspace folder name (default `agent-core`) |
| `--workspace-dir` | no | Override workspace path |
| `--api-key` | no | LLM key override |
| `--host`, `--port` | no | Bind address (default `127.0.0.1:3000`) |
| `--agent-id` | no | Registration id (generated if omitted) |
| `--endpoint-url` | no | Advertised URL when bind address is not routable |
| `--skills` | no | Comma-separated register metadata |
| `--purpose` | no | Override MANDATE-derived purpose |

Full local run: [deployment/local-development.md](../deployment/local-development.md).

## Lifecycle

See [worker-runtime.md](./worker-runtime.md) for startup/shutdown order and registration timing.
