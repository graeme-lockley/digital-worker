# Observer specification

Normative contract for **GET /api/v1/observer** — a live Server-Sent Events (SSE) stream of worker activity for operators.

**TypeScript source of truth:** `@digital-worker/agent-core-protocol` (`packages/agent-core-protocol/src/observer.ts`)

**Implementation:** `apps/agent-core/src/observer.ts`, `apps/agent-core/src/observer-hub.ts`, `apps/agent-core/src/worker-runtime.ts`

**Client:** `apps/agent-observer`

## Purpose

The observer stream exposes everything the worker does across **all ingress** (chat, notify/Telegram, future channels):

- Job lifecycle (enqueued, started, finished)
- Model thinking (`thinking_delta` when the active model emits it)
- Assistant text (`text_delta`)
- Tool execution (start/end)

It is separate from [chat-streaming](./chat-streaming.md), which is per-request and user-facing only.

## Transport

| Item | Value |
|------|-------|
| Method | `GET` |
| Path | `/api/v1/observer` |
| Response `Accept` | `text/event-stream` (constant `OBSERVER_STREAM_ACCEPT`) |
| Response body | SSE stream; each event `data: <JSON>\n\n` |
| Persistence | None in v1 (live-only) |

## Connection handshake

On connect, the server emits one `hello` event:

```json
{ "type": "hello", "agentId": "<uuid>", "sessionId": "<worker-session-uuid>" }
```

The stream stays open until the client disconnects. Multiple observers may connect concurrently.

## Event types

```typescript
type ObserverEvent =
  | ObserverHelloEvent
  | ObserverJobEnqueuedEvent
  | ObserverJobStartedEvent
  | ObserverJobFinishedEvent
  | ObserverTextDeltaEvent
  | ObserverThinkingDeltaEvent
  | ObserverToolStartEvent
  | ObserverToolEndEvent;
```

### `job_enqueued`

Emitted when a job enters the FIFO inbox (before it runs).

```json
{
  "type": "job_enqueued",
  "jobId": "<uuid>",
  "kind": "chat",
  "clientId": "tui-…",
  "promptPreview": "Hello",
  "at": "2026-06-06T10:00:00.000Z"
}
```

`kind` is `"chat"` or `"notify"`. `promptPreview` is truncated to 120 characters.

### `job_started`

Emitted when the worker loop dequeues the job and begins `agent.prompt()`.

### `job_finished`

Emitted when the job settles.

```json
{
  "type": "job_finished",
  "jobId": "<uuid>",
  "kind": "notify",
  "clientId": "agent-gateway",
  "status": "completed",
  "at": "2026-06-06T10:00:05.000Z"
}
```

`status`: `"completed"` | `"failed"` | `"cancelled"`.

### `text_delta`

Assistant output fragment (same source as chat SSE `token` events).

```json
{ "type": "text_delta", "jobId": "<uuid>", "delta": "Hello" }
```

### `thinking_delta`

Model reasoning fragment. **Only emitted when the active model supports reasoning and produces thinking tokens.** The observer does not change the agent's thinking level — it relays what the model already emits.

```json
{ "type": "thinking_delta", "jobId": "<uuid>", "delta": "Let me consider…" }
```

To see thinking in practice, run agent-core with a reasoning model, e.g.:

```bash
pnpm --filter @digital-worker/agent-core dev -- \
  --register-url http://127.0.0.1:3001 \
  --provider deepseek \
  --model deepseek-reasoner
```

The default `deepseek-chat` model does not emit thinking events.

### `tool_start` / `tool_end`

```json
{
  "type": "tool_start",
  "jobId": "<uuid>",
  "toolCallId": "<id>",
  "toolName": "read",
  "args": { "path": "MANDATE.md" }
}
```

```json
{
  "type": "tool_end",
  "jobId": "<uuid>",
  "toolCallId": "<id>",
  "toolName": "read",
  "isError": false
}
```

## Server behaviour

1. `WorkerRuntime` maintains an `ObserverHub` fan-out.
2. On `enqueue`, publish `job_enqueued`.
3. On dequeue, publish `job_started`; on settle, publish `job_finished` **before** unblocking the job promise.
4. A persistent `agent.subscribe()` maps pi-agent-core events to observer events for the active job.
5. Chat SSE (`text_delta` → `token`) is unchanged.

## Client: agent-observer

```bash
pnpm --filter @digital-worker/agent-observer dev -- \
  -r http://127.0.0.1:3001
```

Optional: `--agent-name <prefix>` to skip the interactive picker.

Panels: lifecycle log, thinking, transcript, tools. Ctrl+C to quit.

## Security

The observer stream is **operator-tier** — it exposes prompts, tool arguments, and gateway-related activity. v1 assumes localhost bind (`127.0.0.1` default). No authentication in v1.

## Not in scope (v1)

- Event persistence / replay (JSONL, SQLite)
- WebSocket transport
- Authentication
- Multi-agent aggregation

See [roadmap.md](../roadmap.md).
