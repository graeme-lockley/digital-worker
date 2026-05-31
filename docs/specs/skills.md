# Workspace skills specification

Normative behaviour for **Agent Skills** loaded from the agent workspace: discovery, system-prompt injection, refresh, and authoring.

**Standards:** [Agent Skills](https://agentskills.io/home) (open format; implemented by [pi coding-agent](https://github.com/earendil-works/pi) via `loadSkillsFromDir` / `formatSkillsForPrompt`).

**Implementation:** `apps/agent-core/src/skills/skill-registry.ts`, `apps/agent-core/src/tools/refresh-skills.ts`, `apps/agent-core/src/llm-agent.ts`

**Related:** [workspace-identity](./workspace-identity.md), [worker-runtime](./worker-runtime.md)

## Location

Workspace skills live under:

```
workspace/<agentName>/skills/<skill-name>/SKILL.md
```

Example: `workspace/Aida/skills/skill-authoring/SKILL.md`.

The skills directory name is `skills/` (constant `SKILLS_DIR` in `apps/agent-core/src/workspace/paths.ts`). It is resolved relative to **`--tools-cwd`**, which defaults to the workspace directory (`--workspace-dir` / `--agent-name`).

## Progressive disclosure

The runtime does **not** embed full skill bodies in the system prompt.

1. **Discovery** — At agent startup and after `refresh_skills`, `SkillRegistry` scans `skills/` and injects an `<available_skills>` block (name, description, location per skill) via `formatSkillsForPrompt`.
2. **Activation** — When a user task matches a skill description, the agent uses the builtin **`read`** tool on the skill's `<location>` path to load the full `SKILL.md`.
3. **Execution** — The agent follows instructions in `SKILL.md`, optionally using `bash`, `references/`, `scripts/`, or `assets/` under the skill directory.

This matches pi's Agent Skills model and keeps the base prompt small.

## SkillRegistry

`SkillRegistry` wraps pi's `loadSkillsFromDir({ dir, source: "workspace" })` and caches the result.

| Method | Behaviour |
|--------|-----------|
| `refresh()` | Re-scan `skills/`; return cached `Skill[]` |
| `list()` | Return a copy of cached skills |
| `formatForPrompt()` | Return XML skills section for the system prompt (empty string when none) |

The pi `DefaultResourceLoader` is created with **`noSkills: true`** so workspace skills are loaded only through `SkillRegistry` (single source of truth).

## System prompt composition

`buildSystemPrompt(identity, skillsSection?)` appends the skills section after Mandate, Soul, Identity, and User when non-empty.

On startup, `systemPromptOverride` calls:

```ts
buildSystemPrompt(getIdentity(), skillRegistry.formatForPrompt())
```

`update_identity`, `update_user`, and `refresh_skills` rebuild the prompt with the current identity snapshot and skills section so edits do not drop skills.

## refresh_skills tool

The agent may call **`refresh_skills`** after creating, editing, or deleting files under `skills/`.

| Parameter | Constraint |
|-----------|------------|
| `reason` | Optional; why the list was refreshed; max 500 chars |

On success:

1. `SkillRegistry.refresh()` re-scans the directory.
2. `agent.state.systemPrompt` is rebuilt with identity + updated skills section.
3. Tool result text lists skill count and names.

Refresh is **explicit** (tool call + startup scan), not automatic on every chat job, to avoid mid-session prompt churn.

## Authoring workflow

1. Create `skills/<name>/SKILL.md` with valid YAML frontmatter (`name`, `description`; see [Agent Skills specification](https://agentskills.io/specification)).
2. Optionally add `scripts/`, `references/`, or `assets/`.
3. Call **`refresh_skills`** so the new skill appears in `<available_skills>`.
4. Use **`read`** on the skill path when executing it.

Aida ships a meta-skill at `skills/skill-authoring/SKILL.md` documenting format, best practices, and this runtime's management tools.

Authoring uses existing workspace-scoped **`write`** and **`bash`** tools; no separate file tool is required.

## Registration metadata vs workspace skills

| Mechanism | Purpose |
|-----------|---------|
| `--skills` on agent-core CLI | Strings sent to **agent-register** at registration (advertised capabilities) |
| `workspace/.../skills/` | **Loaded** Agent Skills (prompt index + on-demand `read`) |

Registration skills are not automatically loaded from disk unless the same content exists under `skills/`.

## Security

Skills can instruct the agent to run commands or access external resources. Operators and agents should review skill content before trusting it — especially third-party or copied skills.

## Testing

- `apps/agent-core/src/skills/skill-registry.test.ts` — scan and prompt formatting with a temp skill directory.
- Integration tests use the real `workspace/Aida/skills/skill-authoring` skill when `toolsCwd` is the Aida workspace directory.
