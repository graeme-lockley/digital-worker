# Agent workspace

Operator notes for per-agent deployment folders. **Normative spec:** [docs/specs/workspace-identity.md](../docs/specs/workspace-identity.md).

Each digital worker is deployed with a flat workspace folder — the agent's world (identity, working files, and default tool sandbox):

```
workspace/
  <agentName>/
    MANDATE.md    # Immutable — purpose within the solution
    SOUL.md       # Immutable — temperament and values
    IDENTITY.md   # Mutable — self-knowledge (update_identity)
    USER.md       # Mutable — operator facts (update_user)
    memory/       # Episodic + long-term memory (remember, roll-ups)
      MEMORY.md   # Curated long-term facts
      daily/      # Append-only daily logs
      index.db    # Derived search index (gitignored)
    skills/       # Agent Skills (see skills/)
```

**Memory spec:** [docs/specs/memory.md](../docs/specs/memory.md)

## Build-time folding

Docker copies `workspace/` into the image at build time (see `infra/dev-workstation/Dockerfile.agent-core`).
At runtime, pass `--workspace-dir` pointing at the agent folder (e.g. `/app/workspace/Aida`). Builtin tools default to the same directory unless `--tools-cwd` overrides.

For dev-workstation, compose bind-mounts `./workspace/Aida` so identity updates and other workspace files persist across container restarts and rebuilds.

## MANDATE.md

Describes this actor's role in the digital-worker solution. **Do not edit at runtime.**
When adding a new agent, copy or author a MANDATE for that deployment; keep copies in sync if multiple agents share the same solution mandate.

## SOUL.md

Defines communication style, constraints, and values. **Do not edit at runtime.**

## IDENTITY.md

Seed with minimal self-description. The agent may update this file via the `update_identity` tool when it learns something durable about itself.

## USER.md

Seed with known facts about the operator. The agent must maintain this file via `update_user` when it learns durable facts about the person it works with (see Mandate).

In Docker dev, the whole workspace folder is bind-mounted for persistence (see compose).

LLM API keys for Docker dev are set in `.env` at the **project root** (see `.env.example`); that file is gitignored.
