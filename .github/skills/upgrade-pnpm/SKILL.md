---
name: upgrade-pnpm
description: >-
  Upgrades the pinned pnpm version across the digital-worker monorepo. Use when
  pnpm prints an update banner, the user asks to upgrade pnpm, or packageManager
  must be bumped to a new pnpm release.
---

# Upgrade pnpm

When pnpm reports an update (e.g. `11.5.0 → 11.5.2`), bump the pinned version everywhere in this repo, then activate it locally.

## Cursor discovery

Canonical source: `.github/skills/upgrade-pnpm/`. Cursor loads project skills from `.cursor/skills/` (gitignored). After adding or changing skills, run:

```bash
pnpm sync:cursor-skills
```

Then start a new agent chat so Cursor rescans `<available_skills>`.

## Workflow

1. **Choose the target version** from the pnpm banner or the user (e.g. `11.5.2`).

2. **Find all pins** — search for the current `pnpm@` version:

   ```bash
   rg 'pnpm@11\.' --glob '!pnpm-lock.yaml'
   ```

   Do **not** change unrelated packages in `pnpm-lock.yaml` (e.g. `lru-cache@11.5.0`).

3. **Update every pin** to `pnpm@<version>`:

   | File | Field / pattern |
   |------|-----------------|
   | `package.json` | `"packageManager": "pnpm@<version>"` |
   | `infra/dev-workstation/Dockerfile.agent-core` | `corepack prepare pnpm@<version> --activate` (2 stages) |
   | `infra/dev-workstation/Dockerfile.agent-gateway` | same |
   | `infra/dev-workstation/Dockerfile.agent-register` | same |
   | `docs/project-structure.md` | version mentions and `corepack prepare` example |

4. **Activate locally** (preferred):

   ```bash
   corepack use pnpm@<version>
   pnpm --version
   ```

   If Corepack is unavailable, fall back to:

   ```bash
   npm install -g pnpm@<version>
   ```

5. **Verify** — run `pnpm install` from repo root; the update banner should no longer appear.

## Notes

- Keep Dockerfiles and `package.json` in sync; dev containers read the Dockerfile pins.
- No lockfile change is required for a pnpm CLI bump unless the new pnpm version rewrites lockfile metadata; if it does, commit that separately.
- Commit message type: `chore` with scope `pnpm` (see conventional-commits skill).
