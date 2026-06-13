# Agent wiki

Shared knowledge service for digital workers. Markdown pages on a durable volume are the source of truth; a derived `node:sqlite` FTS5 index powers search. Agents read and write via HTTP tools; operators browse and edit via a web UI.

## Service

- **App:** `apps/agent-wiki`
- **Protocol:** `@digital-worker/agent-wiki-protocol`
- **Default port:** `3004` (API + static UI at `/`)
- **Content:** `--data-dir` / `WIKI_DATA_DIR` (default `./data/agent-wiki`); pages under `pages/**/*.md`
- **Index:** `index.db` co-located in the data directory (derived; rebuildable)

## Principles

1. **Markdown is source of truth** — human-readable, auditable.
2. **SQLite FTS is derived** — `index.db` rebuilds from markdown; never authoritative.
3. **Layer separation** — private episodic memory stays per-agent; wiki holds cross-agent durable facts.
4. **Provenance** — every write records `updated_by` (agent name or `operator`).

## Layer model

| Layer | Location | Tool |
|-------|----------|------|
| Private episodic | `memory/daily/` per agent | `remember` |
| Private curated | `memory/MEMORY.md` per agent | maintenance roll-up |
| Shared operator profile | wiki `people/graeme` | `wiki_read` / `wiki_write` |
| Agent-specific operator context | `USER.md` per agent | `update_user` |
| Self-knowledge | `IDENTITY.md` | `update_identity` |
| **Shared durable** | other agent-wiki pages | `wiki_write` |

## Page layout

```
{data-dir}/
  pages/
    Home.md
    Usage.md
    people/
      graeme.md
      _template.md
  index.db              # derived; not in git
```

- **Root page:** `Home` — landing page and navigation hub.
- **Slug = path without `.md`:** `Home`, `Usage`, `people/graeme`.
- **Sidebar tree:** the operator UI nests pages by slug path (`people/graeme` under `people`). Prefer small, focused pages; split large topics into child slugs.
- **Wiki links:** `[target-slug|Display text]` or `[[target-slug|Display text]]` (and `[[slug]]` without a label). Rendered as in-wiki navigation in the operator UI.
- **Front matter** (required on agent/operator writes): `title`, `updated_by`, `updated_at`, `revision`.
- **`people/`** — one page per person agents interact with.

## Deployment

| Stack | Wiki data |
|-------|-----------|
| Docker template stack | Named volume + seed from `apps/agent-wiki/seed/pages/` |
| Docker real stack (`digital-worker-workspace`) | Bind mount `./wiki` → `/app/data/wiki` (edit markdown on disk) |

Seed content ships in `apps/agent-wiki/seed/pages/` for the template stack. On first start when `pages/` is empty, the service copies seed pages into the data directory.

## Local development

```bash
pnpm install
pnpm build
pnpm --filter @digital-worker/agent-wiki dev
```

Browse `http://127.0.0.1:3004/` for the operator UI (browse, search, edit).

## Agent tools (agent-core)

When `--wiki-url` (or `WIKI_URL`) is set and `agentName` is configured:

| Tool | Action |
|------|--------|
| `wiki_list` | List all pages (slug, title, revision) |
| `wiki_read` | Load a page by slug |
| `wiki_search` | Full-text search with snippets |
| `wiki_write` | Create or update a page (`ifRevision` for optimistic concurrency) |
| `wiki_delete` | Delete a page by slug (`ifRevision` optional) |

`wiki_write` sets `updated_by` to the agent's `agentName`. Pass `ifRevision` when updating to avoid overwriting concurrent edits. `wiki_delete` sets `deleted_by` to the agent's `agentName`.

Agents should not delete `Home` or `Usage` without explicit operator intent. The operator UI disables delete on `Home`.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| GET | `/api/v1/pages` | List page summaries |
| GET | `/api/v1/pages/:slug` | Get page (`slug` may contain `/`, e.g. `people/graeme`) |
| PUT | `/api/v1/pages/:slug` | Create or update page |
| DELETE | `/api/v1/pages/:slug` | Delete page |
| GET | `/api/v1/search?q=&limit=` | Full-text search |
| POST | `/api/v1/reindex` | Rebuild index from all markdown files |

### Put page body

```json
{
  "title": "Optional title",
  "body": "Markdown body without front matter",
  "updatedBy": "Aida",
  "ifRevision": 1
}
```

- Returns `409 CONFLICT` when `ifRevision` does not match the current revision.
- Reindexes the page after a successful write.

### Delete page body

```json
{
  "deletedBy": "Aida",
  "ifRevision": 1
}
```

- Returns `404 NOT_FOUND` when the page does not exist.
- Returns `409 CONFLICT` when `ifRevision` does not match.
- Removes the markdown file and purges index rows for the slug.

## Operator UI

Static UI at `/` provides:

- Page list and rendered markdown view
- Full-text search
- Edit, create, and delete pages (`updated_by` / `deleted_by: operator`; delete disabled for `Home`)

## Security (v1)

No auth on the wiki API or UI — intended for local/dev-workstation trust boundaries only.

## Related specs

- [memory](./memory.md) — per-agent private memory
- [workspace-identity](./workspace-identity.md) — MANDATE / IDENTITY boundaries
- [dev-workstation](../deployment/dev-workstation.md) — Compose wiring
