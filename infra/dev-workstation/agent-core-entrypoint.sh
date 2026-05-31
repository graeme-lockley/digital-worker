#!/bin/sh
# Orchestrates Ollama (local embeddings), cron (memory maintenance), and agent-core.
set -e

OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-nomic-embed-text}"

start_ollama() {
  if command -v ollama >/dev/null 2>&1; then
    echo "agent-core-entrypoint: starting ollama serve..."
    ollama serve >/tmp/ollama.log 2>&1 &
    OLLAMA_PID=$!
    i=0
    while [ "$i" -lt 60 ]; do
      if curl -sf "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
        echo "agent-core-entrypoint: ollama ready"
        if ! ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
          echo "agent-core-entrypoint: pulling $OLLAMA_MODEL..."
          ollama pull "$OLLAMA_MODEL" || true
        fi
        return 0
      fi
      i=$((i + 1))
      sleep 1
    done
    echo "agent-core-entrypoint: warning — ollama did not become ready in time"
  else
    echo "agent-core-entrypoint: ollama not installed; distill dedup will use heuristic fallback"
  fi
}

start_cron() {
  if command -v crond >/dev/null 2>&1 && [ -f /etc/cron.d/aida-memory ]; then
    echo "agent-core-entrypoint: starting crond..."
    crond -f -l 8 >/tmp/cron.log 2>&1 &
  elif command -v cron >/dev/null 2>&1 && [ -f /etc/cron.d/aida-memory ]; then
    echo "agent-core-entrypoint: starting cron..."
    cron >/tmp/cron.log 2>&1 &
  fi
}

if [ -f /etc/agent-browser.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/agent-browser.env
  set +a
fi

start_ollama
start_cron

exec /app/apps/agent-core/restart-loop.sh "$@"
