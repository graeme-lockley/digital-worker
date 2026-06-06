---
name: telegram
description: Read and send Telegram messages via the agent-gateway mailbox. Use when notified of new Telegram messages or when proactively messaging Graeme.
---

# Telegram Messaging Skill

## Overview

Telegram is handled by **agent-gateway** — not directly by this workspace. The gateway stores inbound messages in a mailbox and notifies you when new ones arrive. You decide when to read and respond.

## Configuration

Gateway URL is provided by the environment:

```bash
echo "$GATEWAY_URL"   # e.g. http://agent-gateway:3002 (Docker) or http://127.0.0.1:3002 (local)
```

No bot tokens or chat IDs live in the workspace. Credentials are configured on the gateway only.

## Read unread messages

When you receive a doorbell notification ("you have N new Telegram message(s)"), pull the mailbox:

```bash
curl -s "$GATEWAY_URL/api/v1/messages"
```

Returns JSON: `{ "messages": [...], "unreadCount": N }`. Reading marks messages as read.

To preview without marking read (Phase 2):

```bash
curl -s "$GATEWAY_URL/api/v1/messages?peek=true"
```

Then acknowledge explicitly:

```bash
curl -s -X POST "$GATEWAY_URL/api/v1/ack" \
  -H "Content-Type: application/json" \
  -d '{"ids":["telegram-42"]}'
```

Prefer the **`check_messages`** and **`send_message`** tools when available — they wrap these endpoints.

## Send a message

```bash
curl -s -X POST "$GATEWAY_URL/api/v1/outbound" \
  -H "Content-Type: application/json" \
  -d '{"channel":"telegram","text":"Your message here"}'
```

Optional `threadId` (chat id) if replying in a specific thread; defaults to the configured allowlisted chat.

## When to use

- After a doorbell notification about new Telegram messages
- Proactive updates (news, alerts, task completion)
- Replying to Graeme on Telegram

## Note

Do not log or write gateway URLs with embedded secrets. The gateway holds all Telegram credentials.
