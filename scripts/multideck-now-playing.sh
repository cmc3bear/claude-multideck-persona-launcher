#!/usr/bin/env bash
# "Now playing" popup — shows live Kokoro queue state + recently-played MP3s.
# Called by Ctrl+Shift+N keybinding via display-popup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_ROOT="${DISPATCH_ROOT:-$(dirname "$SCRIPT_DIR")}"
KOKORO_QUEUE_DIR="${DISPATCH_KOKORO_QUEUE_DIR:-$DISPATCH_ROOT/hooks/.kokoro-queue}"
TTS_OUTPUT_DIR="${DISPATCH_TTS_OUTPUT:-$DISPATCH_ROOT/tts-output}"

# Color codes (ANSI 256-color)
C_TEAL=$'\e[38;2;0;255;204m'
C_PINK=$'\e[38;2;255;0;170m'
C_AMBER=$'\e[38;2;255;183;0m'
C_DIM=$'\e[38;2;96;112;144m'
C_BOLD=$'\e[1m'
C_RST=$'\e[0m'

clear
printf '%s┌─ NOW PLAYING ─%.0s' "$C_TEAL" {1..1}
printf '%s%s\n' "$C_TEAL" "$(printf -- '─%.0s' {1..50})" "$C_RST"
printf '\n'

# Queue depths
printf '%s%sQueue depth%s\n' "$C_BOLD" "$C_TEAL" "$C_RST"
for lane in p0 normal spillover; do
  d="$KOKORO_QUEUE_DIR/$lane"
  count=0
  if [[ -d "$d" ]]; then
    count=$(find "$d" -maxdepth 1 -name '*.wav' -type f 2>/dev/null | wc -l | tr -d '[:space:]')
  fi
  if [[ "$count" -gt 0 ]]; then
    color="$C_PINK"
  else
    color="$C_DIM"
  fi
  printf '  %s%-12s%s %s%d wav%s\n' "$color" "$lane" "$C_RST" "$color" "$count" "$C_RST"
done

printf '\n'
printf '%s%sLock state%s\n' "$C_BOLD" "$C_TEAL" "$C_RST"
LOCK="$KOKORO_QUEUE_DIR/lock"
if [[ -d "$LOCK" ]]; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  printf '  %sHELD%s by drainer (age %ss)\n' "$C_AMBER" "$C_RST" "$age"
else
  printf '  %sfree%s\n' "$C_DIM" "$C_RST"
fi

printf '\n'
printf '%s%sRecent TTS output (last 8)%s\n' "$C_BOLD" "$C_TEAL" "$C_RST"
if [[ -d "$TTS_OUTPUT_DIR" ]]; then
  ls -t "$TTS_OUTPUT_DIR"/*.mp3 2>/dev/null | head -8 | while read -r f; do
    name=$(basename "$f")
    size=$(stat -c %s "$f" 2>/dev/null)
    age=$(( $(date +%s) - $(stat -c %Y "$f" 2>/dev/null || echo 0) ))
    if [[ "$age" -lt 60 ]]; then
      ts="${age}s ago"
      color="$C_PINK"
    elif [[ "$age" -lt 3600 ]]; then
      ts="$((age/60))m ago"
      color="$C_TEAL"
    else
      ts="$((age/3600))h ago"
      color="$C_DIM"
    fi
    printf '  %s%-9s%s %s\n' "$color" "$ts" "$C_RST" "$name"
  done
fi

printf '\n%s\n' "$C_DIM(press any key to close)$C_RST"
read -n 1 -s
