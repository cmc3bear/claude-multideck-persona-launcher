#!/usr/bin/env bash
# =====================================================
#  MultiDeck — Steam Deck launcher entry point
#
#  This is what the Steam shortcut (or multideck.desktop) executes.
#
#  Sequence:
#    1. Source ~/.config/multideck/env (written by install-steamdeck.sh).
#    2. If dashboard not responding on $DISPATCH_PORT, start it in the
#       distrobox container as a detached background process.
#    3. Wait until /launcher responds.
#    4. Strip Steam's LD_PRELOAD overlay (32-bit, breaks our 64-bit Chromium).
#    5. exec Chromium kiosk so when the browser exits, the script exits
#       cleanly. Steam Big Picture treats the script lifetime as the "game"
#       lifetime, so exec'ing Chromium keeps the indicator correct.
#
#  Dashboard lifecycle:
#    The dashboard is intentionally NOT killed when this script exits.
#    The launcher script is a one-shot bringup; the dashboard is a long-
#    running service that survives multiple launcher invocations. This lets
#    you close the launcher and reopen it without losing audio feed state,
#    pending question modal, or warm whisper-server.
#
#  To clean up the dashboard manually:
#    pkill -f 'node dashboard/server.cjs'
#
#  Usage:
#    ./scripts/steamdeck-launcher.sh
#    ./scripts/steamdeck-launcher.sh --no-kiosk    # windowed Chromium
#    ./scripts/steamdeck-launcher.sh --headless    # dashboard only, no browser
#    ./scripts/steamdeck-launcher.sh --restart-dashboard   # force-restart
# =====================================================

set -euo pipefail

# ---------- flags ----------
KIOSK=true
HEADLESS=false
RESTART_DASHBOARD=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-kiosk)          KIOSK=false; shift ;;
    --headless)          HEADLESS=true; shift ;;
    --restart-dashboard) RESTART_DASHBOARD=true; shift ;;
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

# Strip Steam game overlay LD_PRELOAD. Steam injects gameoverlayrenderer.so
# (32-bit on Steam Deck) which can't be loaded into our 64-bit Chromium and
# produces noisy stderr warnings, but more importantly the broken inject
# attempt can race with chromium's GPU init.
unset LD_PRELOAD

# Steam Big Picture / Gaming Mode launches non-Steam shortcuts with a
# stripped environment that often lacks DISPLAY and XAUTHORITY. Without
# them Chromium dies in under a second with "Missing X server or
# $DISPLAY" and the user sees a launcher "flash" with no window.
# Default to :0 + autodetected Xauth file so kiosk works regardless of
# launch context (Steam, desktop double-click, SSH with X-forward, etc.).
export DISPLAY="${DISPLAY:-:0}"
if [[ -z "${XAUTHORITY:-}" ]]; then
  for xauth in "/run/user/$(id -u)"/xauth_* "$HOME/.Xauthority"; do
    if [[ -f "$xauth" ]]; then
      export XAUTHORITY="$xauth"
      break
    fi
  done
fi

# Diagnostic launcher log. Future "flash" symptoms grep this first.
LAUNCHER_LOG_DIR="$HOME/.cache/multideck"
mkdir -p "$LAUNCHER_LOG_DIR"
printf '[%s] launcher start: DISPLAY=%s XAUTHORITY=%s\n' \
  "$(date -Iseconds)" "$DISPLAY" "${XAUTHORITY:-unset}" \
  >> "$LAUNCHER_LOG_DIR/launcher.log"

# ---------- helpers ----------
log()  { printf '\033[1;36m[multideck]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

in_box() {
  distrobox enter "$BOX" -- bash -lc "$*"
}

LOG_DIR="$HOME/.cache/multideck"
mkdir -p "$LOG_DIR"
DASHBOARD_LOG="$LOG_DIR/dashboard.log"

# ---------- step 1: ensure dashboard ----------
dashboard_responds() {
  curl -fsS --max-time 2 "http://localhost:$PORT/launcher" >/dev/null 2>&1
}

ensure_dashboard() {
  if dashboard_responds && [[ "$RESTART_DASHBOARD" != true ]]; then
    log "Dashboard already responding on http://localhost:$PORT (reusing)"
    return
  fi

  if [[ "$RESTART_DASHBOARD" == true ]]; then
    log "Restarting dashboard (was: $(pgrep -f 'node dashboard/server.cjs' | head -1 || echo none))"
    pkill -f 'node dashboard/server.cjs' 2>/dev/null || true
    sleep 1
  fi

  log "Starting dashboard server in container (logs: $DASHBOARD_LOG)"
  # setsid + nohup so the dashboard survives this script exiting and
  # detaches from our process group (no SIGHUP propagation from Steam).
  in_box "cd '$ROOT' && setsid nohup node dashboard/server.cjs > '$DASHBOARD_LOG' 2>&1 < /dev/null &"

  # Wait up to 30s for the dashboard to come up
  local tries=0
  until dashboard_responds; do
    tries=$((tries+1))
    if [[ $tries -gt 30 ]]; then
      tail -n 30 "$DASHBOARD_LOG" >&2 || true
      fail "Dashboard did not start within 30s"
    fi
    sleep 1
  done
  log "Dashboard is up on http://localhost:$PORT"
}

# ---------- step 2: open browser ----------
open_browser() {
  if [[ "$HEADLESS" == true ]]; then
    log "Headless mode. Dashboard at http://localhost:$PORT/launcher"
    log "Press Ctrl-C to stop (dashboard keeps running)."
    while sleep 3600; do :; done
  fi

  local url="http://localhost:$PORT/launcher"
  local profile_dir="${HOME}/.cache/multideck/chromium-profile"
  mkdir -p "$profile_dir"

  # Common flags for kiosk-on-Deck:
  #   --user-data-dir          isolated profile
  #   --no-first-run           skip welcome flow
  #   --noerrdialogs           do not show crash dialogs
  #   --disable-pinch          touch screen, no accidental zoom
  #   --overscroll-history-navigation=0  no swipe-back nav
  #   --use-fake-ui-for-media-stream     auto-grant mic for STT
  #   --autoplay-policy=no-user-gesture-required  audio feed plays without click
  local common_args=(
    "--user-data-dir=$profile_dir"
    "--no-first-run"
    "--noerrdialogs"
    "--disable-pinch"
    "--overscroll-history-navigation=0"
    "--use-fake-ui-for-media-stream"
    "--autoplay-policy=no-user-gesture-required"
    "--enable-features=OverlayScrollbar"
  )

  local mode_args=()
  if [[ "$KIOSK" == true ]]; then
    mode_args+=("--kiosk" "--app=$url")
  else
    mode_args+=("$url")
  fi

  log "Opening Chromium: $url (kiosk=$KIOSK)"
  # exec replaces this shell with chromium. When chromium exits, the
  # script exits with chromium's exit code. Steam Big Picture sees that
  # as the "game" ending and switches back to its UI cleanly.
  #
  # IMPORTANT: distrobox enter spawns a wrapper shell that handles
  # podman exec. We exec into that wrapper, which then exec's chromium
  # inside the container. Net effect: this PID becomes the chromium
  # session's parent for Steam's accounting purposes.
  exec distrobox enter "$BOX" -- bash -lc "exec chromium ${common_args[*]} ${mode_args[*]}"
}

# ---------- main ----------
ensure_dashboard
open_browser
