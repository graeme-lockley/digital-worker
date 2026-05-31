# Project structure

**digital-worker** is a TypeScript monorepo managed with [pnpm](https://pnpm.io/) workspaces. Application code lives under `apps/`; reusable, buildable libraries live under `packages/`.

Full documentation index: **[docs/README.md](./README.md)** (philosophy, specs, build state, deployment).

AI agents can load the **`pnpm-workspace`** skill from [`.github/skills/pnpm-workspace/`](../.github/skills/pnpm-workspace/) (also linked from [`.cursor/skills/pnpm-workspace`](../.cursor/skills/pnpm-workspace)).

## Repository layout

```
digital-worker/
├── apps/                    # Deployable or runnable applications (one directory per app)
├── packages/                # Shared libraries built and consumed by apps (and each other)
├── docs/                    # System documentation (start at docs/README.md)
├── infra/                   # Docker Compose and deployment configs
├── package.json             # Root workspace manifest and shared scripts
├── pnpm-workspace.yaml      # Workspace package globs
├── pnpm-lock.yaml           # Lockfile (commit this)
├── tsconfig.base.json       # Shared TypeScript compiler options
├── tsconfig.json            # Solution-style references (extend as members are added)
├── .npmrc                   # pnpm behaviour
├── .node-version            # Recommended Node.js major version (20)
└── .gitignore
```

### `apps/`

Each subdirectory is a standalone application (API server, CLI, worker, web app, etc.). Apps may depend on packages in `packages/` using the `workspace:*` protocol. Apps are not included in the root `pnpm build` script by default—that script targets `packages/*` only. Apps typically define their own `build` / `dev` scripts as needed.

### `packages/`

Each subdirectory is a publishable or internal library. Packages are compiled to `dist/` (or similar) and expose `main`, `types`, and `exports` in their `package.json`. Other workspace members depend on them by package name.

### Root configuration

| File | Role |
|------|------|
| `package.json` | Private root package; orchestrates workspace-wide scripts |
| `pnpm-workspace.yaml` | Declares `apps/*` and `packages/*` as workspace members |
| `tsconfig.base.json` | Strict, Node-oriented defaults (`NodeNext`, ES2022) |
| `tsconfig.json` | Placeholder for TypeScript project references across the repo |
| `.npmrc` | `auto-install-peers=true`; relaxed strict peer deps for smoother installs |

## Prerequisites

- **Node.js** ≥ 20 (see `.node-version` and `engines` in root `package.json`)
- **pnpm** 11.x — the root `packageManager` field pins `pnpm@11.5.0`. Enable via [Corepack](https://nodejs.org/api/corepack.html):

  ```bash
  corepack enable
  corepack prepare pnpm@11.5.0 --activate
  ```

## Getting started

From the repository root:

```bash
pnpm install
```

After adding or changing workspace members, run `pnpm install` again so links and the lockfile stay correct.

## Root scripts

Run these from the repository root:

| Command | Description |
|---------|-------------|
| `pnpm build` | Runs `build` in every package under `packages/*` (skips members without a `build` script) |
| `pnpm dev` | Runs `dev` in parallel across all workspace members that define it |
| `pnpm typecheck` | Runs `typecheck` everywhere it is defined |
| `pnpm test` | Runs all package tests, then all app tests (see [Testing](#testing)) |
| `pnpm clean` | Runs `clean` in each member, then removes root `node_modules` |
| `pnpm docker:dev` | Builds and starts the `dev-workstation` Compose stack (`docker-compose`; start Colima first) |
| `pnpm docker:dev:down` | Stops the `dev-workstation` Compose stack |

Members that do not define a script are skipped (`--if-present`).

## Testing

Tests use [Vitest](https://vitest.dev/) in each workspace member that defines a `test` script. Test files live next to source code as `*.test.ts` under `src/`.

| Command | Scope |
|---------|--------|
| `pnpm test` (repo root) | All `packages/*` tests, then all `apps/*` tests (sequential) |
| `pnpm test` (inside an app or package) | That member only |

Root `pnpm test` is implemented as two phases so shared libraries are verified before applications:

```bash
pnpm run test:packages   # pnpm -r --filter './packages/*' --if-present run test
pnpm run test:apps       # pnpm -r --filter './apps/*' --if-present run test
```

From a member directory (e.g. `apps/agent-core`):

```bash
pnpm test
```

Equivalent from the repo root:

```bash
pnpm --filter @digital-worker/agent-core test
```

See [architecture.md](./architecture.md) for the testing library decision and rationale.

## Naming conventions

Use the **`@digital-worker/`** scope for internal package names so workspace dependencies are easy to recognise:

- Package: `@digital-worker/logger`
- App: `@digital-worker/api` (or an unscoped name if you prefer for apps only)

Directory names should be short and kebab-case (`my-lib`, `api-gateway`). The folder name does not have to match the npm package name, but keeping them aligned reduces confusion.

## TypeScript

All members should extend the shared base config:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Adjust the `extends` path (`../..` vs `../../..`) based on depth.

**Base defaults** (`tsconfig.base.json`):

- `module` / `moduleResolution`: `NodeNext` (native ESM on Node)
- `strict`: enabled, including `noUncheckedIndexedAccess`
- `noEmit`: `true` at the base level (typecheck-only)

**Packages** that emit JavaScript should add a separate build config (e.g. `tsconfig.build.json`) that sets `noEmit: false`, `outDir`, and `rootDir`. **Apps** may use the same pattern, or a bundler (esbuild, Vite, etc.) instead of `tsc` for production builds.

When you add several members and want faster incremental builds, add [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) in the root `tsconfig.json` and in each member’s `tsconfig.json`.

## Adding a package

1. **Create the directory**

   ```bash
   mkdir -p packages/my-lib/src
   ```

2. **Add `packages/my-lib/package.json`**

   ```json
   {
     "name": "@digital-worker/my-lib",
     "version": "0.0.0",
     "private": true,
     "type": "module",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js"
       }
     },
     "scripts": {
       "build": "tsc -p tsconfig.build.json",
       "typecheck": "tsc -p tsconfig.json",
       "test": "vitest run",
       "clean": "rm -rf dist *.tsbuildinfo"
     },
     "devDependencies": {
       "typescript": "^5.8.3",
       "vitest": "^3.1.4"
     }
   }
   ```

3. **Add `packages/my-lib/vitest.config.ts`** (optional but recommended)

   ```ts
   import { defineConfig } from "vitest/config";

   export default defineConfig({
     test: {
       environment: "node",
       include: ["src/**/*.test.ts"],
     },
   });
   ```

4. **Add `packages/my-lib/tsconfig.json`** (typecheck only)

   ```json
   {
     "extends": "../../tsconfig.base.json",
     "include": ["src"]
   }
   ```

5. **Add `packages/my-lib/tsconfig.build.json`** (emit to `dist/`)

   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "noEmit": false,
       "outDir": "dist",
       "rootDir": "src"
     }
   }
   ```

6. **Add source and tests**, e.g. `packages/my-lib/src/index.ts`, `packages/my-lib/src/index.test.ts`

7. **Install from the repo root**

   ```bash
   pnpm install
   pnpm --filter @digital-worker/my-lib build
   ```

8. **Optional:** add a project reference in the root `tsconfig.json` for editor/CI solution builds.

Packages that depend on other workspace packages should list them in `dependencies` with `"workspace:*"` and build dependents after their dependencies (`pnpm build` runs all package builds; order is not guaranteed—use explicit filters or a task runner if you need strict ordering).

## Adding an app

1. **Create the directory**

   ```bash
   mkdir -p apps/my-app/src
   ```

2. **Add `apps/my-app/package.json`**

   ```json
   {
     "name": "@digital-worker/my-app",
     "version": "0.0.0",
     "private": true,
     "type": "module",
     "scripts": {
       "dev": "node --watch src/index.ts",
       "typecheck": "tsc -p tsconfig.json",
       "test": "vitest run",
       "clean": "rm -rf dist *.tsbuildinfo"
     },
     "dependencies": {
       "@digital-worker/my-lib": "workspace:*"
     },
     "devDependencies": {
       "typescript": "^5.8.3",
       "vitest": "^3.1.4"
     }
   }
   ```

   Adjust `dev` / `build` scripts for your stack (tsx, ts-node, Vite, etc.). Add `vitest.config.ts` as in the package template above.

3. **Add `apps/my-app/tsconfig.json`**

   ```json
   {
     "extends": "../../tsconfig.base.json",
     "include": ["src"]
   }
   ```

4. **Add entrypoint**, e.g. `apps/my-app/src/index.ts`

5. **Install and run**

   ```bash
   pnpm install
   pnpm --filter @digital-worker/my-app dev
   ```

Build shared packages before running an app that imports them:

```bash
pnpm build
pnpm --filter @digital-worker/my-app dev
```

## Working with a single workspace member

Use pnpm’s `--filter` (short `-F`) to target one app or package:

```bash
pnpm --filter @digital-worker/my-lib build
pnpm --filter @digital-worker/my-app dev
pnpm --filter @digital-worker/my-app typecheck
pnpm --filter @digital-worker/my-app test
```

Filters also accept paths:

```bash
pnpm --filter ./apps/my-app dev
```

Add dependencies to a specific member:

```bash
pnpm --filter @digital-worker/my-app add zod
pnpm --filter @digital-worker/my-lib add -D vitest
```

Internal workspace links:

```bash
pnpm --filter @digital-worker/my-app add @digital-worker/my-lib@workspace:*
```

## Dependency graph

```
apps/*  ──depends on──▶  packages/*
packages/*  ──may depend on──▶  packages/*
```

- Use **`dependencies`** for runtime needs.
- Use **`devDependencies`** for build tools, test runners, and types.
- Prefer **`workspace:*`** for internal packages so pnpm always links the local copy.

## Environment variables

- Do not commit secrets. Use `.env` locally; `.env` is gitignored.
- You may commit `.env.example` with dummy or non-secret variable names as documentation.

## Generated and ignored paths

The root [`.gitignore`](../.gitignore) excludes generated and local-only files. Do not commit:

| Category | Patterns |
|----------|----------|
| Dependencies | `node_modules/` |
| Build output | `dist/`, `build/`, `*.tsbuildinfo` |
| Tool / test caches | `.turbo/`, `.cache/`, `.vite/`, `coverage/` |
| Secrets | `.env`, `.env.*` (commit `.env.example` only) |
| Logs | `*.log`, `pnpm-debug.log*` |
| Local IDE | `.cursor/` (skills live in `.github/skills/`) |
| OS junk | `.DS_Store`, `Thumbs.db` |

Each package or app should emit build output into its own `dist/` (or `build/`) directory, not the repo root. Always commit `pnpm-lock.yaml`.

## Checklist for a new workspace member

- [ ] Directory under `apps/` or `packages/`
- [ ] `package.json` with a unique `name` (prefer `@digital-worker/...`)
- [ ] `tsconfig.json` extending `tsconfig.base.json`
- [ ] For packages: `build` script, `exports`, and `tsconfig.build.json`
- [ ] `pnpm install` from the repository root
- [ ] `test` script and `*.test.ts` files (Vitest)
- [ ] Verify with `pnpm --filter <name> typecheck`, `test` (and `build` for packages)

## Further reading

- [pnpm workspaces](https://pnpm.io/workspaces)
- [pnpm filtering](https://pnpm.io/filtering)
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html)
