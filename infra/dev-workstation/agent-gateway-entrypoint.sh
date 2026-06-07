#!/bin/sh
# Starts cron (mailbox prune) and agent-gateway.
set -e

start_cron() {
  if command -v crond >/dev/null 2>&1 && [ -f /etc/crontabs/root ]; then
    echo "agent-gateway-entrypoint: starting crond..."
    crond -b -l 8
  fi
}

start_cron

exec "$@"
