---
name: live-event-tracker
description: Schedule and manage live sports event score checks with configurable intervals. Use when Graeme asks for follow-up score updates or when setting up recurring match tracking.
---

# Live Event Tracker

This skill handles the pattern of scheduling one-shot score checks for live sports, then following up at regular intervals until the match finishes.

## Pattern

When Graeme asks about a live sports score:

1. **Initial check** — Do it immediately using `agent_browser` and the `sports-score-checker` skill
2. **Send result** — Reply directly in the conversation turn (automatic delivery on Telegram)
3. **Schedule follow-up** — Use `schedule_event` with a `fireAt` ~15 minutes later
4. **Interval checks** — Each follow-up repeats steps 1-3 until the match is complete
5. **Final result** — Send the final scoreline via `send_message` and cancel any remaining scheduled events

## Interval guidelines

| Sport | Suggested interval | Reasoning |
|-------|-------------------|-----------|
| Tennis (Grand Slam final) | 15 minutes | Sets can end quickly; Graeme prefers tighter intervals |
| Rugby sevens | 15–20 minutes | Short matches (~14 min halves), fast turnaround |
| Golf (round in progress) | 30–60 minutes | Slower pace; scores change gradually |
| Golf (final round/stretch) | 15 minutes | Tighter leaderboard drama |

Graeme's preference: **15 minutes** for live tennis finals.

## Follow-up prompt structure

Each scheduled follow-up prompt should include:
- The current score/state (from previous check)
- Clear instructions to check again and compare
- The Telegram chat ID (8672094762)
- Instruction to cancel remaining events if match is finished

Example prompt template:

```
It's [TIME] SAST — check the [EVENT] score between [PLAYER1] and [PLAYER2].
At [PREVIOUS_TIME], [PLAYER] was leading [SCORE_SITUATION].
Use agent_browser to find the current score or final result.
Send the result to Graeme on Telegram (chat ID 8672094762) with full match details.
If the match is finished, include full scoreline and winner.
If still ongoing, send the live score.
Remember the result in today's daily log.
Cancel any remaining scheduled events if the match is complete.
```

## Cancellation

When the match is complete:
1. Send final result to Graeme via `send_message`
2. Cancel any pending follow-up events with `cancel_scheduled_event`
3. Log the final result in daily memory under Facts

## Scheduling notes

- Use ISO-8601 UTC for `fireAt`: SAST is UTC+2, so 16:10 SAST = 14:10 UTC
- Model: use `deepseek-v4-flash`
- After creating, use `list_scheduled_events` to verify it's active
- After the event fires, use `list_scheduled_runs` with event ID to inspect transcripts if needed

## Multi-sport awareness

If multiple live events are being tracked simultaneously, keep a mental note of each event's event ID and status. Use `list_scheduled_events` to audit what's still pending.

## Conversation flow

When Graeme asks for a follow-up time adjustment:
1. `cancel_scheduled_event` on the existing event
2. Create a new event with the corrected `fireAt`
3. Confirm the change to Graeme
