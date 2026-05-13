#!/usr/bin/env bash
# MultiDeck dashboard windowed shortcut
# Opens the dashboard in Chromium app-mode (windowed, no kiosk).
# Audio playback handled separately by multideck-audio.service.
set -e
ENV_FILE="$HOME/.config/multideck/env"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
PORT="${DISPATCH_PORT:-3046}"
URL="http://localhost:${PORT}/"
LOG_DIR="$HOME/.cache/multideck"
mkdir -p "$LOG_DIR"

# Ensure dashboard is running inside the container
if ! curl -fsS -o /dev/null --max-time 3 "$URL"; then
  echo "[dashboard-shortcut] dashboard not running, starting it"
  distrobox enter "${MULTIDECK_BOX:-multideck-box}" -- bash -lc "
    cd \$DISPATCH_ROOT
    nohup env DISPATCH_PORT=$PORT DISPATCH_ROOT=\$DISPATCH_ROOT \
      DISPATCH_KOKORO_VENV=\$DISPATCH_KOKORO_VENV \
      DISPATCH_LAUNCHER_TRANSPORT=\$DISPATCH_LAUNCHER_TRANSPORT \
      node dashboard/server.cjs > $LOG_DIR/dashboard.log 2>&1 &
    echo \$! > $LOG_DIR/dashboard.pid
  "
  # wait up to 20s for dashboard
  for i in $(seq 1 20); do
    sleep 1
    curl -fsS -o /dev/null --max-time 2 "$URL" && break
  done
fi

# Ensure audio daemon is running (idempotent)
systemctl --user is-active multideck-audio.service >/dev/null 2>&1 || \
  systemctl --user start multideck-audio.service 2>/dev/null || true

# Launch Chromium windowed (NOT kiosk) — app-mode for clean look
PROFILE="$LOG_DIR/chromium-dashboard-profile"
mkdir -p "$PROFILE"
exec distrobox enter "${MULTIDECK_BOX:-multideck-box}" -- chromium \
  --user-data-dir="$PROFILE" \
  --no-first-run \
  --noerrdialogs \
  --disable-pinch \
  --autoplay-policy=no-user-gesture-required \
  --enable-features=OverlayScrollbar \
  --app="$URL"
