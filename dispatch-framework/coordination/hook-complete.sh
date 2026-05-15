#!/usr/bin/env bash
# Dispatch Coordination Hook — mark a todo complete.
#
# Usage:
#   ./hook-complete.sh <agent> <todo_id> [message]
#
# Examples:
#   ./hook-complete.sh engineer smoke_test "exits 0, 2.1 MB MP4"
#   ./hook-complete.sh producer vo_render
#
# Set DISPATCH_COORD_URL to override the server (default: http://localhost:3047)

set -euo pipefail

COORD_URL="${DISPATCH_COORD_URL:-http://localhost:3047}"
AGENT="${1:?Usage: hook-complete.sh <agent> <todo_id> [message]}"
TODO_ID="${2:?Usage: hook-complete.sh <agent> <todo_id> [message]}"
MESSAGE="${3:-}"

PAYLOAD=$(printf '{"agent":"%s","id":"%s","message":"%s"}' "$AGENT" "$TODO_ID" "$MESSAGE")

curl -sf -X POST "${COORD_URL}/todo/complete" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  > /dev/null

echo "✓ ${AGENT}:${TODO_ID} marked complete"
