# Chat streaming specification

Normative contract for **POST /api/v1/chat** and Server-Sent Events (SSE) between clients (e.g. agent-tui) and agent-core.

**TypeScript source of truth:** `@digital-worker/agent-core-protocol` (`packages/agent-core-protocol/src/chat.ts`)

**Implementation:** `apps/agent-core/src/chat.ts`

## Transport

| Item | Value |
|------|-------|
| Method | `POST` |
| Path | `/api/v1/chat` |
| Request `Content-Type` | `application/json` |
| Response `Accept` | `text/event-stream` (constant `CHAT_STREAM_ACCEPT`) |
| Response body | SSE stream; each event `data: <JSON>\n\n` |

## Request body

```typescript
interface ChatPromptRequest {
  clientId: string;   // required, non-empty — e.g. TUI instance id
  prompt: string;     // required, non-empty
  sessionId?: string; // optional — worker session correlation
}
```

### Validation errors (HTTP 400)

| Condition | Error code | Message |
|-----------|------------|---------|
| Invalid JSON | `INVALID_REQUEST` | `invalid JSON body` |
| Missing/blank `clientId` or `prompt` | `INVALID_REQUEST` | `clientId and prompt are required` |

### Session mismatch (HTTP 409)

If the client sends `sessionId` and it **does not equal** the worker’s stable session id (assigned at agent-core startup):

| Error code | Message |
|------------|---------|
| `SESSION_MISMATCH` | `sessionId does not match this worker` |

Omit `sessionId` on the first request; learn it from the first SSE event.

## SSE event types

```typescript
type ChatStreamEvent = ChatTokenEvent | ChatDoneEvent | ChatErrorEvent;
```

### `token`

Streamed LLM output fragment.

```json
{ "type": "token", "sessionId": "<worker-session-uuid>", "token": "Hello" }
```

- `token` is a **string fragment** (may be one character or a chunk depending on the provider stream).
- `sessionId` is the **stable worker session id** for this process — not a server-side partition key.

### `done`

Successful completion of the job.

```json
{ "type": "done", "sessionId": "<worker-session-uuid>", "messageId": "<uuid>" }
```

### `error`

Failure during processing.

```json
{ "type": "error", "code": "INTERNAL_ERROR", "message": "..." }
```

Note: `error` events do not include `sessionId` in the type definition.

## Client behaviour (agent-tui)

1. Generate a random `clientId` per TUI run.
2. List agents from register; resolve agent base URL (rewrite Docker hostnames to `127.0.0.1` when register is local).
3. POST chat with `Accept: text/event-stream`.
4. On first response, store `sessionId` from events; send on subsequent turns.
5. Append `token` events to the UI until `done` or `error`.

## Server behaviour (agent-core)

1. Validate body and session id.
2. Enqueue job on [WorkerRuntime](./worker-runtime.md) — **do not** block the loop on HTTP thread except awaiting job completion.
3. Map pi-agent-core `text_delta` → `token` events.
4. Emit `done` after successful `agent.prompt()`.
5. Emit `error` on failure.

## Multi-turn semantics

- **One transcript per worker process** — all prompts share the same pi Agent message history.
- **One stable `sessionId` per worker** — identifies the worker session for client correlation, not separate server-side conversations.

## Not in scope (yet)

- WebSocket transport
- Tool call events on the chat SSE stream (tools run inside the worker loop only)
- DeliverMessage / inter-agent chat on this endpoint

See [roadmap.md](../roadmap.md).
