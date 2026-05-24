# digital-worker

TypeScript monorepo for digital worker agents: shared protocol packages, **agent-register** (discovery), and **agent-core** (runnable agent).

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io/) 10.x (`corepack enable`)
- [Colima](https://github.com/abiosoft/colima) with Docker CLI and **docker-compose** (Homebrew: `colima`, `docker`, `docker-compose`)

This project does not use Docker Desktop. Compose scripts call `docker-compose`, not `docker compose`.

## Dev workstation (Colima + Docker Compose)

The **dev-workstation** stack runs `agent-register` and a single `agent-core` instance. Config lives in [`infra/dev-workstation/`](infra/dev-workstation/):

| File | Image |
|------|--------|
| `Dockerfile.agent-register` | Registration service |
| `Dockerfile.agent-core` | Runnable agent |

Both Dockerfiles build from the monorepo root (`context: ../..`) because each app depends on shared `packages/*`. The compile steps are duplicated on purpose so each service has its own image definition; keep the `build` stages in sync when you change dependencies.

### Start Colima

If Colima is not already running:

```bash
colima start
```

Check status:

```bash
colima status
docker info
```

Optional: start Colima automatically at login:

```bash
brew services start colima
```

### Start the stack

From the repository root:

```bash
pnpm install
pnpm docker:dev
```

Build images and start containers in the foreground. Stop with `Ctrl+C`, then remove containers:

```bash
pnpm docker:dev:down
```

## Default endpoints (dev-workstation)

From your Mac, services are published on **localhost**:

| Service | Base URL | Health | Notes |
|---------|----------|--------|--------|
| **agent-core** | http://127.0.0.1:3000 | http://127.0.0.1:3000/health | `GET /api/v1` — service metadata |
| **agent-register** | http://127.0.0.1:3001 | http://127.0.0.1:3001/health | `GET /api/v1/agents` — all registered agents |

### Useful requests

```bash
# Health checks
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3001/health

# List registered agents
curl http://127.0.0.1:3001/api/v1/agents

# Agent metadata
curl http://127.0.0.1:3000/api/v1
```

Inside the Compose network, containers reach each other by service name (e.g. `http://agent-register:3001`, `http://agent-core:3000`). Those hostnames are not available from your Mac unless port mappings are used.

## Local development (without Docker)

```bash
pnpm install
pnpm build          # protocol packages

# Terminal 1 — register (port 3001)
pnpm --filter @digital-worker/agent-register dev

# Terminal 2 — agent-core (port 3000)
pnpm --filter @digital-worker/agent-core dev -- \
  --register-url http://127.0.0.1:3001
```

## Documentation

- [Project structure](docs/project-structure.md) — monorepo layout and conventions
- [Architecture](docs/architecture.md) — library choices and runtime flows
