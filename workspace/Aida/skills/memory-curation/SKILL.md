---
name: memory-curation
description: Curate Aida's episodic and long-term memory using remember, memory_search, and the memory/ file layout. Use when persisting facts across sessions, responding to memory flush prompts, deciding between remember vs update_user/update_identity, or recalling past context.
---

# Memory curation

This skill explains how Aida's memory system works and when to use each tool.

## Memory layers

| Layer | Location | Tool | When |
|-------|----------|------|------|
| Operator profile | `USER.md` | `update_user` | Durable facts about Graeme (preferences, role, style) |
| Self-knowledge | `IDENTITY.md` | `update_identity` | Durable facts about yourself (environment, capabilities) |
| Episodic log | `memory/daily/YYYY-MM-DD.md` | `remember` | What happened: facts, decisions, open threads, corrections |
| Curated long-term | `memory/MEMORY.md` | promoted by maintenance | Cross-cutting conventions and standing decisions |
| Archive search | all `memory/**` | `memory_search` | Recall something from an older session or topic |

## The `remember` tool

Append to today's daily file with a section:

- **Facts** — learned information worth recalling
- **Decisions** — choices made and why
- **Open threads** — unfinished work to resume later
- **Failures / corrections** — what didn't work; operator corrections

Do **not** use `remember` for operator profile (`update_user`) or self-knowledge (`update_identity`).

## Startup context

At session start, `# Recent memory` in your system prompt includes:

- `memory/MEMORY.md` (curated)
- today's and yesterday's daily files

Older context is retrieved via `memory_search`, not injected wholesale.

## Memory flush (automatic)

Before context compaction or on shutdown, you may receive a silent flush prompt:

1. Review the conversation for durable material.
2. Call `remember` for episodic items.
3. Call `update_user` / `update_identity` only when the fact belongs there.
4. If nothing to store, reply exactly: **NO_REPLY**

Flush turns are internal — the operator does not see them unless you reply with normal text.

## Periodic nudge

Every N turns (default 10), a flush may trigger even before compaction. Same rules as above.

## `memory_search`

When the operator references past work ("we fixed this before", "what did we decide about X?"):

```
memory_search({ query: "relevant keywords", limit: 10 })
```

Results include file path, date, section, and snippet.

## Maintenance (cron)

Inside Docker, cron POSTs `maintain_memory` to agent-core:

- **weekly** — dedupe dailies (Distill + Ollama), summarize, promote to MEMORY.md, archive raw dailies
- **monthly** — roll up weeklies into monthlies
- **reindex** — rebuild SQLite FTS index from markdown

Maintenance never touches today's daily file.

## Security

Secrets are redacted before write. Do not store API keys, tokens, or private keys in memory files.

## Further reading

- Normative spec: `docs/specs/memory.md` (in the monorepo)
- OpenClaw-inspired daily logs + Hermes-inspired search and flush patterns
