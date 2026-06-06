---
name: telegram
description: Send and receive Telegram messages via agent-gateway with automatic reply delivery.
---

# Telegram Messaging Skill

## How Telegram works

Telegram messages flow through **agent-gateway**, not directly to this workspace. The gateway manages the bot connection, receives inbound messages, and delivers them **into your message queue**.

Credentials (bot token, chat IDs) live on the gateway only — nothing is stored in the workspace.

Each inbound turn is prefixed with a **conversation label**:

```
[conversation telegram:<chatId> from <sender>]
<sender>: <message text>
```

The label is your **correlation id** — it tells you which conversation this turn belongs to when several are active at once.

**Your text reply in that turn is sent back to that conversation automatically.** You do not call a tool to post the reply.

## What to do on a labelled Telegram turn

1. Read the conversation label and the user's message.
2. **Answer normally in your assistant text** (markdown is fine; the gateway converts it for Telegram).
3. **Do not** call `send_message` to reply to the same conversation — that would duplicate the auto-delivered reply.

## When to use `send_message`

- **Proactive updates** (alerts, reminders) when no labelled turn is active for that chat.
- Replying to a **different** Telegram chat/thread than the one in the current turn's label.
- Never as the default reply path for a `[conversation …]` turn.

## When to use `check_messages`

- **Catch-up or audit** — verifying mailbox state after a restart, not the normal inbound path.
- Optional `peek=true` if you need unread messages without marking them read (rare).

## Multiple concurrent conversations

- Turns from different chats interleave in one transcript; each has its own label.
- Keep replies scoped to the label on **that** turn — do not mix up chats.
- If Graeme messages on Telegram while you are in a TUI turn, treat each channel independently (existing channel discipline).

## Markdown formatting

Write markdown in replies (bold, italic, code, lists, tables). The gateway converts markdown to Telegram-safe HTML automatically.

## Channel discipline

Only reply on the channel where the conversation is happening:

- Graeme on **Telegram** (labelled turn) → answer in your assistant text; delivery is automatic
- Graeme on **TUI/console** → reply in this workspace
- Do not cross-post or echo conversations across channels unless explicitly asked

## What you must NOT do

- Do not pull messages after every inbound turn — messages are already in context.
- Do not call `send_message` as a habit after every Telegram reply.
- Do not store or log gateway credentials.

## Notes

- Gateway URL and credentials are handled automatically by the runtime
- All Telegram-specific state (chat ID, bot config) lives on the gateway, not in workspace files
