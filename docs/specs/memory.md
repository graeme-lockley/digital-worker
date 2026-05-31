# Memory specification

Normative rules for Aida's episodic and long-term memory — file layout, flush lifecycle, roll-ups, search index, and maintenance.

**Operator guide:** [workspace/Aida/skills/memory-curation/SKILL.md](../../workspace/Aida/skills/memory-curation/SKILL.md)

**Implementation:** `apps/agent-core/src/memory/`, `apps/agent-core/src/tools/remember.ts`, `apps/agent-core/src/tools/memory-search.ts`

## Principles

1. **Markdown is source of truth** — human-readable, auditable, bind-mounted in Docker.
2. **SQLite FTS is derived** — `memory/index.db` is rebuildable from markdown; never authoritative.
3. **Dedupe before compact** — Distill semantic dedup runs before LLM summarization during roll-ups.
4. **Layer separation** — USER/IDENTITY for profiles; daily files for episodic logs; MEMORY.md for curated long-term facts.
5. **Cron touches completed periods only** — never today's daily file.

## Layer model

| Layer | Path | Loaded at startup | Updated by |
|-------|------|-------------------|------------|
| Mandate / Soul | `MANDATE.md`, `SOUL.md` | Every turn (immutable) | Never at runtime |
| Operator profile | `USER.md` | Every turn | `update_user` |
| Self-knowledge | `IDENTITY.md` | Every turn | `update_identity` |
| Curated long-term | `memory/MEMORY.md` | Every turn (bounded) | Roll-up promotion, maintenance |
| Episodic (recent) | `memory/daily/YYYY-MM-DD.md` | Today + yesterday | `remember`, flush |
| Weekly roll-up | `memory/weekly/YYYY-Www.md` | On demand (`memory_search`) | `maintain_memory` weekly |
| Monthly roll-up | `memory/monthly/YYYY-MM.md` | On demand | `maintain_memory` monthly |
| Archive | `memory/archive/daily/` | On demand | After weekly roll-up |

## Workspace layout

```
workspace/Aida/memory/
  MEMORY.md
  manifest.json
  index.db              # derived; gitignored
  daily/YYYY-MM-DD.md
  weekly/YYYY-Www.md
  monthly/YYYY-MM.md
  archive/daily/YYYY-MM-DD.md
```

## Daily file format

Append-only markdown with timestamped bullets under fixed sections:

```markdown
# 2026-05-31

## Facts
- [14:32] Operator prefers conventional commits with scope.

## Decisions
- [15:10] Memory: markdown is source of truth.

## Open threads
- Roll-up cron wiring.

## Failures / corrections
- [16:00] Do not use update_identity for transient task state.
```

## System prompt injection

`buildSystemPrompt` appends a bounded `# Recent memory` block:

1. `memory/MEMORY.md`
2. Yesterday's daily file
3. Today's daily file

Budget: `--memory-bootstrap-budget` (default 8000 characters). Truncation drops from the oldest section first.

## Tools

### `remember`

| Parameter | Constraint |
|-----------|------------|
| `section` | One of: Facts, Decisions, Open threads, Failures / corrections |
| `content` | 1–4000 chars; secrets redacted before write |
| `reason` | 1–500 chars |

Appends to today's daily file, upserts FTS index, rebuilds system prompt.

### `memory_search`

| Parameter | Constraint |
|-----------|------------|
| `query` | 1–500 chars |
| `limit` | 1–25 (default 10) |

Returns ranked snippets from the FTS index across all memory markdown files.

## Flush lifecycle

### Triggers

| Trigger | When | Notes |
|---------|------|-------|
| Pre-compaction | Token estimate crosses soft threshold | OpenClaw-style silent turn |
| Periodic nudge | Every N turns (default 10) | Hermes-style background learning |
| Shutdown / restart | Before `agent.abort()` | Critical — transcript is in-memory only |

### Soft threshold

```
contextWindow - reserveTokens(20000) - flushSoftThresholdTokens(4000)
```

Uses pi `estimateContextTokens` and `shouldCompact`.

