# Agent workspace

Operator notes for per-agent deployment folders. **Normative spec:** [docs/specs/workspace-identity.md](../docs/specs/workspace-identity.md).

Each digital worker is deployed with a flat workspace folder — the agent's world (identity, working files, and default tool sandbox):

```
workspace/
  <agentName>/
    MANDATE.md    # Immutable — purpose, scope, duties, routing
    SOUL.md       # Immutable — temperament, tone, values, ethics
    IDENTITY.md   # Mutable — factual self-knowledge (update_identity)
    USER.md       # Mutable — operator facts (update_user)
    memory/       # Episodic + long-term memory (remember, roll-ups)
      MEMORY.md   # Curated long-term facts
      daily/      # Append-only daily logs
      index.db    # Derived search index (gitignored)
    skills/       # Agent Skills (see skills/)
```

**Memory spec:** [docs/specs/memory.md](../docs/specs/memory.md)

## Identity files — purpose and boundaries

Four files compose the agent system prompt. Each has a single job. **Do not duplicate the same rule or fact across files** — cross-reference instead (`see Soul → …`, `see USER.md`).

| File | Mutability | Question it answers | Belongs here | Does **not** belong here |
|------|------------|-------------------|--------------|--------------------------|
| **MANDATE.md** | Immutable | *What must this actor do, within what scope, via which channels?* | Duties and maintenance obligations (skills, memory, USER.md). In-scope / out-of-scope. Peer routing and handoff rules. Channel **protocol** (when to reply, when to use `send_message` vs `send_to_agent`, what a handoff must include). Operational promises (e.g. schedule follow-ups). | Tone, warmth, or phrasing. Character biography. Deployment paths, tool inventories. Operator preferences. Ethical temperament. |
| **SOUL.md** | Immutable | *How should this actor communicate and decide, regardless of task?* | Temperament and namesake **character** (not deployment facts). Communication **style** by audience (human vs peer). Values and ethical constraints. Inspiration the agent should embody. | Scope lists, routing tables, tool names, channel mechanics, platform layout. Operator-specific preferences (→ USER.md). Factual peer registry (→ IDENTITY.md). |
| **IDENTITY.md** | Mutable (`update_identity`) | *What does this actor factually know about itself and its environment?* | Name. Namesake **biography** (dates, career facts). Deployment facts (service name, paths, ports, model). Peer **registry** (who exists, where they run, what they specialise in — not routing policy). Platform and tool inventory. Memory/skills **layout** as reference facts. Durable lessons learned about self. | Duties, scope, or routing rules (→ MANDATE). Tone or values (→ SOUL). Operator facts (→ USER.md). |
| **USER.md** | Mutable (`update_user`) | *What does this actor know about its operator?* | Name, role, preferences, communication habits, interests, working style. | Agent duties, agent tone, deployment facts, peer routing. |

### Separation principles

1. **Mandate = what & when.** Soul = how. Identity = facts about self. User = facts about operator.
2. **Protocol vs style.** Mandate states channel mechanics and handoff **requirements** (e.g. "include query and return path"). Soul states **phrasing** (e.g. compact operational English, no pleasantries with peers).
3. **Routing vs registry.** Mandate says *who handles what* and *when to hand off*. Identity lists peers as *facts* (container, path, expertise, bot name) without repeating policy.
4. **One home per fact.** If Graeme prefers result-only sports notifications, that lives in USER.md — not Soul. If Riaan defers general tasks to Aida, that lives in MANDATE — not Identity.
5. **Cross-reference, don't copy.** Use `see Mandate → …`, `see Soul → …`, `see USER.md`, `see Identity → Related agents` instead of restating content.

### Authoring checklist

When adding or editing workspace identity content, ask:

- Is this a **duty, scope limit, or routing rule**? → MANDATE
- Is this **how to sound or what to value**? → SOUL
- Is this a **fact about me, my deployment, or my peers**? → IDENTITY
- Is this a **fact about my operator**? → USER

If the same sentence could appear in two files, pick one and link from the other.

## Build-time folding

Docker copies `workspace/` into the image at build time (see `infra/dev-workstation/Dockerfile.agent-core`).
At runtime, pass `--workspace-dir` pointing at the agent folder (e.g. `/app/workspace/Aida`). Builtin tools default to the same directory unless `--tools-cwd` overrides.

For dev-workstation, compose bind-mounts `./workspace/Aida` and `./workspace/Riaan` so identity updates and other workspace files persist across container restarts and rebuilds.

## USER.md

Seed with known facts about the operator. The agent must maintain this file via `update_user` when it learns durable facts about the person it works with (see Mandate).

In Docker dev, the whole workspace folder is bind-mounted for persistence (see compose).

LLM API keys for Docker dev are set in `.env` at the **project root** (see `.env.example`); that file is gitignored.
