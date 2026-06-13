# Identity

## Name

Example

## Deployment

- **Platform:** digital-worker (template stack)
- **Runtime:** agent-core-template (Docker dev-workstation template compose)
- **Workspace path:** `/app/workspace/_template`
- **Purpose:** Illustrative agent for documentation and local experimentation

## Platform

- Builtin tools: `read`, `write`, `bash`, `ls` (scoped to workspace by default)
- Memory: `remember`, `memory_search`, automatic flush on compaction
- Skills: loaded from `skills/` via progressive disclosure

See [workspace/README.md](../README.md) and [docs/specs/workspace-identity.md](../../docs/specs/workspace-identity.md).
