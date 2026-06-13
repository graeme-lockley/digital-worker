# Local development (without Docker)

Run apps directly with **pnpm** and **tsx** — no containers.

For Docker-based stack see [dev-workstation.md](./dev-workstation.md).

## Prerequisites

- Node.js ≥ 20 (agent-core requires **≥ 22.19** for pi-agent-core)
- pnpm 11.x (`corepack enable`)

## One-time setup

```bash
pnpm install
pnpm build   # builds packages/* (protocol libraries)
```

## Four-terminal workflow (with Telegram)

### Terminal 1 — agent-register (port 3001)

```bash
pnpm --filter @digital-worker/agent-register dev
```

### Terminal 2 — agent-wiki (port 3004, optional)

Enables `wiki_*` tools in agent-core when you pass `--wiki-url`:

```bash
pnpm --filter @digital-worker/agent-wiki dev
```

Wiki UI: http://127.0.0.1:3004/

### Terminal 3 — agent-core (port 3000)

Export an LLM API key (project-root `.env` is **not** loaded automatically):

```bash
export DEEPSEEK_API_KEY=sk-...
pnpm --filter @digital-worker/agent-core dev -- \
  --register-url http://127.0.0.1:3001 \
  --provider deepseek \
  --model deepseek-v4-flash \
  --models deepseek-v4-flash,deepseek-v4-pro \
  --agent-name Fred \
  --gateway-url http://127.0.0.1:3002 \
  --wiki-url http://127.0.0.1:3004
```

Omit `--wiki-url` if agent-wiki is not running.

### Terminal 4 — agent-gateway (port 3002)

```bash
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_ALLOWED_CHAT_IDS=8672094762
pnpm --filter @digital-worker/agent-gateway dev -- \
  --agent-core-url http://127.0.0.1:3000 \
  --use-notify-endpoint
```

### Terminal 5 — agent-tui

```bash
pnpm --filter @digital-worker/agent-tui dev -- \
  -r http://127.0.0.1:3001 \
  --agent-name Fred
```

### Terminal 6 (optional) — agent-observer

Watch all worker activity live (chat, Telegram notify, tools, thinking):

```bash
pnpm --filter @digital-worker/agent-observer dev -- \
  -r http://127.0.0.1:3001 \
  --agent-name Fred
```

To see model **thinking** in the observer, run agent-core with a reasoning model (e.g. `--model deepseek-reasoner`). The default `deepseek-chat` / `deepseek-v4-flash` models do not emit thinking events. The observer forwards thinking when the model produces it — it does not change thinking level or add token cost.

## Three-terminal workflow (without Telegram)

### Terminal 1 — agent-register (port 3001)

```bash
pnpm --filter @digital-worker/agent-register dev
```

### Terminal 2 — agent-wiki (port 3004, optional)

```bash
pnpm --filter @digital-worker/agent-wiki dev
```

### Terminal 3 — agent-core (port 3000)

Export an LLM API key (project-root `.env` is **not** loaded automatically):

```bash
export DEEPSEEK_API_KEY=sk-...
pnpm --filter @digital-worker/agent-core dev -- \
  --register-url http://127.0.0.1:3001 \
  --provider deepseek \
  --model deepseek-v4-flash \
  --models deepseek-v4-flash,deepseek-v4-pro \
  --agent-name Fred \
  --wiki-url http://127.0.0.1:3004
```

Or pass `--api-key` instead of exporting. Omitting `--agent-name` defaults to `Fred`; builtin tools default to the workspace directory.

For **real agents**, point at your private workspace repo:

```bash
export WORKSPACE_ROOT=../digital-worker-workspace
pnpm --filter @digital-worker/agent-core dev -- \
  --register-url http://127.0.0.1:3001 \
  --provider deepseek \
  --model deepseek-v4-flash \
  --agent-name Fred \
  --workspace-dir "$WORKSPACE_ROOT/agents/Aida"
```

Optional flags: `--host`, `--port`, `--agent-id`, `--workspace-dir`, `--tools-cwd`, `--endpoint-url`, `--skills`, `--purpose`, `--wiki-url`.

### Terminal 4 — agent-tui

```bash
pnpm --filter @digital-worker/agent-tui dev -- \
  -r http://127.0.0.1:3001 \
  --agent-name Fred
```

### Terminal 5 (optional) — agent-observer

```bash
pnpm --filter @digital-worker/agent-observer dev -- \
  -r http://127.0.0.1:3001 \
  --agent-name Fred
```

See [specs/observer.md](../specs/observer.md) for reasoning-model notes.

## Verify

```bash
curl http://127.0.0.1:3001/api/v1/agents
curl http://127.0.0.1:3000/api/v1
curl http://127.0.0.1:3004/health   # when agent-wiki is running
```

## Workspace

Default workspace: `./workspace/Fred/` (or `WORKSPACE_ROOT/<agent-name>` when set). Builtin tools use the same directory unless `--tools-cwd` overrides.

For real agents, use `digital-worker-workspace`:

```bash
--workspace-dir /path/to/digital-worker-workspace/agents/Aida
# or: export WORKSPACE_ROOT=../digital-worker-workspace/agents
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
