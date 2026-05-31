# Build state

Living snapshot of what this repository implements. Update this file when features land or priorities shift.

**Last updated:** 2026-05-31

## Summary

The dev-workstation stack runs **agent-register** (discovery + heartbeat) and **agent-core** (LLM worker with workspace identity). **agent-tui** provides a terminal chat client. Chat uses SSE streaming backed by [pi-agent-core](https://github.com/earendil-works/pi).

## Feature matrix

| Area | Status | Spec | Code |
|------|--------|------|------|
| Agent registration & list | **Done** | [agent-register-api](./specs/agent-register-api.md) | `apps/agent-register` |
| Heartbeat polling (`AVAILABLE` / `SLEEPING`) | **Done** | [agent-register-api](./specs/agent-register-api.md) | `apps/agent-register` |
| Agent heartbeat endpoint | **Done** | [agent-core-api](./specs/agent-core-api.md) | `apps/agent-core` |
| Chat SSE + LLM (DeepSeek default) | **Done** | [chat-streaming](./specs/chat-streaming.md) | `apps/agent-core` |
| Worker runtime (FIFO, single Agent) | **Done** | [worker-runtime](./specs/worker-runtime.md) | `apps/agent-core/src/worker-runtime.ts` |
| Workspace identity (MANDATE/SOUL/IDENTITY) | **Done** | [workspace-identity](./specs/workspace-identity.md) | `apps/agent-core/src/workspace/` |
| `update_identity` / `update_user` tools | **Done** | [workspace-identity](./specs/workspace-identity.md) | `apps/agent-core/src/tools/` |
| Builtin pi tools (`read`, `write`, `bash`, `ls`) | **Done** | [worker-runtime](./specs/worker-runtime.md) | `apps/agent-core/src/llm-agent.ts` |
| Web browsing (`agent_browser`) | **Done** | [web-browsing](./specs/web-browsing.md) | `pi-agent-browser-native` via `createAgentSession` |
| Terminal chat UI | **Done** | [chat-streaming](./specs/chat-streaming.md) | `apps/agent-tui` |
| Docker dev-workstation | **Done** | [dev-workstation](./deployment/dev-workstation.md) | `infra/dev-workstation/` |
| Project-root `.env` for API keys | **Done** | [dev-workstation](./deployment/dev-workstation.md) | `package.json` `docker:dev` |
| Inter-agent message delivery | **Not started** | [roadmap](./roadmap.md) | Types in `agent-core-protocol` only |
| Command queue (`/status`, `/abandon`, `/restart`, `/shutdown`) | **Done** | [agent-core-api](./specs/agent-core-api.md), [worker-runtime](./specs/worker-runtime.md) | `apps/agent-core`, `apps/agent-tui` |
| Priority / judgment dequeue | **Not started** | [roadmap](./roadmap.md) | FIFO only today |
| Skills loaded from markdown | **Done** | [skills](./specs/skills.md) | `SkillRegistry`, `refresh_skills` |
| Register persistence | **Not started** | [roadmap](./roadmap.md) | In-memory store |
| Workspace bind mount (Docker dev) | **Done** | [workspace-identity](./specs/workspace-identity.md) | `infra/dev-workstation/docker-compose.yml` (`./workspace/Aida`) |

## Protocol packages

| Package | Role | Stable for consumers? |
|---------|------|---------------------|
| `@digital-worker/agent-register-protocol` | Register HTTP shapes | Yes — apps depend on it |
| `@digital-worker/agent-core-protocol` | Agent HTTP + chat SSE shapes | Yes — apps depend on it |

## Runtime requirements

| Component | Node.js | Notes |
|-----------|---------|-------|
| agent-register | ≥ 20 | Alpine 22 in Docker |
| agent-core | **≥ 22.19** | Required by `@earendil-works/pi-agent-core`; Docker image includes `agent-browser` + Chrome |
| agent-tui | ≥ 20 | Ink + fetch |

## Known gaps

- **Local `pnpm dev` for agent-core** does not auto-load `.env`; export `DEEPSEEK_API_KEY` or pass `--api-key` (see [local-development](./deployment/local-development.md)).
- **Second chat request while busy** queues and holds the HTTP connection until the job runs (by design; see [worker-runtime](./specs/worker-runtime.md)).
- **DeliverMessage** routes are specified in types only; no HTTP handler exists yet.
