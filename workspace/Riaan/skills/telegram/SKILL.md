---
name: telegram
description: Send and receive Telegram messages via agent-gateway with automatic reply delivery.
---

# Telegram Messaging Skill

## How Telegram works

Telegram messages flow through **agent-gateway**. Inbound messages for **@RiaanDigitalBot** (`riaandigitalbot`) are delivered into your message queue and notify **agent-core-riaan** directly.

Each inbound turn is prefixed with a **conversation label** (correlation id includes the bot routing id):

```
[conversation telegram:riaandigitalbot:<chatId> from <sender>]
<sender>: <message text>
```

Multi-bot routing is configured in `infra/dev-workstation/gateway-telegram-bots.json` — load the **`gateway-telegram`** skill when changing bots or wiring new agents.

**Your text reply in that turn is sent back to that conversation automatically.** You do not call a tool to post the reply.

## What to do on a labelled Telegram turn

1. Read the conversation label and the user's message.
2. **Answer normally in your assistant text** (markdown is fine; the gateway converts it for Telegram).
3. **Do not** call `send_message` to reply to the same conversation — that would duplicate the auto-delivered reply.

## When to use `send_message`

- **Proactive updates** (alerts, reminders, scheduled briefings) when no labelled turn is active — use `send_message` with `channel: "telegram"` (defaults to your `--telegram-bot-id`, e.g. **riaandigitalbot**).
- Replying to a **different** Telegram chat/thread than the one in the current turn's label.
- Never as the default reply path for a `[conversation …]` turn.

## When to use `check_messages`

- **Catch-up or audit** — verifying mailbox state after a restart.

## Multiple concurrent conversations

- Turns from different chats interleave in one transcript; each has its own label.
- Keep replies scoped to the label on **that** turn — do not mix up chats.
- If Aida forwards a query via inter-agent message, treat it as high priority.

## Markdown formatting

Write markdown in replies (bold, italic, code, lists, tables). The gateway converts markdown to Telegram-safe HTML automatically.

## Channel discipline

Only reply on the channel where the conversation is happening.

## What you must NOT do

- Do not pull messages after every inbound turn — messages are already in context.
- Do not call `send_message` as a habit after every Telegram reply.
- Do not store or log gateway credentials.
