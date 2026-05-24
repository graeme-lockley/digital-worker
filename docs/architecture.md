# Architecture

High-level design notes and **library decisions** for the digital-worker monorepo. Update this document when adopting or replacing a major dependency.

## Applications

| App | Path | Role |
|-----|------|------|
| agent-core | `apps/agent-core` | CLI entrypoint that parses arguments, then runs an HTTP API server |

## Library decisions

### agent-core

| Concern | Choice | Version policy | Rationale |
|---------|--------|----------------|------------|
| HTTP API | [Hono](https://hono.dev/) | Pin in app `package.json` | Small, TypeScript-first router with excellent ESM support; fits `NodeNext` and a minimal API surface without adopting a full application framework. |
| Node HTTP adapter | [@hono/node-server](https://github.com/honojs/node-server) | Pin with Hono | Official adapter to serve Hono’s `fetch` handler on Node.js. |
| CLI | [Commander](https://github.com/tj/commander.js) | Pin in app `package.json` | De facto standard for Node CLIs; parses `process.argv` before server startup (host, port, subcommands later). |
| Dev execution | [tsx](https://github.com/privatenumber/tsx) | App devDependency | Runs TypeScript directly during `pnpm dev` without a separate watch build step. |
| Production build | `tsc` (workspace TypeScript) | Root devDependency | Emits `dist/` for `node dist/index.js`; consistent with shared `tsconfig.base.json`. |
| Unit / integration tests | [Vitest](https://vitest.dev/) | Per-member devDependency | Native ESM and TypeScript support; `app.request()` works with Hono without binding a port. Same runner for all apps and packages. |

#### Alternatives considered

| Concern | Alternatives | Why not (for now) |
|---------|--------------|-------------------|
| HTTP API | Fastify, Express | Fastify is strong for large APIs; Express is ubiquitous but less aligned with Web Standard `Request`/`Response`. Hono keeps the first app small and easy to extend. Revisit if we need JSON Schema plugins, heavy plugins, or mature OpenAPI generation out of the box. |
| CLI | yargs, citty | yargs is heavier; citty is ergonomic but less familiar to most contributors. Commander matches the “parse argv → start server” flow with minimal ceremony. |
| Dev runtime | ts-node, node --watch on compiled JS | tsx is faster and simpler for ESM + `NodeNext` in a monorepo app. |
| Tests | Node test runner, Jest | Vitest aligns with Vite/ESM tooling and needs minimal config for `NodeNext` packages; Jest is heavier to configure for pure-Node libraries. |

### Cross-cutting conventions

- Internal packages use the `@digital-worker/*` scope and `workspace:*` links (see [project-structure.md](./project-structure.md)).
- API routes are versioned under `/api/v1` unless a breaking change requires a new prefix.
- Configuration from the CLI overrides defaults; environment variables may be added later for deployment (document here when introduced).

### Testing (monorepo)

| Rule | Detail |
|------|--------|
| Runner | Vitest in each member that has tests (`vitest run` via `pnpm test`) |
| Test files | `src/**/*.test.ts` co-located with source |
| Root `pnpm test` | Runs `test:packages` then `test:apps` (packages before apps) |
| Member `pnpm test` | Runs only that app or package (e.g. from `apps/agent-core`) |

Hono handlers are tested with `createApp().request(path)` so tests do not start an HTTP listener.

## agent-core runtime flow

```
process.argv
    │
    ▼
Commander (cli.ts)  ──►  ServerOptions { host, port }
    │
    ▼
Hono app (server.ts)  ──►  @hono/node-server serve()
    │
    ▼
HTTP handlers (/health, /api/v1, …)
```

The process does not listen for HTTP traffic until CLI parsing completes successfully.
