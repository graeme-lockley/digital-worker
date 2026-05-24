# Architecture

High-level design notes and **library decisions** for the digital-worker monorepo. Update this document when adopting or replacing a major dependency.

## Applications

| App | Path | Role |
|-----|------|------|
| agent-register | `apps/agent-register` | Registration and discovery service; polls agent heartbeats |
| agent-core | `apps/agent-core` | Runnable agent; registers with agent-register on startup |
| agent-tui | `apps/agent-tui` | Terminal chat UI; lists agents from register, streams chat over SSE |

## Protocol packages

| Package | Path | Role |
|---------|------|------|
| agent-register-protocol | `packages/agent-register-protocol` | Contract for the register HTTP API (register, deregister, list, errors) |
| agent-core-protocol | `packages/agent-core-protocol` | Contract for every agent HTTP API (heartbeat, inter-agent messages, errors) |

Consumers (agent-core, agent-register, future agents) depend on these packages — never duplicate request/response shapes in app code.

## Library decisions

### agent-register

| Concern | Choice | Rationale |
|---------|--------|-----------|
| HTTP API | Hono + @hono/node-server | Same stack as agent-core for consistency |
| CLI | Commander | Host, port, heartbeat interval/timeout |
| Registry store | In-memory (`AgentRegistryStore`) | Sufficient for first version; persistence can be added later |
| Heartbeat monitor | `setInterval` + `fetch` | Polls each agent’s `POST /api/v1/heartbeat`; marks `SLEEPING` on failure |

### agent-tui

