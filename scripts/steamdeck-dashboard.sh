#!/usr/bin/env bash
# MultiDeck dashboard windowed shortcut
# Opens the dashboard in Chromium app-mode (windowed, no kiosk).
#
# v0.7.3+ design: audio playback is in-server (no separate daemon).
# Dashboard lifecycle is independent of this script — we only start it
# if not already responding, and we do NOT kill it on exit. Chromium is
# exec'd so this script's PID becomes the chromium session.
set -e

ENV_FILE="$HOME/.config/multideck/env"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

PORT="${DISPATCH_PORT:-3046}"
URL="http://localhost:${PORT}/"
LOG_DIR="$HOME/.cache/multideck"
BOX="${MULTIDECK_BOX:-multideck-box}"
mkdir -p "$LOG_DIR"

# Strip Steam's 32-bit overlay LD_PRELOAD (breaks our 64-bit Chromium)
unset LD_PRELOAD

# Ensure dashboard is running inside the container (detached)
if ! curl -fsS -o /dev/null --max-time 3 "$URL"; then
  echo "[dashboard-shortcut] dashboard not responding, starting it"
  distrobox enter "$BOX" -- bash -lc \
    "cd '${DISPATCH_ROOT:-$HOME/multideck}' && setsid nohup node dashboard/server.cjs > '$LOG_DIR/dashboard.log' 2>&1 < /dev/null &"
  for i in $(seq 1 30); do
    sleep 1
    curl -fsS -o /dev/null --max-time 2 "$URL" && break
  done
fi

# Remove legacy systemd audio daemon if still installed (v0.7+ folded into server)
systemctl --user is-enabled multideck-audio.service >/dev/null 2>&1 && \
  systemctl --user disable --now multideck-audio.service >/dev/null 2>&1 || true

# Launch Chromium windowed (NOT kiosk) — app-mode for clean look
PROFILE="$LOG_DIR/chromium-dashboard-profile"
mkdir -p "$PROFILE"
exec distrobox enter "$BOX" -- bash -lc "exec chromium \
  --user-data-dir='$PROFILE' \
  --no-first-run \
  --noerrdialogs \
  --use-fake-ui-for-media-stream \
  --disable-pinch \
  --autoplay-policy=no-user-gesture-required \
  --enable-features=OverlayScrollbar \
  --app='$URL'"
