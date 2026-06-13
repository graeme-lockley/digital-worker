# Workspace identity specification

Normative rules for **MANDATE.md**, **SOUL.md**, **IDENTITY.md**, and **USER.md** — how they are loaded, composed, and updated.

**Operator guide:** [workspace/README.md](../../workspace/README.md)

**Implementation:** `apps/agent-core/src/workspace/`

## Layout

Flat folder per agent deployment:

```
workspace/
  <agentName>/
    MANDATE.md
    SOUL.md
    IDENTITY.md
    USER.md
    skills/              # Agent Skills (optional); see skills.md
      <skill-name>/
        SKILL.md
    memory/              # Episodic + long-term memory; see memory.md
      MEMORY.md
      daily/
      weekly/
      monthly/
      archive/
      index.db           # derived FTS index (gitignored)
```

Episodic memory is specified in [memory.md](./memory.md). Do not store session logs in USER or IDENTITY.

CLI flag `--agent-name` selects `<agentName>`. Override path with `--workspace-dir` or set `WORKSPACE_ROOT` for a base directory outside this repo.

The workspace is the agent's **frame of reference**: identity files and the default working directory for builtin tools (`read`, `write`, `bash`, `ls`). Override tool scope with `--tools-cwd` if needed.

**Two-repo layout:**

| Repo | Workspace |
|------|-----------|
| `digital-worker` | `workspace/_template/` — illustrative only |
| `digital-worker-workspace` (private) | Real agents (`agents/Aida/`, `agents/Riaan/`, …), memory, skills |

Docker template stack bind-mounts `./workspace/_template`. The real stack in `digital-worker-workspace` bind-mounts agent folders and `./wiki` from that repo.

## File semantics

| File | Mutability | Content |
|------|------------|---------|
| **MANDATE.md** | **Immutable** at runtime | This actor’s purpose within the digital-worker solution |
| **SOUL.md** | **Immutable** at runtime | Temperament, communication style, values, constraints |
| **IDENTITY.md** | **Mutable** | Durable self-knowledge the agent accumulates |
| **USER.md** | **Mutable** | Agent-specific operator context (how this agent works with the operator). Canonical shared profile → wiki `people/graeme` |

Runtime code must **never** write to MANDATE or SOUL. Only `IdentityStore` may write IDENTITY; only `UserStore` may write USER (via `update_user`).

## System prompt composition

At startup (and after identity updates), the pi Agent `systemPrompt` is built as:

```
You are a digital worker agent. Follow Mandate and Soul at all times.
You may update durable self-knowledge via update_identity and operator facts via update_user; do not contradict Mandate or Soul.

# Mandate (immutable)
{contents of MANDATE.md}

# Soul (immutable)
{contents of SOUL.md}

# Identity (self-knowledge — you may update via update_identity)
{contents of IDENTITY.md}

# User (operator — maintain via update_user per Mandate)
{contents of USER.md}

# Recent memory
{MEMORY.md + today + yesterday daily files, bounded}

{optional <available_skills> block from workspace/skills — see skills.md}
```

See [skills](./skills.md) for skill discovery, `refresh_skills`, and progressive disclosure.

## Registration metadata

| Register field | Source |
|----------------|--------|
| `name` | `--name` or `--agent-name` |
| `purpose` | First substantive paragraph of MANDATE.md, unless `--purpose` override |
| `skills` | `--skills` CLI (register metadata; distinct from workspace `skills/` — see [skills](./skills.md)) |

## update_identity tool

The agent may call **`update_identity`** to replace `IDENTITY.md` when it learns something **durable** about itself (not transient task state).

| Parameter | Constraint |
|-----------|------------|
| `content` | Full new IDENTITY.md body; 1–32 000 chars |
| `reason` | Why the update is worth persisting; 1–500 chars |

On success:

1. File is written to disk.
2. In-memory identity snapshot updates.
3. `agent.state.systemPrompt` rebuilds with new identity section.

## update_user tool

The agent **must** maintain **`USER.md`** per Mandate for **agent-specific** operator context via **`update_user`**. Canonical facts any agent needs (role, interests, shared preferences) belong in wiki **`people/graeme`** (`wiki_write`), not duplicated in `USER.md`.

| Parameter | Constraint |
|-----------|------------|
| `content` | Full new USER.md body; 1–32 000 chars |
| `reason` | Why the update is worth persisting; 1–500 chars |

On success:

1. File is written to disk.
2. In-memory user snapshot updates.
3. `agent.state.systemPrompt` rebuilds with new user section.

## Persistence

| Environment | Workspace persistence |
|-------------|----------------------|
| Local file workspace | Survives restarts |
| Docker template stack | Bind mount `./workspace/_template` |
| Docker real stack (`digital-worker-workspace`) | Bind mount `./agents/<agentName>` and `./wiki` |
| Docker without volume | Writable container layer until image recreate |

## Startup validation

Startup **must fail** if any of the four files is missing under the configured workspace directory.

## Seeded example

This repository includes `workspace/_template/` for the template Docker stack and tests. Real agent workspaces live in the private **`digital-worker-workspace`** repo.
