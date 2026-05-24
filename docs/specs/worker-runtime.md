# Worker runtime specification

Normative behaviour for the **agent-core** execution loop: one process, one inbox, one LLM agent.

**Implementation:** `apps/agent-core/src/worker-runtime.ts`, `apps/agent-core/src/llm-agent.ts`

## Principles

1. **Single execution loop** — Each digital worker OS process runs one outer loop that processes work serially.
2. **Single pi Agent** — Conversation memory lives in one `@earendil-works/pi-agent-core` `Agent` instance for the process lifetime.
3. **HTTP is ingress, not execution** — Chat handlers enqueue work; they must not call `agent.prompt()` directly.
4. **Determinism** — At most one active `agent.prompt()` per process at any time.

## Components

| Component | Responsibility |
|-----------|----------------|
| `WorkerRuntime` | FIFO inbox, outer loop, job lifecycle |
| `Agent` (pi-agent-core) | LLM calls, transcript, tools |
| Chat HTTP handler | Validate request, enqueue `ChatJob`, stream SSE from job callbacks |

## ChatJob

Each accepted chat request becomes a job:

| Field | Meaning |
|-------|---------|
| `id` | Unique job id |
| `messageId` | Returned on SSE `done` |
| `clientId` | Client-supplied correlation id |
| `prompt` | User message text |
| `sessionId` | Stable worker session id (see [chat-streaming](./chat-streaming.md)) |
| `emit` | Async callback writing SSE events |
| `signal` | Aborts when HTTP client disconnects |

## Loop algorithm (FIFO)

```
start loop (background)
while not stopped:
  wait until inbox non-empty (skip cancelled queued jobs)
  job = inbox.shift()
  subscribe to agent message_update → forward text_delta as SSE token
  try:
    await agent.prompt(job.prompt)
    emit done
  catch:
    emit error
  finally:
    unsubscribe
  resolve job promise (unblocks HTTP handler)
```

## Concurrency rules

| Scenario | Required behaviour |
|----------|-------------------|
| Second chat while first is running | Enqueue; HTTP connection blocks until job is dequeued and completes |
| Client disconnect during **queued** job | Reject job before dequeue; do not call LLM |
| Client disconnect during **active** job | Call `agent.abort()`; emit error if appropriate |
| Shutdown (`SIGINT` / `SIGTERM`) | Stop loop, abort agent, drain registration |

Priority dequeue and command preemption are **deferred** — see [roadmap.md](../roadmap.md).

## Multi-turn conversation

Sequential prompts on the same worker append to `agent.state.messages`. There is **no** per-client session map on the server — one transcript per process.

Clients may send `sessionId` on each request for correlation; the server validates it against the worker’s stable session id (see [chat-streaming](./chat-streaming.md)).

## LLM integration

- Model and provider come from CLI (`--provider`, `--model`) or env API keys.
- Streaming maps pi `message_update` events with `assistantMessageEvent.type === "text_delta"` to SSE `token` events.
- Tools: currently `update_identity` only (see [workspace-identity](./workspace-identity.md)).

## Startup order

1. Parse CLI and validate workspace + LLM config.
2. Load workspace identity files.
3. Create pi `Agent`.
4. Start `WorkerRuntime` loop.
5. Start Hono HTTP server.
6. Register with agent-register **after** listen (so heartbeats succeed immediately).

## Shutdown order

1. Stop worker loop (`runtime.stop()`).
2. Deregister from agent-register.
3. Exit process.

## Testing expectations

Tests use the pi-ai **faux provider** (see `apps/agent-core/vitest.setup.ts`) to assert FIFO ordering and SSE token content without live API keys.
