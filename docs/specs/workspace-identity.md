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
```

CLI flag `--agent-name` selects `<agentName>`. Override path with `--workspace-dir`.

The workspace is the agent's **frame of reference**: identity files and the default working directory for builtin tools (`read`, `write`, `bash`, `ls`). Override tool scope with `--tools-cwd` if needed.

Docker copies `workspace/` into the image at build time; dev-workstation bind-mounts `./workspace/<agentName>` (e.g. `./workspace/Aida` → `/app/workspace/Aida`) so runtime writes persist on the host.

## File semantics

| File | Mutability | Content |
|------|------------|---------|
| **MANDATE.md** | **Immutable** at runtime | This actor’s purpose within the digital-worker solution |
| **SOUL.md** | **Immutable** at runtime | Temperament, communication style, values, constraints |
| **IDENTITY.md** | **Mutable** | Durable self-knowledge the agent accumulates |
| **USER.md** | **Mutable** | Durable facts about the operator the agent accumulates |

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
```

## Registration metadata

| Register field | Source |
|----------------|--------|
| `name` | `--name` or `--agent-name` |
| `purpose` | First substantive paragraph of MANDATE.md, unless `--purpose` override |
| `skills` | `--skills` CLI (metadata only today) |

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

The agent **must** maintain **`USER.md`** per Mandate: call **`update_user`** when it learns durable facts about the operator (preferences, role, context, working style) — not transient task state.

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
| Docker dev-workstation | Bind mount `./workspace/<agentName>` (wired in compose for Aida) |
| Docker without volume | Writable container layer until image recreate |

## Startup validation

Startup **must fail** if any of the four files is missing under the configured workspace directory.

## Seeded example

The repository includes `workspace/Aida/` with starter content for the default dev-workstation agent.
