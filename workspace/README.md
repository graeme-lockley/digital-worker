# Agent workspace

Illustrative workspace for learning the digital-worker platform. **Normative spec:** [docs/specs/workspace-identity.md](../docs/specs/workspace-identity.md).

## Layout

```
workspace/
  Fred/
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

The public repo's `pnpm docker:dev` runs a minimal stack with `workspace/Fred` bind-mounted.

## USER.md vs wiki `people/`

Shared operator facts belong in the wiki (`people/<name>`). Agent-specific notes belong in each agent's `USER.md`.
