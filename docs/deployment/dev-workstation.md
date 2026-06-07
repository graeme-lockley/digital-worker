# Dev workstation (Docker Compose)

Run **agent-register**, **agent-core-aida** (Aida), **agent-core-riaan** (Riaan), **agent-gateway**, and **agent-scheduler** in containers for local integration testing.

**Stack name:** `dev-workstation`  
**Config:** `infra/dev-workstation/`

## Prerequisites

- [Colima](https://github.com/abiosoft/colima) (this project does not use Docker Desktop)
- Homebrew: `colima`, `docker`, `docker-compose`
- Node is only required on the host for `pnpm install`; images use Node 22

```bash
colima start
colima status
docker info
```

## Secrets

Create `.env` at the **project root** (same folder as `package.json`):

```bash
cp .env.example .env
# Edit:
#   DEEPSEEK_API_KEY=...
#   TELEGRAM_BOT_TOKEN=...
#   TELEGRAM_ALLOWED_CHAT_IDS=8672094762
```

`.env` is gitignored. See `.env.example` for variable names. Telegram credentials live on **agent-gateway** only — not in the workspace bind mount.

## Start and stop

From project root:

```bash
pnpm install
pnpm docker:dev        # build + foreground up
pnpm docker:dev:down   # stop and remove containers
```

`docker:dev` runs:

```bash
docker-compose --env-file .env --project-directory . \
  -f infra/dev-workstation/docker-compose.yml up --build
```

- **`--project-directory .`** — paths and `.env` resolve from project root
- **`env_file: .env`** on agent-core-aida, agent-core-riaan, and agent-gateway injects keys into containers

## Services

| Service | Host port | Container name | Image Dockerfile |
|---------|-----------|----------------|------------------|
| libsql | 8080 | — | `ghcr.io/tursodatabase/libsql-server:latest` |
| agent-register | 3001 | — | `Dockerfile.agent-register` |
| agent-core-aida (Aida) | 3000 | — | `Dockerfile.agent-core` |
| agent-core-riaan (Riaan) | 3010 | — | `Dockerfile.agent-core` |
| agent-gateway | 3002 | — | `Dockerfile.agent-gateway` |
| agent-scheduler | 3003 | — | `Dockerfile.agent-scheduler` |

### libsql

- Central libSQL (`sqld`) database for operational services
- Data volume: `libsql-data` → `/var/lib/sqld`
- Host port `8080` (optional direct access; apps use `http://libsql:8080` on the Compose network)
- Healthcheck: `GET /health` on port 8080; **agent-register**, **agent-scheduler**, and **agent-gateway** wait for `service_healthy` before starting

### agent-register

- Depends on `libsql`
- Command: `node dist/index.js --host 0.0.0.0 --port 3001 --db-url http://libsql:8080`
- Registry persisted in libSQL (`agent` table); survives register restarts
- Heartbeat interval 15s, timeout 5s

### agent-core-aida (Aida)

- Entrypoint: `agent-core-entrypoint.sh` — starts Ollama (local embeddings), cron (memory maintenance), then `restart-loop.sh`
- Wrapped by restart loop — `/restart` exits with code 75 and relaunches the worker
- Registers with `http://agent-register:3001`
- Advertises `http://agent-core-aida:3000` inside the Compose network
- Agent **Aida** (`--agent-name Aida`); workspace: `/app/workspace/Aida` (bind-mounted from `./workspace/Aida` on the host)
- Registers as `dev-workstation-agent-core-aida`
- `--gateway-url http://agent-gateway:3002` enables `check_messages` / `send_message` tools
- `GATEWAY_URL` env set for bash/curl in skills
- Memory: episodic daily logs, flush on compaction/shutdown, cron roll-ups (Distill + Ollama)
- Builtin tools default to the workspace directory (no separate `--tools-cwd`)
- LLM: `--provider deepseek --model deepseek-v4-flash --models deepseek-v4-flash,deepseek-v4-pro`
- Requires `DEEPSEEK_API_KEY` from `.env`
- Image includes: **Ollama** + `nomic-embed-text` (baked at build), **Distill** CLI, **cron**, **sqlite3**
- Image base: `node:22-bookworm-slim` (agent-core runtime; register remains alpine)

### agent-core-riaan (Riaan)

- Same image and entrypoint as **agent-core-aida**
- Host port **3010** → container **3000**
- Agent **Riaan** (`--agent-name Riaan`); workspace: `/app/workspace/Riaan` (bind-mounted from `./workspace/Riaan`)
- Registers as `dev-workstation-agent-core-riaan`; advertises `http://agent-core-riaan:3000`
- Gateway and scheduler URLs match Aida — Riaan uses `send_message` for proactive Telegram delivery and `send_to_agent` to coordinate with Aida
- `--skills memory-curation` only (workspace skills under `skills/`)

### agent-core (shared notes)

- Entrypoint, memory maintenance, Ollama, and Distill behaviour are identical for both agent-core services.

### agent-gateway

- Depends on `libsql` (healthy), `agent-core-aida`, and `agent-core-riaan`
- Bot routes: **`infra/dev-workstation/gateway-telegram-bots.json`** (mounted read-only; override with `GATEWAY_TELEGRAM_BOTS_FILE` or inline `GATEWAY_TELEGRAM_BOTS` JSON)
- Tokens: env vars named by each entry's `tokenEnv` (e.g. `TELEGRAM_AIDADIGITALBOT_TOKEN`, `TELEGRAM_RIAANDIGITALBOT_TOKEN`)
- Shared allowlist: `TELEGRAM_ALLOWED_CHAT_IDS`
- Correlation ids: `telegram:{botId}:{chatId}`

### agent-scheduler

- Depends on `libsql` (healthy), `agent-register`, `agent-core-aida`, `agent-core-riaan`, and `agent-gateway`
- Command: `node dist/index.js --host 0.0.0.0 --port 3003 --register-url http://agent-register:3001 --db-url http://libsql:8080`
- Schedule data persisted in libSQL (`libsql-data` volume); no SQLite volume in the container
- Serves read-only web UI at **http://127.0.0.1:3003/**
- Fires due events via each agent's registered endpoint (`POST /api/v1/chat`, SSE transcript capture)
- Both **agent-core** services use `--scheduler-url http://agent-scheduler:3003` for scheduling tools

## Build context

All images build from **project root** (`context: .` in compose):

- Copies `packages/`, `apps/`, `workspace/`
- Compiles protocol packages and apps
- agent-register / agent-gateway base: `node:22-alpine`
- agent-core runtime base: `node:22-bookworm-slim` (Ollama, Distill, cron)

Keep Dockerfiles' build stages in sync when dependencies change.

## Endpoints (from Mac)

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:3001/health | Register health |
| http://127.0.0.1:3001/api/v1/agents | List agents |
| http://127.0.0.1:3000/health | Aida agent health |
| http://127.0.0.1:3000/api/v1 | Aida agent metadata |
| http://127.0.0.1:3010/health | Riaan agent health |
| http://127.0.0.1:3010/api/v1 | Riaan agent metadata |
| http://127.0.0.1:3002/health | Gateway health |
| http://127.0.0.1:3002/api/v1/messages | Pull unread Telegram messages |
| http://127.0.0.1:3003/ | Scheduler web UI (schedules + runs) |
| http://127.0.0.1:3003/health | Scheduler health |

Inside the Compose network, use service hostnames `agent-register`, `agent-core-aida`, `agent-core-riaan`, `agent-gateway`, and `agent-scheduler`.

## agent-tui with Docker stack

agent-tui is **not** in the compose file. Run on the host:

```bash
pnpm build
pnpm --filter @digital-worker/agent-tui dev -- -r http://127.0.0.1:3001 --agent-name Aida
```

The TUI rewrites Docker-internal agent URLs to `127.0.0.1` when the register is local.

## Telegram chat from your phone

1. Start the stack with valid `TELEGRAM_*` vars in `.env`.
2. Message **@AidaDigitalBot** for general tasks (routes to Aida) or **@RiaanDigitalBot** for news/sports (routes to Riaan).
3. Gateway stores the message and doorbell-notifies the matching agent-core instance.
4. The agent replies in text; delivery back to the same bot is automatic.

See [specs/gateway.md](../specs/gateway.md).

## Troubleshooting

| Issue | Check |
|-------|-------|
| Build context path errors | Run `pnpm docker:dev` from project root; compose uses `context: .` |
| Missing API key | `DEEPSEEK_API_KEY` in project-root `.env` |
| Telegram not working | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`; gateway logs; outbound internet |
| Agent `SLEEPING` | agent-core container logs; heartbeat must reach port 3000 |
| buildx warning | Optional plugin; build may still succeed |

## Related docs

- [local-development.md](./local-development.md) — run without Docker
- [specs/agent-register-api.md](../specs/agent-register-api.md)
- [specs/agent-core-api.md](../specs/agent-core-api.md)
- [specs/gateway.md](../specs/gateway.md)
- [specs/scheduler.md](../specs/scheduler.md)
