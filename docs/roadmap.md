# Roadmap

Ordered list of planned work not yet implemented. Items here are **not** current behaviour unless [build-state.md](./build-state.md) says otherwise. When a feature ships, remove it from this list and update build-state.

For what is already built see [build-state.md](./build-state.md) and git history.

### Inter-agent message bus

Workers should communicate through a core runtime message bus rather than direct HTTP calls between agents. The `DeliverMessage` request and response types already exist in `@digital-worker/agent-core-protocol`, but no HTTP routes are mounted on agent-core yet. Implementing delivery endpoints enables multi-agent workflows — one worker enqueueing work or passing context to another — which is central to the platform story in [system-overview.md](./system-overview.md).

### Local `.env` loading for agent-core

The Docker dev-workstation stack loads project-root `.env` automatically, but local `pnpm dev` for agent-core still requires manually exporting API keys or passing `--api-key`. Loading `.env` at startup (via Node `--env-file` or explicit dotenv) would align local development with Docker and remove a recurring friction point documented in [local-development.md](./deployment/local-development.md).

### Skills from markdown

Registration currently accepts `--skills` as metadata strings only — they appear in the agent list but are not loaded into the LLM context. Loading skill content from markdown files under `workspace/<agentName>/skills/` (similar to Cursor skills) would let operators extend agent capability without code changes. Skill bodies would be composed into the system prompt or made available on demand.

### Register persistence

`AgentRegistryStore` in agent-register is in-memory. Restarting the register service loses the agent list until workers re-register. Durable storage (file, SQLite, or external DB) is needed for production deployments where the registry must survive process restarts and provide a stable discovery surface.

### IDENTITY persistence in Docker dev

`IDENTITY.md` is mutable at runtime via the `update_identity` tool, but Docker dev rebuilds bake workspace files into the image and reset self-knowledge. An optional Compose volume for `workspace/<agentName>/IDENTITY.md` would preserve accumulated identity across image rebuilds during development. The pattern is documented in [workspace-identity.md](./specs/workspace-identity.md) but not wired in compose today.

### Priority / judgment dequeue

The worker runtime today dequeues chat jobs in strict FIFO order. Replacing or augmenting that with prioritized message selection would let urgent or high-value work run ahead of routine chat. The extension point is likely an optional `priority` field on queued jobs; the dequeue logic in `WorkerRuntime` would choose the next job by priority rather than arrival time alone.

### Additional worker types

New apps under `apps/` can follow the same agent-core-protocol and worker-runtime patterns as agent-core. Each worker type would register with agent-register, expose heartbeat and chat (and eventually DeliverMessage), and load its own workspace identity. This extends the platform from a single demo worker to a fleet of specialized digital workers.

### OAuth LLM providers

Today LLM access relies on static API keys (e.g. `DEEPSEEK_API_KEY`). Supporting OAuth flows for Copilot, Codex, and other pi-ai providers would broaden deployment options and align with providers that do not issue long-lived API keys.

### Observability

Production operation needs structured logging, queue depth metrics, and LLM usage or cost reporting exposed on `/api/v1` (or a dedicated metrics endpoint). This would give operators visibility into worker health, backlog, and spend without reading process logs ad hoc.
