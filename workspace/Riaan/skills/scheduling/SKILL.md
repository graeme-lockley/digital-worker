---
name: scheduling
description: Use when creating durable one-shot or recurring agent schedules, inspecting past scheduled runs, or choosing between scheduler events and episodic memory.
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

## Delivery convention (user-facing schedules)

By default, scheduled events are **user-facing**: the scheduler appends a delivery reminder to the stored prompt unless you opt out.

**Default behaviour**

- Prompts get a suffix reminding you to **`send_message` on Telegram** and briefly confirm delivery in reply text.
- Pass **`deliverToChannel`** (e.g. `telegram`) and **`deliverToThreadId`** (Graeme's chat id 8672094762) so the scheduler can **fallback-deliver** the assistant transcript via gateway outbound if you forget to call `send_message`.

**Internal / background tasks**

- Pass **`internalOnly: true`** for housekeeping with no Telegram delivery (no suffix, no fallback).

**Example — daily briefing to Telegram**

```
schedule_event({
  cron: "30 5 * * *",
  timezone: "Africa/Johannesburg",
  model: "deepseek-v4-flash",
  prompt: "Run the daily-news-briefing skill: fetch headlines and send the formatted briefing.",
  deliverToChannel: "telegram",
  deliverToThreadId: "8672094762"
})
```

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

- `fireAt`: ISO-8601 UTC time
- `model`: `deepseek-v4-flash`
- `prompt`: what you want your future self to do when the event fires
- `deliverToChannel` / `deliverToThreadId`: optional fallback for Telegram

## Inspecting runs

After an event fires, use `list_scheduled_runs` with the event id.

## vs memory

| Need | Use |
|------|-----|
| Run code / tools at a specific time | `schedule_event` with cron or fireAt |
| Remember a user preference | `remember` / memory files |
| One-off task in this conversation | Just do it now |
