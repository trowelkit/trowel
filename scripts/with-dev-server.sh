#!/usr/bin/env bash
# Runs a command against an app's Void dev server, then stops the server.
# Usage: scripts/with-dev-server.sh <app-dir> <port> <command...>
# The command gets BASE=http://localhost:<port>. The server log is printed if it fails.
set -u
APP=$1 PORT=$2
shift 2
LOG=$(mktemp)

(cd "$APP" && exec pnpm dev --port "$PORT" --strictPort) > "$LOG" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null; pkill -P "$SERVER" 2>/dev/null; rm -f "$LOG"' EXIT

ready=""
for _ in $(seq 1 120); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" || true)" != "000" ]; then ready=1; break; fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "The dev server in $APP didn't start."
  cat "$LOG"
  exit 1
fi
# Let Vite finish optimizing dependencies found on the first request.
sleep 3

BASE="http://localhost:$PORT" "$@"
status=$?
if [ "$status" -ne 0 ]; then
  echo "--- dev server log ($APP) ---"
  cat "$LOG"
fi
exit "$status"
