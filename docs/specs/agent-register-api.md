# Agent-register HTTP API specification

Normative HTTP surface for **agent-register** (`apps/agent-register`): registration, discovery, and heartbeat monitoring.

**TypeScript source of truth:** `@digital-worker/agent-register-protocol`

## Base URL

Default dev-workstation: `http://127.0.0.1:3001`

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `POST` | `/api/v1/agents/register` | Register an agent |
| `POST` | `/api/v1/agents/deregister` | Remove an agent |
| `GET` | `/api/v1/agents` | List registered agents |

Constants: `AGENT_REGISTER_PATHS` in `packages/agent-register-protocol/src/paths.ts`.

## GET /health

**Response 200**

```json
{ "status": "ok" }
```

## POST /api/v1/agents/register

**Request body**

```typescript
interface RegisterAgentRequest {
  agentId: string;
  name: string;
  purpose: string;
  skills: string[];
  endpoint: { url: string };
}
```

**Response 200**

```typescript
interface RegisterAgentResponse {
  agentId: string;
  status: AgentStatus; // "AVAILABLE" | "SLEEPING"
  registeredAt: string; // ISO timestamp
}
```

Registration may occur before the first successful heartbeat; status becomes `AVAILABLE` when polls succeed.

## POST /api/v1/agents/deregister

**Request body**

```typescript
interface DeregisterAgentRequest {
  agentId: string;
}
```

**Response 200**

```typescript
interface DeregisterAgentResponse {
  agentId: string;
  deregisteredAt: string;
}
```

## GET /api/v1/agents

**Response 200**

```typescript
interface ListAgentsResponse {
  agents: RegisteredAgent[];
}

interface RegisteredAgent {
  agentId: string;
  name: string;
  purpose: string;
  skills: string[];
  endpoint: { url: string };
  status: "AVAILABLE" | "SLEEPING";
  registeredAt: string;
  lastHeartbeatAt: string | null;
}
```

Clients (agent-tui) filter by `--agent-name` prefix or interactive select.

## Agent status

| Status | Meaning |
|--------|---------|
| `AVAILABLE` | Last heartbeat poll to agent succeeded |
| `SLEEPING` | Heartbeat poll failed or agent unreachable |

Constants: `AGENT_STATUS` in `packages/agent-register-protocol/src/agent.ts`.

## Heartbeat monitor

Background task in agent-register:

1. On interval (CLI `--heartbeat-interval`, default 15s), for each registered agent:
2. **POST** `{endpoint.url}/api/v1/heartbeat` with `{ polledAt: ISO }`.
3. Update `lastHeartbeatAt` and status on success/failure.
4. Timeout: CLI `--heartbeat-timeout` (default 5s).

Spec for agent side: [agent-core-api.md](./agent-core-api.md#post-apiv1heartbeat).

## Error responses

Same envelope as agent-core:

```typescript
interface ApiErrorResponse {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
```

**Error codes** (`AGENT_REGISTER_ERROR_CODES`): see `packages/agent-register-protocol/src/error.ts`.

## Storage

**Current:** in-memory only (`AgentRegistryStore`). Process restart clears registry.

**Planned:** persistence — [roadmap.md](../roadmap.md).

## CLI configuration

| Flag | Default | Purpose |
|------|---------|---------|
| `--host` | `127.0.0.1` | Bind host |
| `--port` | `3001` | HTTP port |
| `--heartbeat-interval` | `15000` | Poll interval (ms) |
| `--heartbeat-timeout` | `5000` | Poll timeout (ms) |

## Deployment

Docker: [deployment/dev-workstation.md](../deployment/dev-workstation.md)

Local: [deployment/local-development.md](../deployment/local-development.md)
