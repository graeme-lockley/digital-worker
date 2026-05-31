# Documentation

This folder is the **authoritative description** of the digital-worker system: what it is, how it behaves, what is built, and what is planned.

The root [README.md](../README.md) is a quick start (install, run, endpoints). Everything deeper lives here.

## Philosophy

**Specs before stories.** Behaviour that clients and operators depend on belongs in [specs/](./specs/). When code and prose disagree, fix the code or update the spec — never leave them silently out of sync.

**One source of truth per concern.**

| Concern | Canonical location |
|---------|-------------------|
| Request/response TypeScript types | `packages/*-protocol` |
| Normative behaviour (HTTP, runtime, identity) | `docs/specs/` |
| Library and pattern choices | [architecture.md](./architecture.md) |
| Monorepo layout and commands | [project-structure.md](./project-structure.md) |
| What is implemented *right now* | [build-state.md](./build-state.md) |
| Planned work (ordered backlog) | [roadmap.md](./roadmap.md) |
| Deployment operator notes | [deployment/](./deployment/) |
| Per-agent workspace files at deploy time | [workspace/README.md](../workspace/README.md) |

**Living build state.** [build-state.md](./build-state.md) is updated when features land or slip. It answers “what does this repo do today?” without reading the whole tree.

**Deferred is documented.** Items not built yet appear in [roadmap.md](./roadmap.md) and in the “Not started” / “Deferred” rows of [build-state.md](./build-state.md), not as implied behaviour in specs.

## Purpose

These documents exist so that:

- **Contributors** know where to look before changing an app or protocol package.
- **Operators** can run dev-workstation or local stacks from [deployment/](./deployment/) without spelunking Dockerfiles.
- **Future agents and humans** share the same contract for chat, registration, and worker execution.
- **Reviewers** can check a change against the relevant spec.

## Structure

```
docs/
  README.md              ← you are here
  system-overview.md     ← end-to-end narrative and diagrams
  build-state.md         ← current implementation status
  architecture.md        ← technology choices (why Hono, pi-agent-core, …)
  project-structure.md   ← pnpm monorepo conventions
  roadmap.md             ← ordered planned work with descriptions

  specs/                 ← normative behaviour
    worker-runtime.md
    workspace-identity.md
    skills.md
    agent-core-api.md
    agent-register-api.md
    chat-streaming.md

  deployment/
    dev-workstation.md   ← Docker Compose stack
    local-development.md ← pnpm dev without containers
```

## Reading order

| If you want to… | Start with |
|-----------------|------------|
| Understand the whole system | [system-overview.md](./system-overview.md) |
| See what is built today | [build-state.md](./build-state.md) |
| Change agent HTTP or SSE behaviour | [specs/agent-core-api.md](./specs/agent-core-api.md), [specs/chat-streaming.md](./specs/chat-streaming.md) |
| Change registration or discovery | [specs/agent-register-api.md](./specs/agent-register-api.md) |
| Change worker queue or LLM loop | [specs/worker-runtime.md](./specs/worker-runtime.md) |
| Change MANDATE / SOUL / IDENTITY | [specs/workspace-identity.md](./specs/workspace-identity.md) |
| Change workspace skills or refresh | [specs/skills.md](./specs/skills.md) |
| Run locally or in Docker | [deployment/local-development.md](./deployment/local-development.md), [deployment/dev-workstation.md](./deployment/dev-workstation.md) |
| Add an app or package | [project-structure.md](./project-structure.md) |
| Pick or replace a library | [architecture.md](./architecture.md) |
| Plan the next milestone | [roadmap.md](./roadmap.md) |

## Maintaining these docs

When you merge a behaviour change:

1. Update the relevant file under `specs/` if the contract changed.
2. Update [build-state.md](./build-state.md) status rows.
3. Update [architecture.md](./architecture.md) only if library choices changed.
4. Move items from [roadmap.md](./roadmap.md) to build-state when done.

When you add a new spec, link it from this README and from [system-overview.md](./system-overview.md).
