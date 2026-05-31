---
name: skill-authoring
description: Create, structure, and maintain Agent Skills under workspace/skills. Use when authoring a new skill, editing SKILL.md frontmatter, organizing scripts or references, or after adding or changing skills (then call refresh_skills).
---

# Skill authoring

This skill explains how **Agent Skills** work in your runtime and how to create and manage them in `skills/`.

## What skills are

Agent Skills are folders of specialized instructions the agent loads **on demand**. Each skill is a portable package of procedural knowledge — workflows, setup steps, scripts, and reference docs — following the open [Agent Skills](https://agentskills.io/home) format (also implemented by pi).

**Progressive disclosure** keeps context small:

1. **Discovery** — At startup (and after `refresh_skills`), only each skill's **name** and **description** appear in your system prompt inside `<available_skills>`.
2. **Activation** — When a task matches a description, use the **`read`** tool on the skill's `<location>` path (the full `SKILL.md`).
3. **Execution** — Follow the instructions in `SKILL.md`. Use **`bash`** for bundled scripts. Load files under `references/` only when needed.

Do not paste entire skill bodies into Identity or User files — skills belong in `skills/`.

## Where skills live

In this deployment, workspace skills live under:

```
skills/<skill-name>/SKILL.md
```

Example: `skills/skill-authoring/SKILL.md` (this file).

After **creating, editing, or deleting** any skill, call the **`refresh_skills`** tool so the available-skills list in your system prompt stays current.

## Required structure

Minimum: one directory with a **`SKILL.md`** file.

```
my-skill/
├── SKILL.md              # Required: YAML frontmatter + markdown instructions
├── scripts/              # Optional: helper scripts you run via bash
├── references/           # Optional: long docs loaded on demand
└── assets/               # Optional: templates, data files
```

Everything optional besides `SKILL.md` is freeform. Keep the main file focused; move long API docs or examples into `references/`.

## SKILL.md format

````markdown
---
name: my-skill
description: What this skill does and when to use it. Be specific about triggers.
---

# My Skill

## Setup
(one-time steps)

## Usage
(step-by-step instructions; use relative paths from this skill directory)
````

### Frontmatter rules

| Field | Required | Rules |
|-------|----------|--------|
| `name` | Yes | 1–64 chars; lowercase `a-z`, digits, hyphens only; no leading/trailing or consecutive hyphens |
| `description` | Yes | Max 1024 chars; state **what** the skill does and **when** to use it |
| `license` | No | License name or reference |
| `compatibility` | No | Environment requirements (max 500 chars) |
| `disable-model-invocation` | No | If `true`, skill is hidden from the prompt; only explicit invocation |

**Good description:** "Extracts tables from PDF files and merges PDFs. Use when working with PDF documents."

**Poor description:** "Helps with PDFs."

Valid names: `pdf-processing`, `web-research`, `skill-authoring`  
Invalid: `PDF-Tool`, `-pdf`, `pdf--tool`

## Authoring a new skill

1. Choose a clear, hyphenated **name** and write a **specific description** (activation depends on it).
2. Create the directory: `skills/<name>/`.
3. Write `SKILL.md` with frontmatter and instructions.
4. Add `scripts/`, `references/`, or `assets/` only if they help execution.
5. Call **`refresh_skills`** so the new skill appears in `<available_skills>`.
6. Test by asking for a task that should match the description; **`read`** the skill file when activated.

Use the **`write`** tool (scoped to your workspace) to create and edit files under `skills/`.

## Best practices

- **One capability per skill** — split unrelated workflows into separate skills.
- **Descriptions drive activation** — invest in the `description` field; vague text means the skill is never loaded.
- **Keep SKILL.md lean** — short setup + usage; defer detail to `references/`.
- **Relative paths** — in instructions, reference `scripts/foo.sh` or `references/api.md` relative to the skill directory; resolve them when running commands.
- **Security** — skills can instruct you to run code or visit sites. Review content before trusting third-party or copied skills; do not execute untrusted scripts blindly.
- **Durable vs transient** — skills are for **reusable procedures**; one-off task state belongs in conversation or Identity/User only when appropriate per Mandate.

## Managing skills in this runtime

| Action | How |
|--------|-----|
| List known skills | Call `refresh_skills` (returns names) or read the `<available_skills>` section after refresh |
| Load full instructions | `read` the `<location>` path for the skill |
| Create / edit | `write` under `skills/<name>/` |
| Update prompt index | `refresh_skills` after any change to `skills/` |

Registration metadata (e.g. `pnpm-workspace` on agent-register) is **advertised capability**, not the same as workspace skills loaded from `skills/`.

## Further reading

- [Agent Skills overview](https://agentskills.io/home)
- [Agent Skills specification](https://agentskills.io/specification)
- pi coding-agent skills: `@earendil-works/pi-coding-agent` package `docs/skills.md`