### Flush behaviour

1. Append flush instructions to system prompt.
2. Run `agent.prompt` with memory-flush user message.
3. Agent calls `remember` (or replies `NO_REPLY`).
4. Update `manifest.json` (`lastFlushAt`, `lastFlushTurnCount`).
5. Rebuild system prompt.

Guarded by `--memory-flush-min-turns` (default 6) and `--memory-flush-timeout` (60s).

## Roll-up pipeline

Out-of-band via `POST /api/v1/command` → `maintain_memory`.

```
daily/*.md → [Distill dedup] → [LLM summarize] → weekly/YYYY-Www.md
  → promote durable facts → MEMORY.md
  → archive daily → archive/daily/

weekly/*.md → [Distill dedup] → [LLM summarize] → monthly/YYYY-MM.md
```

**Distill:** `distill pipeline --config /etc/distill.yaml` (Ollama embeddings via config). Heuristic dedup fallback if Distill/Ollama unavailable.

**Idempotency:** Skips periods already recorded in `manifest.json` (`lastRollupWeekly`, `lastRollupMonthly`).

**Never touches:** Today's daily file.

## `maintain_memory` command

| Field | Type | Meaning |
|-------|------|---------|
| `command` | `"maintain_memory"` | Required |
| `clientId` | string | Required |
| `scope` | `"weekly" \| "monthly" \| "reindex" \| "prune"` | Optional; default runs weekly + monthly |

### Response (`MaintainMemoryResult`)

| Field | Type |
|-------|------|
| `scope` | scope or `"all"` |
| `processedPeriods` | string[] |
| `deduped` | number |
| `promoted` | number |
| `durationMs` | number |

## SQLite FTS index

- **Library:** Node.js built-in `node:sqlite` (`DatabaseSync`) with FTS5.
- **Location:** `memory/index.db`
- **Schema:** `memory_fts(file_path, date, section, content)` virtual table.
- **Rebuild:** On startup if missing; via `maintain_memory` scope `reindex`; after roll-ups.

## CLI flags

| Flag | Default |
|------|---------|
| `--memory` / `--no-memory` | enabled |
| `--memory-flush-soft-threshold-tokens` | 4000 |
| `--memory-flush-min-turns` | 6 |
| `--memory-nudge-interval` | 10 |
| `--memory-bootstrap-budget` | 8000 |
| `--memory-context-window` | 128000 |
| `--no-memory-search` | search enabled |

## Docker / cron

The agent-core image includes:

- **Ollama** + `nomic-embed-text` (baked at build time)
- **Distill** CLI (`/usr/local/bin/distill`)
- **cron** via `/etc/cron.d/aida-memory`

Entrypoint: `agent-core-entrypoint.sh` starts Ollama, cron, then the node restart loop.

Cron schedule (UTC):

| Schedule | Scope |
|----------|-------|
| Sun 02:15 | weekly |
| 1st 03:15 | monthly |
| Every 6h | reindex |

## Secret scanning

Before any memory write, regex patterns redact API keys, tokens, bearer headers, and private keys. Redacted entries are flagged in tool responses.

## Comparison

| Feature | OpenClaw | Hermes | Aida |
|---------|----------|--------|------|
| Daily logs | `memory/YYYY-MM-DD.md` | session archive | `memory/daily/YYYY-MM-DD.md` |
| Curated long-term | `MEMORY.md` | tight char limits | `memory/MEMORY.md` |
| Pre-compaction flush | Yes | `flushOnCompact` | Yes |
| Shutdown flush | Daily reset | `flushOnShutdown` | Yes |
| Search | `memory_search` | SQLite FTS5 | `memory_search` + `node:sqlite` FTS5 |
| Roll-up cron | External | Built-in | In-image cron |

## Persistence

| Environment | Memory persistence |
|-------------|-------------------|
| Docker dev-workstation | Bind mount `./workspace/Aida` |
| Local `pnpm dev` | `./workspace/Aida` on disk |
| `index.db` | Regenerated; gitignored |
