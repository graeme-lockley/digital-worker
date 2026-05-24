# Agent workspace

Operator notes for per-agent deployment folders. **Normative spec:** [docs/specs/workspace-identity.md](../docs/specs/workspace-identity.md).

Each digital worker (agent-core process) is deployed with a flat workspace folder:

```
workspace/
  <agentName>/
    MANDATE.md    # Immutable — purpose within the solution
    SOUL.md       # Immutable — temperament and values
    IDENTITY.md   # Mutable — self-knowledge (updated by the agent at runtime)
```

## Build-time folding

Docker and other infra copy `workspace/` into the image (see `infra/dev-workstation/Dockerfile.agent-core`).
At runtime, pass `--workspace-dir` pointing at the agent folder (e.g. `/app/workspace/agent-core`).

## MANDATE.md

Describes this actor's role in the digital-worker solution. **Do not edit at runtime.**
When adding a new agent, copy or author a MANDATE for that deployment; keep copies in sync if multiple agents share the same solution mandate.

## SOUL.md

Defines communication style, constraints, and values. **Do not edit at runtime.**

## IDENTITY.md

Seed with minimal self-description. The agent may update this file via the `update_identity` tool when it learns something durable about itself.
For persistence across container rebuilds, mount this file as a volume in compose (optional).

LLM API keys for Docker dev are set in `.env` at the **project root** (see `.env.example`); that file is gitignored.
