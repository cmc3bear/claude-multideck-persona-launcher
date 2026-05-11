#!/usr/bin/env bash
# =====================================================
#  MultiDeck — Steam Deck launcher entry point
#
#  This is what the Steam shortcut (or multideck.desktop) executes.
#
#  Sequence:
#    1. Source ~/.config/multideck/env (written by install-steamdeck.sh).
#    2. Enter the distrobox container.
#    3. Start the MultiDeck dashboard server in the background.
#    4. Wait until the launcher endpoint responds.
#    5. Open Firefox in kiosk mode pointed at the launcher.
#    6. When the browser closes, shut the dashboard down cleanly.
#
#  Kiosk mode: Firefox --kiosk fullscreens the launcher. Comment-toggle the
#  gamescope wrapper at the bottom to integrate into Gaming Mode.
#
#  Usage:
#    ./scripts/steamdeck-launcher.sh
#    ./scripts/steamdeck-launcher.sh --no-kiosk    # windowed Firefox
#    ./scripts/steamdeck-launcher.sh --headless    # dashboard only, no browser
# =====================================================

set -euo pipefail

# ---------- flags ----------
KIOSK=true
HEADLESS=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-kiosk)  KIOSK=false; shift ;;
    --headless)  HEADLESS=true; shift ;;
    -h|--help)
      sed -n '2,/^# =====/p' "${BASH_SOURCE[0]}" | sed 's/^#\s\?//'
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ---------- env ----------
ENV_FILE="$HOME/.config/multideck/env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[fail] $ENV_FILE not found. Run scripts/install-steamdeck.sh first." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

BOX="${MULTIDECK_BOX:-multideck-box}"
PORT="${DISPATCH_PORT:-3046}"
ROOT="${DISPATCH_ROOT:?DISPATCH_ROOT not set in $ENV_FILE}"

# ---------- helpers ----------
log()  { printf '\033[1;36m[multideck]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

in_box() {
  distrobox enter "$BOX" -- bash -lc "$*"
}

# ---------- step 1: start dashboard ----------
DASHBOARD_PID=""
LOG_DIR="$HOME/.cache/multideck"
mkdir -p "$LOG_DIR"
DASHBOARD_LOG="$LOG_DIR/dashboard.log"

start_dashboard() {
  log "Starting dashboard server on port $PORT (logs: $DASHBOARD_LOG)"
  # nohup + & inside distrobox keeps the process alive after the enter call returns
  in_box "cd '$ROOT' && nohup env DISPATCH_PORT='$PORT' DISPATCH_ROOT='$ROOT' \
    DISPATCH_KOKORO_VENV='$DISPATCH_KOKORO_VENV' \
    DISPATCH_LAUNCHER_TRANSPORT='$DISPATCH_LAUNCHER_TRANSPORT' \
    node dashboard/server.cjs > '$DASHBOARD_LOG' 2>&1 &
    echo \$!" > "$LOG_DIR/dashboard.pid"
  DASHBOARD_PID="$(cat "$LOG_DIR/dashboard.pid" || true)"
  log "Dashboard PID: $DASHBOARD_PID"
}

wait_for_dashboard() {
  log "Waiting for /launcher to respond on http://localhost:$PORT/launcher"
  local tries=0
  until curl -fsS "http://localhost:$PORT/launcher" >/dev/null 2>&1; do
    tries=$((tries+1))
    if [[ $tries -gt 60 ]]; then
      tail -n 40 "$DASHBOARD_LOG" >&2 || true
      fail "Dashboard did not start within 60s"
    fi
    sleep 1
  done
  log "Dashboard is up."
}

stop_dashboard() {
  if [[ -n "${DASHBOARD_PID:-}" ]]; then
    log "Stopping dashboard (PID $DASHBOARD_PID)"
    in_box "kill $DASHBOARD_PID 2>/dev/null || true"
  fi
  # Also try killing anything else listening on the port inside the box
  in_box "fuser -k ${PORT}/tcp 2>/dev/null || true" >/dev/null 2>&1 || true
}
trap stop_dashboard EXIT

# ---------- step 2: open browser ----------
open_browser() {
  if [[ "$HEADLESS" == true ]]; then
    log "Headless mode. Dashboard at http://localhost:$PORT/launcher"
    log "Press Ctrl-C to stop."
    while sleep 3600; do :; done
  fi

  local url="http://localhost:$PORT/launcher"
  local args=()
  if [[ "$KIOSK" == true ]]; then
    args+=(--kiosk)
  fi

  log "Opening Firefox: $url"
  # Firefox lives inside the distrobox container (installed by install-steamdeck.sh)
  in_box "firefox ${args[*]} '$url'"
}

# ---------- main ----------
start_dashboard
wait_for_dashboard

# To wrap the browser in gamescope for Gaming Mode integration, uncomment:
# exec gamescope -e -W 1280 -H 800 -- bash -c "$(declare -f log fail in_box open_browser); open_browser"

open_browser
