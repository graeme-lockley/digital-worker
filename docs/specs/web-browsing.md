# Web browsing specification

Normative behaviour for **agent_browser** — human-like web access for digital workers.

**Implementation:** `apps/agent-core/src/llm-agent.ts`, `apps/agent-core/src/tools/pi-browser-plugin.ts`

**Operator guide:** [dev-workstation](../deployment/dev-workstation.md) (Docker image includes Chrome)

## Overview

Aida reaches the public web through pi's native **`agent_browser`** tool, registered by the **[pi-agent-browser-native](https://www.npmjs.com/package/pi-agent-browser-native)** Pi extension. The extension wraps the **[agent-browser](https://agent-browser.dev/)** CLI (Vercel Labs), which drives headless **Chrome for Testing**.

This is not HTTP fetch: the agent opens real pages, runs JavaScript, interacts with forms, and captures screenshots.

## Plugin architecture

agent-core embeds pi via **`createAgentSession()`** and **`DefaultResourceLoader`** (not the pi CLI):

| Piece | Role |
|-------|------|
| `DefaultResourceLoader` | Loads the extension from `pi-agent-browser-native` via `additionalExtensionPaths`; `noExtensions: true` prevents unrelated discovery from `~/.pi` or `.pi/` |
| `systemPromptOverride` | Preserves workspace MANDATE/SOUL/IDENTITY/USER composition |
| `createAgentSession({ tools: [...] })` | Allowlists `agent_browser` alongside builtins and custom tools |
| `AuthStorage.inMemory()` + `setRuntimeApiKey` | LLM credentials (replaces raw `new Agent({ getApiKey })`) |

Extension entry path: `node_modules/pi-agent-browser-native/extensions/agent-browser/index.ts` (resolved at startup).

## Tool surface

| Tool | Source | Typical use |
|------|--------|-------------|
| `agent_browser` | pi-agent-browser-native extension | `open`, `snapshot -i`, `click @eN`, `fill`, `screenshot`, auth profiles |

The model receives compact page snapshots with `@e1`, `@e2` refs for follow-up actions. See upstream [TOOL_CONTRACT](https://github.com/fitchmultz/pi-agent-browser-native/blob/main/docs/TOOL_CONTRACT.md).

## CLI flags

| Flag | Default | Effect |
|------|---------|--------|
| `--no-browser` | off (browser **enabled**) | Skip extension load; omit `agent_browser` from the tool allowlist |

Tests and local dev without Chrome should pass `--no-browser`.

## Docker runtime

The **agent-core** image (`infra/dev-workstation/Dockerfile.agent-core`) uses **`node:22-bookworm-slim`** (not Alpine) because Chrome requires glibc and apt libraries.

Build-time steps:

1. `npm install -g agent-browser`
2. **amd64:** `agent-browser install --with-deps` — Chrome for Testing + system dependencies
3. **arm64:** install Debian `chromium` and set `AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium` (Chrome for Testing has no Linux ARM64 build)

The `agent-browser` binary must be on `PATH` at runtime (satisfied by global install). On ARM64 images, [`agent-core-restart-loop.sh`](../../infra/dev-workstation/agent-core-restart-loop.sh) sources `/etc/agent-browser.env` before starting the worker.

## Workspace side effects

Pi settings for the isolated loader live under **`<tools-cwd>/.agent-core-pi/`** (gitignored). Browser session artifacts may appear under `/tmp` per agent-browser defaults.

## Boundaries

- Browser access is a **tool**, consistent with [workspace-identity](./workspace-identity.md) Mandate boundaries.
- Operators are responsible for sites the agent visits and any credentials stored in browser profiles.
- Remote browser providers (Kernel/CDP) are out of scope; this spec covers in-container headless Chrome only.
