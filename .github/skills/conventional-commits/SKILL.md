---
name: conventional-commits
description: >-
  Formats all git commit messages per Conventional Commits 1.0.0: typed
  subject lines, optional scope, imperative descriptions, bodies and footers.
  Use when creating commits, amending messages, drafting PR squash titles, or
  when the user asks about commit message format.
---

# Conventional Commits

All git commits in this repository **must** follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

## Message structure

```
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

- **Subject line (required):** type, optional scope in parentheses, optional `!` for breaking changes, colon, space, then a short summary.
- **Body (optional):** blank line after subject; explain *why* and context, not a file list.
- **Footers (optional):** blank line after body; use git-trailer style (`Token: value`). `BREAKING CHANGE:` (uppercase) documents breaking changes.

## Types

| Type | Use when |
|------|----------|
| `feat` | New user-facing or API behavior (SemVer **minor**) |
| `fix` | Bug fix (SemVer **patch**) |
| `docs` | Documentation only |
| `style` | Formatting, whitespace; no logic change |
| `refactor` | Code change that is neither feat nor fix |
| `perf` | Performance improvement |
| `test` | Tests only |
| `build` | Build system or external dependencies |
| `ci` | CI configuration |
| `chore` | Maintenance (deps, tooling) with no production code change |
| `revert` | Reverts a prior commit (reference SHAs in footer) |

Use `feat` and `fix` for changes that affect released behavior. Prefer the most specific type; split mixed changes into separate commits when practical.

## Scope

- Optional noun in parentheses: area of the codebase, e.g. `feat(agent-core):`, `fix(pnpm-workspace):`.
- Use existing package/app names (`agent-core`, shared lib names) or a short subsystem name.
- Omit scope when the change spans many areas or scope adds no clarity.

## Description rules

- **Imperative mood**, present tense: "add handler" not "added handler" or "adds handler".
- **Lowercase** after the colon (no trailing period on the subject).
- **~72 characters** or fewer on the subject line.
- State **what** changed at a glance; put rationale in the body.

## Breaking changes

Indicate either:

- `!` before the colon: `feat(api)!: remove legacy auth endpoint`, or
- Footer: `BREAKING CHANGE: environment variables now override config files`

The description or body must explain what broke and what consumers should do.

## Philosophy

- **One logical change per commit** when possible — easier review, revert, and changelog generation.
- **Messages are for humans and tooling** — consistent history supports SemVer, changelogs, and release automation.
- **Subject = summary; body = why** — avoid dumping diffs or file lists into the subject.
- **Only commit when asked** — follow project git safety rules; when committing, always use this format.

## Workflow (when committing)

1. Inspect `git status` and `git diff` (staged and unstaged).
2. Choose **one** primary type (split work if multiple types apply).
3. Draft subject; add body if the *why* is not obvious from the subject.
4. Add `BREAKING CHANGE:` or `!` if applicable.
5. Pass the message via HEREDOC, e.g. `git commit -m "$(cat <<'EOF' ... EOF)"`.

## Examples

```
feat(agent-core): add health check route

Expose GET /health for load balancers and orchestration probes.
```

```
fix(pnpm-workspace): resolve workspace filter for nested apps

pnpm --filter was failing when the app name matched a package folder.
```

```
docs: document conventional commit policy in AGENT.md
```

```
feat(api)!: require Authorization header on all routes

BREAKING CHANGE: unauthenticated requests now receive 401; update clients to send Bearer tokens.
```

```
chore(deps): bump vitest to 3.2.4
```

```
revert: revert "feat(agent-core): add health check route"

Refs: abc1234
```

## Anti-patterns

- `Fixed stuff`, `WIP`, `updates` — no type or vague description
- `feat: Add feature.` — past tense, capitalized, trailing period on subject
- Mixing unrelated refactors and features in one `feat` commit
- Secrets or internal URLs in commit messages
