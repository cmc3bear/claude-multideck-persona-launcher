#!/usr/bin/env bash
# Emit a compact status fragment for tmux status-right, capturing live
# MultiDeck system metrics:
#   K:N     Kokoro queue depth (sum of p0+normal+spillover wav counts)
#   R:M     Pending Redline reviews (count of files in state/pending-reviews/)
#   *X      Attached client count (only if >1)
#
# Bound to status-right via #(...) in multideck.tmux.conf, called every
# status-interval seconds (default 5).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_ROOT="${DISPATCH_ROOT:-$(dirname "$SCRIPT_DIR")}"
KOKORO_QUEUE_DIR="${DISPATCH_KOKORO_QUEUE_DIR:-$DISPATCH_ROOT/hooks/.kokoro-queue}"
PENDING_REVIEWS_DIR="${DISPATCH_PENDING_REVIEWS_DIR:-$DISPATCH_ROOT/state/pending-reviews}"

count_dir() {
  local d="$1" pat="${2:-}"
  [[ -d "$d" ]] || { echo 0; return; }
  if [[ -n "$pat" ]]; then
    find "$d" -maxdepth 1 -type f -name "$pat" 2>/dev/null | wc -l | tr -d '[:space:]'
  else
    find "$d" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d '[:space:]'
  fi
}

KOKORO_DEPTH=0
for lane in p0 normal spillover; do
  n="$(count_dir "$KOKORO_QUEUE_DIR/$lane" '*.wav')"
  KOKORO_DEPTH=$((KOKORO_DEPTH + n))
done

PENDING="$(count_dir "$PENDING_REVIEWS_DIR" '*.json')"

OUT=""
if [[ "$KOKORO_DEPTH" -gt 0 ]]; then
  OUT+="#[fg=#FF00AA]K:${KOKORO_DEPTH} "
fi
if [[ "$PENDING" -gt 0 ]]; then
  OUT+="#[fg=#FFB700]R:${PENDING} "
fi
printf '%s' "$OUT"
