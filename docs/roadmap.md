# Roadmap

Planned work not yet implemented. Items listed here are **not** current behaviour unless [build-state.md](./build-state.md) says otherwise.

## Near term

### Command queue with preemption

Dedicated handling for operator commands (`/status`, `/abandon`, `/shutdown`) on a separate queue that preempts normal chat messages. Spec stub: extend [worker-runtime.md](./specs/worker-runtime.md) when designed.

### Inter-agent message bus

`DeliverMessage` types exist in `@digital-worker/agent-core-protocol` but no HTTP routes are mounted. Workers should communicate via a core runtime message bus, not direct calls — see [system-overview.md](./system-overview.md).

### Local `.env` loading for agent-core

Docker loads project-root `.env` automatically; `pnpm dev` for agent-core still requires exporting keys or `--api-key`. Consider Node `--env-file` or explicit dotenv at startup.

## Medium term

### Priority / judgment dequeue

Replace strict FIFO with prioritized message selection (not strict arrival order). Extension point: optional `priority` on queued jobs.

### Skills from markdown

Load skill content from files (similar to Cursor skills) instead of register metadata strings only.

### Register persistence

Replace in-memory `AgentRegistryStore` with durable storage for production deployments.

### IDENTITY persistence in Docker dev

Optional compose volume for `workspace/<agentName>/IDENTITY.md` so rebuilds do not reset self-knowledge.

## Longer term

### Additional worker types

New apps under `apps/` following the same agent-core-protocol and worker-runtime patterns.

### OAuth LLM providers

Support Copilot, Codex, and other pi-ai OAuth flows beyond static API keys.

### Observability

Structured logging, queue depth metrics, LLM usage/cost reporting on `/api/v1`.

## Completed (reference)

See git history and [build-state.md](./build-state.md) for shipped work including pi-agent-core integration, workspace identity, SSE chat, and dev-workstation Docker stack.
