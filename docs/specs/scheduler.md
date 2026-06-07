# Agent scheduler

Durable scheduling service for digital workers. Agents create one-shot or recurring (5-field cron) events that fire via `POST /api/v1/chat`, stream the agent response into SQLite, and expose a read-only web UI for operators.

## Service

- **App:** `apps/agent-scheduler`
- **Protocol:** `@digital-worker/agent-scheduler-protocol`
- **Default port:** `3003` (API + static UI at `/`)
- **Storage:** SQLite (`scheduler.db` under `--data-dir`)

## Local development

```bash
pnpm install
pnpm build
pnpm --filter @digital-worker/agent-scheduler dev -- \
  --register-url http://127.0.0.1:3001 \
  --data-dir ./data/agent-scheduler
```

Browse `http://127.0.0.1:3003/` for the read-only schedules/runs UI.

## Docker dev-workstation

The Compose stack includes **agent-scheduler** on host port **3003**. **agent-core** is started with `--scheduler-url http://agent-scheduler:3003`, enabling scheduling tools when the scheduler is reachable.

Persistent scheduler data uses the `scheduler-data` volume (`/data` in the container).

## Agent tools (agent-core)

When `--scheduler-url` (or `SCHEDULER_URL`) is set:

| Tool | Action |
|------|--------|
| `schedule_event` | Create one-shot or cron event |
| `list_scheduled_events` | List events for this agent |
| `list_scheduled_runs` | Run history for an event |
| `cancel_scheduled_event` | Cancel an event |

Each event specifies `model` (validated against the target agent roster at create time) and `prompt`. Chat jobs may pass optional `model` on `POST /api/v1/chat` for per-job overrides (restored after the job).

## Cron format

Standard **5-field Vixie cron** only (no seconds):

```
minute hour day-of-month month day-of-week
```

Examples:

- `0 9 * * 1-5` — weekdays at 09:00
- `*/15 * * * *` — every 15 minutes

`timezone` is required for cron schedules (IANA name, e.g. `UTC`, `America/New_York`).

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/api/v1/events` | Create event |
| GET | `/api/v1/events` | List (`?agentId=&status=`) |
| GET | `/api/v1/events/:id` | Event + recent runs |
| DELETE | `/api/v1/events/:id` | Cancel |
| POST | `/api/v1/events/:id/pause` | Pause |
| POST | `/api/v1/events/:id/resume` | Resume |
| GET | `/api/v1/events/:id/runs` | Runs for one event |
| GET | `/api/v1/runs` | All runs (`?agentId=&status=&limit=&offset=`) |
| GET | `/api/v1/runs/:id` | Run detail + parent event |
| GET | `/api/v1/agents` | Distinct agent ids (UI filter) |

## Policies

- **Overlap:** If a previous run is still `running`, the next fire is deferred (default `skip` stacking).
- **Missed fires:** On startup, overdue cron events with `missedPolicy=skip` advance to the next occurrence; `fire-once` leaves the overdue time and fires once on the next tick.
- **Sleeping agents:** Fire is deferred with backoff (30s → 1m → 5m) while the target agent status is `SLEEPING`.
- **Interrupted runs:** If the scheduler dies mid-SSE, stale leases mark associated runs `interrupted` (no automatic retry).

## Security (v1)

No auth on the scheduler API or UI — intended for local/dev-workstation trust boundaries only.

## Related specs

- [agent-core-api](./agent-core-api.md) — chat SSE and optional per-job `model`
- [dev-workstation](../deployment/dev-workstation.md) — Compose wiring
