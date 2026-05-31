# Architecture

Technology choices and design rationale for the digital-worker monorepo.

**Normative behaviour** (HTTP contracts, worker loop, identity rules) lives in [specs/](./specs/). **Runtime flows** are summarised in [system-overview.md](./system-overview.md). **Current implementation status:** [build-state.md](./build-state.md).

## Applications

| App | Path | Role |
|-----|------|------|
| agent-register | `apps/agent-register` | Registration, discovery, heartbeat polling |
| agent-core | `apps/agent-core` | LLM digital worker (HTTP + worker loop) |
| agent-tui | `apps/agent-tui` | Terminal chat client |

## Protocol packages

| Package | Path | Role |
|---------|------|------|
| agent-register-protocol | `packages/agent-register-protocol` | Register HTTP types |
| agent-core-protocol | `packages/agent-core-protocol` | Agent HTTP + chat SSE types |

Apps import these packages — do not duplicate request/response shapes in application code. Human-readable specs: [specs/agent-register-api.md](./specs/agent-register-api.md), [specs/agent-core-api.md](./specs/agent-core-api.md).

## Library decisions

### agent-register

| Concern | Choice | Rationale |
|---------|--------|-----------|
| HTTP API | Hono + @hono/node-server | Same stack as agent-core |
| CLI | Commander | Host, port, heartbeat interval/timeout |
| Registry store | In-memory | Sufficient for v1; persistence on [roadmap](./roadmap.md) |
| Heartbeat monitor | `setInterval` + `fetch` | Polls agent `POST /api/v1/heartbeat` |

### agent-tui

| Concern | Choice | Rationale |
|---------|--------|-----------|
| TUI | [Ink](https://github.com/vadimdemedes/ink) | React-in-terminal |
| Agent picker | [@clack/prompts](https://github.com/natemoo-re/clack) | Interactive select |
| Chat | SSE over fetch | [specs/chat-streaming.md](./specs/chat-streaming.md) |

### agent-core

| Concern | Choice | Version | Rationale |
|---------|--------|---------|-----------|
| HTTP API | [Hono](https://hono.dev/) | Pin in app | Small ESM-first router |
| Node adapter | @hono/node-server | Pin with Hono | Serve `fetch` handler on Node |
| CLI | Commander | Pin in app | Parse argv before startup |
| Dev | tsx | devDependency | TS without watch build |
| Production build | tsc | workspace TS | `dist/` output |
| Tests | Vitest | per member | `app.request()` in-process |
| LLM | [@earendil-works/pi-agent-core](https://github.com/earendil-works/pi) + [pi-ai](https://github.com/earendil-works/pi) | `0.75.5` | Agent loop, streaming, tools |
| Worker loop | `WorkerRuntime` | in-app | [specs/worker-runtime.md](./specs/worker-runtime.md) |
| Identity | workspace markdown | baked in image | [specs/workspace-identity.md](./specs/workspace-identity.md) |
| Memory | markdown + `node:sqlite` FTS | workspace bind mount | [specs/memory.md](./specs/memory.md) |
| Roll-up dedup | Distill CLI + Ollama | in Docker image | `nomic-embed-text` local embeddings |

**Node requirement:** agent-core needs **Node ≥ 22.19** (pi-agent-core). Docker images use `node:22-alpine`.

#### Alternatives considered

| Concern | Alternatives | Why not (for now) |
|---------|--------------|-------------------|
| HTTP API | Fastify, Express | Hono keeps surface minimal; Web Standard `Request`/`Response` |
| CLI | yargs, citty | Commander matches parse-and-serve flow |
| Dev runtime | ts-node | tsx is faster for ESM + `NodeNext` |
| Tests | Jest | Vitest + native ESM |

## Cross-cutting conventions

- Internal scope: `@digital-worker/*` with `workspace:*` deps — [project-structure.md](./project-structure.md)
- Versioned API prefix: `/api/v1`
- Configuration: CLI flags at startup; Docker loads project-root `.env` for secrets — [deployment/dev-workstation.md](./deployment/dev-workstation.md)
- Secrets: never commit `.env`; commit `.env.example` only

## Testing

| Rule | Detail |
|------|--------|
| Runner | Vitest (`vitest run`) per member |
| Files | `src/**/*.test.ts` co-located |
| Root | `pnpm test` → packages then apps |
| HTTP tests | Hono `createApp().request()` — no TCP listener |

agent-core registers the pi-ai **faux provider** in `vitest.setup.ts` for LLM-free tests.

## High-level flows

Detailed diagrams: [system-overview.md](./system-overview.md).

**agent-register:** argv → HTTP server + heartbeat monitor → register / deregister / list.

**agent-core:** argv → load workspace → create pi Agent → start WorkerRuntime → HTTP server → register → chat enqueues jobs → shutdown deregisters.

## When to update this document

- Adopting or replacing a major dependency
- Changing default stack (e.g. new database for register)
- New app or protocol package

When **behaviour** changes, update [specs/](./specs/) and [build-state.md](./build-state.md) first.
