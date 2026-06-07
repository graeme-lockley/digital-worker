#!/bin/sh
# Prune read gateway mailbox messages from libSQL. Invoked by cron inside agent-gateway.
set -e

DAYS="${GATEWAY_PRUNE_READ_DAYS:-30}"
DB_URL="${LIBSQL_URL:-${GATEWAY_DB_URL:-http://libsql:8080}}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] gateway-prune: older-than-days=${DAYS}"

cd /app/apps/agent-gateway
node dist/prune-read-messages.js --db-url "$DB_URL" --older-than-days "$DAYS"
