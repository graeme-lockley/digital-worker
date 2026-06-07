---
name: scheduling
description: >-
  Use when creating durable one-shot or recurring agent schedules, inspecting
  past scheduled runs, or choosing between scheduler events and episodic memory.
---

# Scheduling (agent-scheduler)

Use **scheduler tools** when a task must run at a specific time or on a cron, survive restarts, and leave an inspectable transcript. Use **memory** (`remember`, daily logs) for facts and context — not as a substitute for timed execution.

## Tools

| Tool | When |
|------|------|
| `schedule_event` | Create a one-shot (`fireAt`) or recurring (`cron`) event |
| `list_scheduled_events` | See your agent's schedules |
| `list_scheduled_runs` | Inspect run history and transcripts for an event |
| `cancel_scheduled_event` | Stop future fires |

Requires `--scheduler-url` / `SCHEDULER_URL` (set in Docker dev-workstation).

## Delivery convention (user-facing schedules)

By default, scheduled events are **user-facing**: the scheduler appends a delivery reminder to the stored prompt unless you opt out.

**Default behaviour**

- Prompts get a suffix reminding you to **`send_message` on Telegram** and briefly confirm delivery in reply text.
- Pass **`deliverToChannel`** (e.g. `telegram`) and **`deliverToThreadId`** (Graeme's chat id) so the scheduler can **fallback-deliver** the assistant transcript via gateway outbound if you forget to call `send_message`.
- The operator UI at **http://localhost:3003/** shows a **Delivery** column (`Agent sent`, `Scheduler sent`, `Not detected`, etc.).

**Internal / background tasks**

- Pass **`internalOnly: true`** for housekeeping with no Telegram delivery (no suffix, no fallback).

**Example — recurring reminder to Telegram**

```
schedule_event({
  cron: "0 9 * * 1-5",
  timezone: "Africa/Johannesburg",
  model: "deepseek-v4-flash",
  prompt: "Review open threads in memory; send Graeme a brief follow-up on Telegram if anything needs attention.",
  deliverToChannel: "telegram",
  deliverToThreadId: "8672094762"
})
```

News and sports schedules (daily briefing, live score checks) belong to **Riaan** — use `send_to_agent` to ask him to create or adjust them, not these skills locally.

## Cron examples (5-field, with timezone)

```
0 9 * * 1-5     # weekdays 09:00
0 8 * * *       # daily 08:00
*/30 * * * *    # every 30 minutes
0 0 1 * *       # first day of month, midnight
```

Always pass `timezone` with cron (e.g. `UTC`, `Africa/Johannesburg`).

## One-shot example

Schedule a reminder for a specific ISO time:

- `fireAt`: `2026-06-10T14:00:00.000Z`
- `model`: a roster model id (e.g. `deepseek-v4-flash`)
- `prompt`: what you want your future self to do when the event fires
- `deliverToChannel` / `deliverToThreadId`: optional fallback for Telegram

## Inspecting runs

After an event fires, use `list_scheduled_runs` with the event id. Operators can also browse **http://localhost:3003/** (schedules, runs, full prompt + transcript + delivery hint).

## Overlap and frequency

The worker processes chat serially. Avoid sub-minute cron; `*/5 * * * *` or coarser is more reliable. If a run is still in progress at the next fire, the scheduler defers (does not stack).

## vs memory

| Need | Use |
|------|-----|
| Run code / tools at 9am Monday | `schedule_event` with cron |
| Remember a user preference | `remember` / memory files |
| One-off task in this conversation | Just do it now |
