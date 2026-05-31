#!/bin/sh
# POST maintain_memory to local agent-core. Invoked by cron inside the container.
set -e

SCOPE="${1:-weekly}"
HOST="${AGENT_CORE_HOST:-127.0.0.1}"
PORT="${AGENT_CORE_PORT:-3000}"
URL="http://${HOST}:${PORT}/api/v1/command"

echo "[$(date -Iseconds)] memory-maintenance: scope=${SCOPE}"

RESPONSE=$(curl -sf -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"maintain_memory\",\"clientId\":\"cron\",\"scope\":\"${SCOPE}\"}" \
  2>&1) || {
  echo "[$(date -Iseconds)] memory-maintenance: failed — agent-core may not be ready"
  exit 0
}

echo "[$(date -Iseconds)] memory-maintenance: ${RESPONSE}"
