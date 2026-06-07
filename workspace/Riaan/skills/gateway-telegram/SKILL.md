---
name: gateway-telegram
description: Configure agent-gateway Telegram bot routing (JSON bot list, tokenEnv, agentCoreUrl, botId). Use when adding a Telegram bot, wiring a new agent to the gateway, troubleshooting inbound/outbound routing, or explaining correlation ids and send_message botId.
---

# Gateway Telegram configuration

**agent-gateway** routes one or more Telegram bots to **agent-core** instances. Bot routes are **fully configurable** — not hardcoded in gateway source.

Normative spec: `docs/specs/gateway.md` (monorepo). Dev-workstation example: `infra/dev-workstation/gateway-telegram-bots.json`.

## Config sources (priority)

1. **`GATEWAY_TELEGRAM_BOTS_FILE`** or `--telegram-bots-file` — path to a JSON file
2. **`GATEWAY_TELEGRAM_BOTS`** or `--telegram-bots` — inline JSON array
3. **Legacy** — single bot from `TELEGRAM_BOT_TOKEN` + `AGENT_CORE_URL` (botId defaults to `GATEWAY_DEFAULT_BOT_ID` / `TELEGRAM_BOT_ID` / `default`)

Docker dev-workstation mounts `infra/dev-workstation/gateway-telegram-bots.json` and passes `--telegram-bots-file`.

## Bot route JSON

Array of objects:

| Field | Required | Purpose |
|-------|----------|---------|
| `botId` | yes | Stable routing id (lowercase, digits, hyphens; 2–64 chars). Used in correlation ids and `send_message`. |
| `agentCoreUrl` | yes | agent-core base URL for inbound notify (`POST /api/v1/notify`) |
| `tokenEnv` | yes* | Name of env var holding the Bot API **secret** (preferred) |
| `token` | yes* | Inline token — **tests only**; never commit |

\* One of `tokenEnv` or `token` per entry.

Example (dev-workstation):

```json
[
  {
    "botId": "aidadigitalbot",
    "tokenEnv": "TELEGRAM_AIDADIGITALBOT_TOKEN",
    "agentCoreUrl": "http://agent-core-aida:3000"
  },
  {
    "botId": "riaandigitalbot",
    "tokenEnv": "TELEGRAM_RIAANDIGITALBOT_TOKEN",
    "agentCoreUrl": "http://agent-core-riaan:3000"
  }
]
```

Set each `tokenEnv` value in project-root `.env` (gitignored). **Never** put tokens in workspace files or the JSON route file.

Shared allowlist: **`TELEGRAM_ALLOWED_CHAT_IDS`** (comma-separated; all bots use the same list).

Optional: **`GATEWAY_LEGACY_BOT_ID`** — maps pre-migration mailbox rows/offsets without `botId` (default: first configured bot).

## Add a new bot + agent (checklist)

1. Create the Telegram bot via BotFather; add `tokenEnv` secret to `.env`.
2. Add a route object to `gateway-telegram-bots.json` (`botId`, `tokenEnv`, `agentCoreUrl`).
3. Add an **agent-core** service in `infra/dev-workstation/docker-compose.yml` (or point `agentCoreUrl` at an existing instance).
4. Start that agent with matching **`--telegram-bot-id <botId>`** (or `TELEGRAM_BOT_ID` env) so proactive `send_message` uses the correct bot.
5. Restart **agent-gateway** (and new agent-core) so long-poll and notify routing pick up the config.

## Runtime behaviour

- **Inbound:** gateway long-polls each configured bot → notifies the matching `agentCoreUrl` → turn label uses correlation id `telegram:{botId}:{chatId}`.
- **Auto-reply:** assistant text on a labelled turn is delivered via the same bot (no `send_message`).
- **Proactive outbound:** `send_message` with `channel: "telegram"`, `threadId`, and optional `botId` (defaults to this agent's `--telegram-bot-id`). When multiple bots exist, gateway requires a resolvable `botId`.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Bot never receives messages | Token env set? Chat id in `TELEGRAM_ALLOWED_CHAT_IDS`? Gateway logs? |
| Wrong agent answers | `agentCoreUrl` in JSON matches the intended agent-core service |
| Proactive send fails | Agent `--telegram-bot-id` matches route `botId`; `botId` passed if needed |
| Reply goes to wrong bot | Correlation id must include the inbound bot's `botId` |

Gateway health: `http://127.0.0.1:3002/health` — metadata at `GET /api/v1` lists configured `telegramBots`.

## Related skills

- **`telegram`** — channel turn behaviour, when to use `send_message` vs auto-reply
- **`skill-authoring`** — if documenting new procedures as workspace skills

After editing workspace skills, call **`refresh_skills`**.
