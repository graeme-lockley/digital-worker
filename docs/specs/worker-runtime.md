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
| `WorkerRuntime` | FIFO inbox, outer loop, job lifecycle, operator commands |
| `Agent` (pi-agent-core) | LLM calls, transcript, tools |
| Chat HTTP handler | Validate request, enqueue `ChatJob`, stream SSE from job callbacks |
| Command HTTP handler | Validate request, run operator commands out-of-band — see [agent-core-api](./agent-core-api.md#post-apiv1command) |

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
| Operator **`/abandon`** while busy | Abort active job via `agent.abort()`; reject and drain all queued chat jobs with SSE `error` |
| Operator **`/status`** while busy | Return runtime snapshot immediately (out-of-band; does not enter inbox) |
| Operator **`/shutdown`** | Ack JSON response, then run graceful shutdown (stop loop, deregister, exit) |
| Operator **`/restart`** | Ack JSON response, then deregister, spawn a replacement process with the same argv, and exit |
| Shutdown (`SIGINT` / `SIGTERM` / `/shutdown`) | Stop loop, abort agent, drain registration |

Priority dequeue is **deferred** — see [roadmap.md](../roadmap.md).

## Operator commands

Operator commands are served on **`POST /api/v1/command`**, not through the chat inbox. They act on `WorkerRuntime` / `Agent` state directly and therefore preempt queued or active chat work without waiting behind the FIFO inbox.

| Command | Behaviour |
|---------|-----------|
| `status` | Synchronous read: `sessionId`, `queueDepth`, `queuedCount`, active job metadata, `uptimeMs` |
| `abandon` | Abort the active LLM run (if any) and reject every queued chat job; each affected chat stream receives one SSE `error` |
| `shutdown` | Return `{ accepted: true, action: "shutdown" }`, then run the same shutdown path as `SIGINT` / `SIGTERM` |
| `restart` | Return `{ accepted: true, action: "restart" }`, then deregister and exit with code **75** so a parent restart loop can relaunch the process (Docker entrypoint). Outside a restart loop, spawn a detached replacement process instead. |

Clients such as **agent-tui** may expose these as slash commands (`/status`, `/abandon`, `/restart`, `/shutdown`) that POST to the command endpoint. Slash syntax is client sugar only — commands never enter the pi transcript.

Implementation: `apps/agent-core/src/command.ts`, `WorkerRuntime.getStatus()`, `WorkerRuntime.abandon()`.

## Multi-turn conversation

Sequential prompts on the same worker append to `agent.state.messages`. There is **no** per-client session map on the server — one transcript per process.

Clients may send `sessionId` on each request for correlation; the server validates it against the worker’s stable session id (see [chat-streaming](./chat-streaming.md)).

## LLM integration

- Model and provider come from CLI (`--provider`, `--model`) or env API keys.
- Streaming maps pi `message_update` events with `assistantMessageEvent.type === "text_delta"` to SSE `token` events.
- Tools: pi builtins `read`, `write`, `bash`, `ls` (from `@earendil-works/pi-coding-agent`, scoped to `--tools-cwd`, defaulting to the workspace directory), `update_identity`, `update_user`, and `refresh_skills` (see [workspace-identity](./workspace-identity.md) and [skills](./skills.md)), and optionally `agent_browser` from [pi-agent-browser-native](https://www.npmjs.com/package/pi-agent-browser-native) (see [web-browsing](./web-browsing.md)). Pass `--no-browser` to omit the browser tool.
- Workspace **Agent Skills** under `skills/` are scanned at startup via `SkillRegistry` and listed in the system prompt; full `SKILL.md` bodies are loaded on demand with `read`. Call `refresh_skills` after skill changes.
- Agent construction uses `createAgentSession()` with a `DefaultResourceLoader` that sets `systemPromptOverride` to the workspace MANDATE/SOUL/IDENTITY/USER prompt plus the skills index, and loads the browser extension via `additionalExtensionPaths` when enabled.

## Startup order

1. Parse CLI and validate workspace + LLM config.
2. Load workspace identity files.
3. Create pi `Agent` via `createAgentSession()` (loads extensions through `DefaultResourceLoader`).
4. Start `WorkerRuntime` loop.
5. Start Hono HTTP server.
6. Register with agent-register **after** listen (so heartbeats succeed immediately).

## Shutdown order

1. Stop worker loop (`runtime.stop()`).
2. Deregister from agent-register.
3. Exit process.

## Testing expectations

Tests use the pi-ai **faux provider** (see `apps/agent-core/vitest.setup.ts`) to assert FIFO ordering and SSE token content without live API keys.
