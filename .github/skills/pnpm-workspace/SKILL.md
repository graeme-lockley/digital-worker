---
name: pnpm-workspace
description: >-
  Guides work in the digital-worker pnpm TypeScript monorepo: apps under apps/,
  shared packages under packages/, workspace scripts, and @digital-worker naming.
  Use when adding or changing apps or packages, running pnpm commands, wiring
  workspace dependencies, configuring TypeScript, or questions about repo layout.
---

# pnpm workspace (digital-worker)

This repository is a **pnpm workspace** monorepo. Apps live in `apps/*`; buildable shared libraries live in `packages/*`.

## Layout

| Path | Purpose |
|------|---------|
| `apps/<name>/` | Runnable applications (not in root `pnpm build` by default) |
| `packages/<name>/` | Shared libraries; root `pnpm build` targets these |
| `docs/project-structure.md` | Full human documentation (read when scaffolding or unsure) |

Root orchestration: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `pnpm-lock.yaml` (commit the lockfile).

## Conventions (follow strictly)

- **Package manager:** pnpm only (never npm/yarn for installs). Run commands from repo root unless noted.
- **Scope:** `@digital-worker/<name>` for internal packages and apps.
- **Folders:** kebab-case (`my-lib`, `api-gateway`).
- **Internal deps:** `"@digital-worker/other-lib": "workspace:*"` in `dependencies`.
- **TypeScript:** extend `../../tsconfig.base.json` (adjust depth). Base uses `NodeNext`, `strict`, `noEmit: true`.
- **Packages:** emit to `dist/` via `tsconfig.build.json` (`noEmit: false`, `outDir`, `rootDir`). Expose `main`, `types`, and `exports` in `package.json`.
- **Secrets:** never commit `.env`; `.env.example` is allowed.
- **Tests:** Vitest; `src/**/*.test.ts`; each member defines `"test": "vitest run"`. Root `pnpm test` runs packages then apps.

## Root commands

```bash
pnpm install          # after adding/changing any workspace member
pnpm build            # build all packages/*
pnpm dev              # dev scripts (parallel, where defined)
pnpm typecheck        # typecheck where defined
pnpm test             # all package tests, then all app tests
pnpm clean            # clean members + root node_modules
```

Target one member:

```bash
pnpm --filter @digital-worker/<name> build
pnpm --filter @digital-worker/<name> dev
pnpm --filter ./apps/<name> add <pkg>
```

Build packages before running an app that imports them: `pnpm build` then filter the app.

## Add a package (checklist)

1. `mkdir -p packages/<name>/src`
2. `package.json`: `@digital-worker/<name>`, `"type": "module"`, `build` / `typecheck` / `test` / `clean` scripts, `exports` → `./dist/...`, `typescript` and `vitest` in devDependencies
3. `tsconfig.json` extends base; `tsconfig.build.json` sets `noEmit: false`, `outDir: dist`, `rootDir: src`
4. `src/index.ts` entrypoint
5. `pnpm install` then `pnpm --filter @digital-worker/<name> build`

## Add an app (checklist)

1. `mkdir -p apps/<name>/src`
2. `package.json` with `dev` / `typecheck` / `test` / `clean`; `workspace:*` deps on internal packages; Vitest as devDependency
3. `tsconfig.json` extends base
4. `pnpm install` then `pnpm --filter @digital-worker/<name> dev`

## Dependency graph

```
apps/*  →  packages/*
packages/*  →  packages/*  (allowed)
```

Runtime → `dependencies`; tools/types → `devDependencies`.

## When editing

- Match existing member patterns before inventing new tooling.
- After new `package.json` files: run `pnpm install` from root.
- Keep build output in each member’s `dist/` or `build/`, not the repo root.
- Update `docs/project-structure.md` and `docs/architecture.md` if conventions or library choices change.

## Full reference

For templates, tables, and extended workflows, read [docs/project-structure.md](../../../docs/project-structure.md).
