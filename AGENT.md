# Agent instructions (digital-worker)

Project-wide guidance for AI coding agents. Skills live under `.cursor/skills/` (symlinks to `.github/skills/`).

## Git commits

**Every commit message must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).**

Before creating or suggesting a commit:

1. Read and apply the **conventional-commits** skill: [.github/skills/conventional-commits/SKILL.md](.github/skills/conventional-commits/SKILL.md)
2. Use a typed subject (`feat`, `fix`, `docs`, etc.), optional scope, imperative description, and a body when the *why* is not obvious.
3. Mark breaking changes with `!` in the subject or a `BREAKING CHANGE:` footer.
4. Only run `git commit` when the user explicitly asks; never commit secrets.

Quick form:

```
<type>[scope][!]: <description>

[optional body and footers]
```

## Skills

| Skill | When to use |
|-------|-------------|
| [conventional-commits](.github/skills/conventional-commits/SKILL.md) | Any commit, amend, or commit-message question |
| [pnpm-workspace](.github/skills/pnpm-workspace/SKILL.md) | Monorepo layout, pnpm, apps/packages, TypeScript workspace |

## Repository

pnpm workspace monorepo: apps in `apps/`, shared packages in `packages/`, internal scope `@digital-worker/*`. System docs: [docs/README.md](docs/README.md). Monorepo layout: [docs/project-structure.md](docs/project-structure.md).
