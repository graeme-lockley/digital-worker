# Dev workstation (Docker Compose)

Two deployment modes:

| Mode | Where to run | Purpose |
|------|--------------|---------|
| **Template stack** | `digital-worker` repo (`pnpm docker:dev`) | Illustrative `_template` agent + register + wiki seed |
| **Real stack** | `digital-worker-workspace` repo (`./infra/dev-workstation/up.sh`) | Your agents (Aida, Riaan), wiki, secrets, Telegram |

Platform Dockerfiles and entrypoint scripts live in **`digital-worker/infra/dev-workstation/`**. The workspace repo builds from that source via `DIGITAL_WORKER_ROOT`.

## Prerequisites

- [Colima](https://github.com/abiosoft/colima) (this project does not use Docker Desktop)
- Homebrew: `colima`, `docker`, `docker-compose`
- Node is only required on the host for `pnpm install` in `digital-worker`; images use Node 22

```bash
colima start
colima status
docker info
```

---

## Real stack (digital-worker-workspace)

Clone or create **`digital-worker-workspace`** as a sibling of this repo:

```
Projects/
  digital-worker/           # platform source (this repo)
  digital-worker-workspace/ # agents, wiki, secrets, compose
```

### Secrets

In **`digital-worker-workspace`**:

```bash
cp .env.example .env
# Edit DEEPSEEK_API_KEY, TELEGRAM_* tokens, TELEGRAM_ALLOWED_CHAT_IDS
```

### Start and stop

```bash
cd ../digital-worker-workspace
./infra/dev-workstation/up.sh      # build from ../digital-worker + up
./infra/dev-workstation/down.sh
```

Or: `npm run docker:up` / `npm run docker:down`

### Services (host ports)

| Service | Port |
|---------|------|
| agent-core (Aida) | 3000 |
| agent-core (Riaan) | 3010 |
| agent-register | 3001 |
| agent-gateway | 3002 |
| agent-scheduler | 3003 |
| agent-wiki | 3004 |
| libsql | 8080 |

- Workspaces bind-mounted from `./agents/Aida`, `./agents/Riaan`
- Wiki bind-mounted from `./wiki` (edit `wiki/pages/*.md` on disk)
- Bot routes: `infra/dev-workstation/gateway-telegram-bots.json`

See **`digital-worker-workspace/README.md`** for backup and layout.

---

## Template stack (digital-worker)

For learning the platform without a private workspace repo.

### Secrets

```bash
cp .env.example .env
# Edit DEEPSEEK_API_KEY only (Telegram not wired in template compose)
```

### Start and stop

From **this repo** root:

```bash
pnpm install
pnpm docker:dev        # template stack: _template agent + register + wiki
pnpm docker:dev:down
```

### Template services

| Service | Host port |
|---------|-----------|
| agent-core-template | 3000 |
| agent-register | 3001 |
| agent-wiki | 3004 |
| libsql | 8080 |

- Workspace: `./workspace/_template` bind-mounted
- Wiki: named volume with seed pages from `apps/agent-wiki/seed/`

---

## Build context

| Stack | `build.context` | Dockerfiles |
|-------|-----------------|-------------|
| Template (this repo) | `.` (project root) | `infra/dev-workstation/Dockerfile.*` |
| Real (workspace repo) | `../digital-worker` (via `DIGITAL_WORKER_ROOT`) | same Dockerfiles |

Images copy `workspace/` at build time (template only in public repo). Runtime state always comes from bind mounts in the real stack.

## agent-tui

Not in compose. Run on the host against either stack:

```bash
pnpm build
pnpm --filter @digital-worker/agent-tui dev -- -r http://127.0.0.1:3001 --agent-name Aida
```

Use `_template` for the template stack. The TUI rewrites Docker-internal URLs to `127.0.0.1` when the register is local.

## Related docs

- [local-development.md](./local-development.md) — run without Docker
- [specs/workspace-identity.md](../specs/workspace-identity.md)
- [specs/wiki.md](../specs/wiki.md)
- [specs/gateway.md](../specs/gateway.md)
