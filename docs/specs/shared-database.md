# Shared database (libSQL)

Normative description of the central **libSQL** (`sqld`) database service used by operational apps in the dev-workstation stack.

**Implementation:** `infra/dev-workstation/docker-compose.yml` (`libsql` service), `@libsql/client` in consuming apps.

## Purpose

Provide a single durable SQLite-compatible database server for platform services. **agent-register** and **agent-scheduler** persist to libSQL; **agent-gateway** may migrate later.

**agent-core memory** (FTS5 index + markdown in the workspace bind mount) stays outside this service by design.

## Technology

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Server | [libSQL sqld](https://github.com/tursodatabase/libsql) (`ghcr.io/tursodatabase/libsql-server`) | SQLite-compatible wire protocol; keeps existing SQL/FTS5 patterns for future consumers |
| Client | `@libsql/client` | Official libSQL driver; supports `file:` (local) and `http://` (remote) URLs |
| Dev auth | Optional `LIBSQL_AUTH_TOKEN` | No auth in local dev-workstation by default |

Embedded `node:sqlite` (`DatabaseSync`) remains in use for agent-core memory only.

## Dev-workstation service

| Property | Value |
|----------|-------|
| Compose service | `libsql` |
| Image | `ghcr.io/tursodatabase/libsql-server:latest` (`platform: linux/amd64`) |
| Host port | `8080` |
| Data volume | `libsql-data:/var/lib/sqld` |
| Node mode | `SQLD_NODE=primary` |

## Connection URLs

| Environment | URL | Consumer |
|-------------|-----|----------|
| Docker dev-workstation | `http://libsql:8080` | agent-register, agent-scheduler |
| Local `pnpm dev` (register) | `file:./data/agent-register/register.db` (default) | agent-register |
| Local `pnpm dev` (scheduler) | `file:./data/agent-scheduler/scheduler.db` (default) | agent-scheduler |

Set `LIBSQL_URL` to override the default. Optional `LIBSQL_AUTH_TOKEN` is passed to `@libsql/client` when the server requires auth.

## Consumers

| App | Status | Schema |
|-----|--------|--------|
| agent-register | **Done** | `agent` table — see [agent-register-api](./agent-register-api.md#storage) |
| agent-scheduler | **Done** | `scheduled_event`, `scheduled_run`, `meta` — see [scheduler](./scheduler.md) |
| agent-gateway | Deferred | JSON `state.json` today |

## Operational notes

- Register startup loads persisted agents from libSQL; heartbeat monitor reconciles `AVAILABLE` / `SLEEPING` on the next poll.
- Back up the `libsql-data` Docker volume for registry and scheduler durability across host rebuilds.
- agent-scheduler can import rows from a legacy `scheduler.db` when `--legacy-data-dir` is set and the target store is empty (optional; used for one-off migration).
- Do not mount NFS/shared filesystems for the sqld data directory (SQLite file-locking constraints).
