# Agent workspace (template)

Illustrative workspace for learning the digital-worker platform. **Normative spec:** [docs/specs/workspace-identity.md](../docs/specs/workspace-identity.md).

## This repo vs your workspace

| Location | Purpose |
|----------|---------|
| `digital-worker/workspace/_template/` | **This folder** — generic example for docs, tests, and the template Docker stack |
| `digital-worker-workspace/` (sibling private repo) | Real agents under `agents/` (Aida, Riaan), memory, skills, wiki, secrets, and runnable infra |

To run your own agents, create or clone `digital-worker-workspace` alongside this repo. See [docs/deployment/dev-workstation.md](../docs/deployment/dev-workstation.md).

## Layout

```
workspace/
  _template/
    MANDATE.md    # Immutable — purpose, scope
    SOUL.md       # Immutable — temperament and style
    IDENTITY.md   # Mutable — self-knowledge (update_identity)
    USER.md       # Mutable — agent-specific operator context (update_user)
    memory/       # Episodic + long-term memory
    skills/       # Agent Skills (optional)
```

**Memory spec:** [docs/specs/memory.md](../docs/specs/memory.md)

## Identity files — purpose and boundaries

Four files compose the agent system prompt. Each has a single job. **Do not duplicate the same rule or fact across files** — cross-reference instead.

| File | Mutability | Question it answers |
|------|------------|---------------------|
| **MANDATE.md** | Immutable | *What must this actor do, within what scope?* |
| **SOUL.md** | Immutable | *How should this actor communicate and decide?* |
| **IDENTITY.md** | Mutable | *What does this actor know about itself and its environment?* |
| **USER.md** | Mutable | *How does this actor work with its operator?* |

Full authoring rules: [docs/specs/workspace-identity.md](../docs/specs/workspace-identity.md).

## Template Docker stack

The public repo's `pnpm docker:dev` runs a minimal stack with `workspace/_template` bind-mounted. It is for learning the platform — not for production agents.

## USER.md vs wiki `people/`

Shared operator facts belong in the wiki (`people/<name>`). Agent-specific notes belong in each agent's `USER.md`. See `skills/shared-knowledge` in a real deployment for the split.