| Concern | Choice | Rationale |
|---------|--------|-----------|
| TUI runtime | [Ink](https://github.com/vadimdemedes/ink) | React-in-terminal; chat layout with scrollback + input line |
| Agent picker | [@clack/prompts](https://github.com/natemoo-re/clack) | Minimal interactive select when `--agent-name` is omitted |
| Chat transport | SSE (`POST /api/v1/chat`, `Accept: text/event-stream`) | Token streaming without WebSocket; aligns with `agent-core-protocol` |

### agent-core

| Concern | Choice | Version policy | Rationale |
|---------|--------|----------------|------------|
| HTTP API | [Hono](https://hono.dev/) | Pin in app `package.json` | Small, TypeScript-first router with excellent ESM support; fits `NodeNext` and a minimal API surface without adopting a full application framework. |
| Node HTTP adapter | [@hono/node-server](https://github.com/honojs/node-server) | Pin with Hono | Official adapter to serve Hono’s `fetch` handler on Node.js. |
| CLI | [Commander](https://github.com/tj/commander.js) | Pin in app `package.json` | De facto standard for Node CLIs; parses `process.argv` before server startup (host, port, subcommands later). |
| Dev execution | [tsx](https://github.com/privatenumber/tsx) | App devDependency | Runs TypeScript directly during `pnpm dev` without a separate watch build step. |
| Production build | `tsc` (workspace TypeScript) | Root devDependency | Emits `dist/` for `node dist/index.js`; consistent with shared `tsconfig.base.json`. |
| Unit / integration tests | [Vitest](https://vitest.dev/) | Per-member devDependency | Native ESM and TypeScript support; `app.request()` works with Hono without binding a port. Same runner for all apps and packages. |
| LLM runtime | [@earendil-works/pi-agent-core](https://github.com/earendil-works/pi) + [@earendil-works/pi-ai](https://github.com/earendil-works/pi) | Pin `0.75.5` | Single `Agent` per process; tool calling; streaming via `text_delta` events. Requires **Node >= 22.19**. |
| Worker loop | In-process `WorkerRuntime` | — | FIFO inbox; one `agent.prompt()` at a time; HTTP chat enqueues jobs. |
| Workspace identity | `workspace/<agentName>/` | Baked into image at build | `MANDATE.md` + `SOUL.md` immutable; `IDENTITY.md` mutable via `update_identity` tool. |

#### Alternatives considered

| Concern | Alternatives | Why not (for now) |
|---------|--------------|-------------------|
| HTTP API | Fastify, Express | Fastify is strong for large APIs; Express is ubiquitous but less aligned with Web Standard `Request`/`Response`. Hono keeps the first app small and easy to extend. Revisit if we need JSON Schema plugins, heavy plugins, or mature OpenAPI generation out of the box. |
| CLI | yargs, citty | yargs is heavier; citty is ergonomic but less familiar to most contributors. Commander matches the “parse argv → start server” flow with minimal ceremony. |
| Dev runtime | ts-node, node --watch on compiled JS | tsx is faster and simpler for ESM + `NodeNext` in a monorepo app. |
| Tests | Node test runner, Jest | Vitest aligns with Vite/ESM tooling and needs minimal config for `NodeNext` packages; Jest is heavier to configure for pure-Node libraries. |

### Cross-cutting conventions

- Internal packages use the `@digital-worker/*` scope and `workspace:*` links (see [project-structure.md](./project-structure.md)).
- API routes are versioned under `/api/v1` unless a breaking change requires a new prefix.
- Configuration from the CLI overrides defaults; environment variables may be added later for deployment (document here when introduced).

### Testing (monorepo)

| Rule | Detail |
|------|--------|
| Runner | Vitest in each member that has tests (`vitest run` via `pnpm test`) |
| Test files | `src/**/*.test.ts` co-located with source |
| Root `pnpm test` | Runs `test:packages` then `test:apps` (packages before apps) |
| Member `pnpm test` | Runs only that app or package (e.g. from `apps/agent-core`) |

Hono handlers are tested with `createApp().request(path)` so tests do not start an HTTP listener.

## agent-register runtime flow

```
process.argv
    │
    ▼
Commander ──► bind HTTP + start HeartbeatMonitor
    │
    ├── POST /api/v1/agents/register
    ├── POST /api/v1/agents/deregister
    ├── GET  /api/v1/agents
    └── periodic POST {agent}/api/v1/heartbeat  ──► AVAILABLE | SLEEPING
```

## agent-core runtime flow

```
process.argv
    │
    ▼
Commander ──► ServerOptions (register URL, LLM provider/model, workspace dir)
    │
    ▼
loadWorkspace ──► MANDATE.md + SOUL.md + IDENTITY.md
    │
    ▼
createLlmAgent (pi-agent-core) ──► WorkerRuntime.start()  (FIFO outer loop)
    │
    ▼
Start Hono server ──► on listening, POST register to agent-register
    │
    ├── POST /api/v1/chat ──► enqueue ChatJob ──► loop ──► agent.prompt()
    ├── GET  /health, /api/v1
    └── POST /api/v1/heartbeat
    │
    ▼
SIGINT / SIGTERM ──► runtime.stop() ──► POST deregister ──► exit
```

The register URL is required. Registration runs after the HTTP server is listening so heartbeat polls succeed immediately. Registration `purpose` defaults to the first substantive paragraph of `MANDATE.md`.

### Single worker semantics

Each agent-core process is one digital worker:

- **One inbox** — chat HTTP requests enqueue `ChatJob`s; the outer loop processes them FIFO (priority dequeue deferred).
- **One pi `Agent`** — conversation history in `agent.state.messages`; multi-turn chat is sequential prompts on the same agent.
- **One stable `sessionId`** — assigned at startup; SSE events use this id. Clients may send `sessionId` back; mismatches return `409 SESSION_MISMATCH`.

### Workspace identity

Per-agent folder layout (see [`workspace/README.md`](../workspace/README.md)):

| File | Mutability | Role |
|------|------------|------|
| `MANDATE.md` | Immutable at runtime | Purpose within the digital-worker solution |
| `SOUL.md` | Immutable at runtime | Temperament, style, values |
| `IDENTITY.md` | Mutable | Self-knowledge; updated via `update_identity` tool |

Files are composed into the pi system prompt at startup. Only `identity-store` may write `IDENTITY.md`.

CLI: `--agent-name` selects `workspace/<agentName>/`; `--workspace-dir` overrides the path. Docker copies `workspace/` into the image and passes `--workspace-dir /app/workspace/<agentName>`.

### LLM configuration

| CLI flag | Purpose |
|----------|---------|
| `--provider` | pi provider id (e.g. `deepseek`, `anthropic`, `openai`) |
| `--model` | Model id or `provider/model` |
| `--api-key` | Optional override; else provider env var (e.g. `DEEPSEEK_API_KEY`) |

### Chat API (agent-core-protocol)

| Item | Detail |
|------|--------|
| Path | `POST /api/v1/chat` |
| Request | `ChatPromptRequest` (`clientId`, `prompt`, optional `sessionId`) |
| Response | SSE stream of `ChatStreamEvent`: `token`, `done`, `error` |
| Behaviour | Enqueues work; streams LLM `text_delta` tokens from pi-agent-core |

**agent-tui** sends a random `clientId` per run, resolves agents via register (`--agent-name` unique prefix or interactive list), and posts prompts to the agent’s `endpoint.url`.

## Local infrastructure

| Path | Role |
|------|------|
| `infra/dev-workstation/` | Docker Compose stack **`dev-workstation`**: `agent-register` + one `agent-core` |

From the repository root (requires a running container runtime — this project uses **Colima** via Homebrew, not Docker Desktop):

```bash
colima start           # if Colima is not already running
pnpm docker:dev        # build and start
pnpm docker:dev:down   # stop and remove containers
```

Scripts use the standalone **`docker-compose`** CLI (from Homebrew). The Homebrew `docker` package does not provide `docker compose …`.

Inside Compose, `agent-core` uses `--register-url http://agent-register:3001`, `--endpoint-url http://agent-core:3000`, `--workspace-dir /app/workspace/agent-core`, and DeepSeek defaults (`--provider deepseek --model deepseek-v4-flash`). Place `DEEPSEEK_API_KEY` in `.env` at the **project root** (see `.env.example`); `pnpm docker:dev` loads it via `--env-file .env --project-directory .` and passes it into the `agent-core` container.
