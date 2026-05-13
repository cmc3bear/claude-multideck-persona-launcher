#!/usr/bin/env bash
# MultiDeck audio-feed daemon
# Polls dashboard /audio-feed/list and plays new MP3s via ffplay+PipeWire.
set -u
PORT="${DISPATCH_PORT:-3046}"
HOST="${MULTIDECK_HOST:-localhost}"
BASE="http://${HOST}:${PORT}"
SEEN="$HOME/.cache/multideck/audio-seen.txt"
LOG="$HOME/.cache/multideck/audio-daemon.log"
mkdir -p "$HOME/.cache/multideck"
touch "$SEEN"

log() { echo "[$(date -Is)] $*" >> "$LOG"; }
log "daemon start; polling $BASE/audio-feed/list every 4s"

while true; do
  files_json=$(curl -fsS --max-time 5 "$BASE/audio-feed/list" 2>/dev/null) || { sleep 4; continue; }
  echo "$files_json" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for entry in d.get(\"files\", []):
        if isinstance(entry, str):
            print(entry)
        elif isinstance(entry, dict):
            # server returns {filename, size, mtime}; accept variants
            print(entry.get(\"filename\") or entry.get(\"file\") or entry.get(\"name\") or entry.get(\"url\",\"\"))
except Exception as e:
    pass
" | while read -r fname; do
    [ -z "$fname" ] && continue
    fname="${fname#*/audio-feed/mp3/}"
    if ! grep -qFx "$fname" "$SEEN"; then
      log "new: $fname — fetching + playing"
      tmpfile=$(mktemp --suffix=.mp3)
      if curl -fsS --max-time 30 "$BASE/audio-feed/mp3/$fname" -o "$tmpfile"; then
        ffplay -nodisp -autoexit -loglevel quiet "$tmpfile" 2>>"$LOG"
        log "played: $fname"
      else
        log "fetch failed: $fname"
      fi
      rm -f "$tmpfile"
      echo "$fname" >> "$SEEN"
    fi
  done
  sleep 4
done
