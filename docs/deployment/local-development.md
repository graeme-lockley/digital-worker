# Local development (without Docker)

Run apps directly with **pnpm** and **tsx** — no containers.

For Docker-based stack see [dev-workstation.md](./dev-workstation.md).

## Prerequisites

- Node.js ≥ 20 (agent-core requires **≥ 22.19** for pi-agent-core)
- pnpm 10.x (`corepack enable`)

## One-time setup

```bash
pnpm install
pnpm build   # builds packages/* (protocol libraries)
```

## Three-terminal workflow

### Terminal 1 — agent-register (port 3001)

```bash
pnpm --filter @digital-worker/agent-register dev
```

### Terminal 2 — agent-core (port 3000)

Export an LLM API key (project-root `.env` is **not** loaded automatically):

```bash
export DEEPSEEK_API_KEY=sk-...
pnpm --filter @digital-worker/agent-core dev -- \
  --register-url http://127.0.0.1:3001 \
  --provider deepseek \
  --model deepseek-v4-flash \
  --agent-name agent-core
```

Or pass `--api-key` instead of exporting.

Optional flags: `--host`, `--port`, `--agent-id`, `--workspace-dir`, `--endpoint-url`, `--skills`, `--purpose`.

### Terminal 3 — agent-tui

```bash
pnpm --filter @digital-worker/agent-tui dev -- \
  -r http://127.0.0.1:3001 \
  --agent-name agent-core
```

## Verify

```bash
curl http://127.0.0.1:3001/api/v1/agents
curl http://127.0.0.1:3000/api/v1
```

## Workspace

Default workspace: `./workspace/agent-core/` relative to the **current working directory** when starting agent-core (typically `apps/agent-core` or project root depending how you invoke pnpm).

Use explicit path if needed:

```bash
--workspace-dir /path/to/digital-worker/workspace/agent-core
```

See [specs/workspace-identity.md](../specs/workspace-identity.md).

## Tests

```bash
pnpm test                              # all packages + apps
pnpm --filter @digital-worker/agent-core test
```

## Build agent-core for production-style run

```bash
pnpm --filter @digital-worker/agent-core build
node apps/agent-core/dist/index.js --register-url ... --provider ... --model ...
```

## Related docs

- [project-structure.md](../project-structure.md) — monorepo commands
- [specs/agent-core-api.md](../specs/agent-core-api.md) — CLI flags
- [build-state.md](../build-state.md) — known gaps (e.g. auto `.env` loading)
