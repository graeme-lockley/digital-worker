#!/bin/sh
# Relaunch agent-core when it exits with RESTART_EXIT_CODE (75) after /restart.
# Do not use set -e here: a non-zero exit from "$@" must be captured, not fatal.

RESTART_EXIT=75

while true; do
  "$@"
  code=$?
  if [ "$code" -eq "$RESTART_EXIT" ]; then
    echo "agent-core: restart requested, starting again..."
    continue
  fi
  exit "$code"
done
