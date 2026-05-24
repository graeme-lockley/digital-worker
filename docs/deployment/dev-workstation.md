# Dev workstation (Docker Compose)

Run **agent-register** and **agent-core** in containers for local integration testing.

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
# Edit DEEPSEEK_API_KEY=...
```

`.env` is gitignored. See `.env.example` for variable names.

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
- **`env_file: .env`** on agent-core injects keys into the container

## Services

| Service | Host port | Container name | Image Dockerfile |
|---------|-----------|----------------|------------------|
| agent-register | 3001 | — | `Dockerfile.agent-register` |
| agent-core | 3000 | — | `Dockerfile.agent-core` |

### agent-register

- Command: `node dist/index.js --host 0.0.0.0 --port 3001`
- Heartbeat interval 15s, timeout 5s

### agent-core

- Registers with `http://agent-register:3001`
- Advertises `http://agent-core:3000` inside the Compose network
- Workspace: `/app/workspace/agent-core`
- LLM: `--provider deepseek --model deepseek-v4-flash`
- Requires `DEEPSEEK_API_KEY` from `.env`

## Build context

Both images build from **project root** (`context: .` in compose):

- Copies `packages/`, `apps/`, `workspace/`
- Compiles protocol packages and both apps
- Base image: `node:22-alpine`

Keep `Dockerfile.agent-register` and `Dockerfile.agent-core` build stages in sync when dependencies change.

## Endpoints (from Mac)

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:3001/health | Register health |
| http://127.0.0.1:3001/api/v1/agents | List agents |
| http://127.0.0.1:3000/health | Agent health |
| http://127.0.0.1:3000/api/v1 | Agent metadata |

Inside the Compose network, use service hostnames `agent-register` and `agent-core`.

## agent-tui with Docker stack

agent-tui is **not** in the compose file. Run on the host:

```bash
pnpm build
pnpm --filter @digital-worker/agent-tui dev -- -r http://127.0.0.1:3001 --agent-name agent-core
```

The TUI rewrites Docker-internal agent URLs to `127.0.0.1` when the register is local.

## Troubleshooting

| Issue | Check |
|-------|-------|
| Build context path errors | Run `pnpm docker:dev` from project root; compose uses `context: .` |
| Missing API key | `DEEPSEEK_API_KEY` in project-root `.env` |
| Agent `SLEEPING` | agent-core container logs; heartbeat must reach port 3000 |
| buildx warning | Optional plugin; build may still succeed |

## Related docs

- [local-development.md](./local-development.md) — run without Docker
- [specs/agent-register-api.md](../specs/agent-register-api.md)
- [specs/agent-core-api.md](../specs/agent-core-api.md)
