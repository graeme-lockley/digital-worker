# Roadmap

Ordered list of planned work not yet implemented. Items here are **not** current behaviour unless [build-state.md](./build-state.md) says otherwise. When a feature ships, remove it from this list and update build-state.

For what is already built see [build-state.md](./build-state.md) and git history.

### Additional channels (email)

Extend **agent-gateway** with an email `ChannelAdapter` (IMAP IDLE inbound, SMTP outbound). The gateway HTTP API and worker tools (`check_messages`, `send_message`) are already channel-agnostic. See [specs/gateway.md](./specs/gateway.md).

### Local `.env` loading for agent-core

The Docker dev-workstation stack loads project-root `.env` automatically, but local `pnpm dev` for agent-core still requires manually exporting API keys or passing `--api-key`. Loading `.env` at startup (via Node `--env-file` or explicit dotenv) would align local development with Docker and remove a recurring friction point documented in [local-development.md](./deployment/local-development.md).

### Register persistence

`AgentRegistryStore` in agent-register is in-memory. Restarting the register service loses the agent list until workers re-register. Durable storage (file, SQLite, or external DB) is needed for production deployments where the registry must survive process restarts and provide a stable discovery surface.

### Priority / judgment dequeue

The worker runtime today dequeues chat jobs in strict FIFO order. Replacing or augmenting that with prioritized message selection would let urgent or high-value work run ahead of routine chat. The extension point is likely an optional `priority` field on queued jobs; the dequeue logic in `WorkerRuntime` would choose the next job by priority rather than arrival time alone.

### Additional worker types

New apps under `apps/` can follow the same agent-core-protocol and worker-runtime patterns as agent-core. Each worker type would register with agent-register, expose heartbeat, chat, and inter-agent deliver, and load its own workspace identity. This extends the platform from a single demo worker to a fleet of specialized digital workers.

### OAuth LLM providers

Today LLM access relies on static API keys (e.g. `DEEPSEEK_API_KEY`). Supporting OAuth flows for Copilot, Codex, and other pi-ai providers would broaden deployment options and align with providers that do not issue long-lived API keys.

### Observability (remaining)

Live operator observability via `GET /api/v1/observer` and **agent-observer** is implemented — see [specs/observer.md](./specs/observer.md). Remaining work: structured logging, queue depth metrics, LLM usage/cost reporting, and event persistence/replay.
