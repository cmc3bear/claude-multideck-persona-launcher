#!/usr/bin/env bash
# =====================================================
#  MultiDeck — Steam Deck launcher entry point
#
#  Tested launch contexts:
#    - Desktop Mode double-click (KDE Plasma session)
#    - Konsole (direct shell)
#    - SSH (with or without DISPLAY)
#    - Steam Big Picture (Desktop session)
#    - Steam Gaming Mode (Gamescope nested xwayland)
#
#  Why we DON'T use `set -e` here: Steam Gaming Mode launches non-Steam
#  shortcuts with a stripped environment. Earlier versions of this script
#  used `set -euo pipefail` at the top, which caused the script to exit
#  silently before any logging if an env variable was unset. Symptom:
#  "flash" with no diagnostic output. We now log everything aggressively
#  and exit only on specific failures we've identified.
#
#  Dashboard lifecycle: the dashboard is intentionally NOT killed when
#  this script exits. The launcher is a one-shot bringup; the dashboard
#  is a long-running service that survives multiple launcher invocations.
# =====================================================

# ---------- step 1: logging FIRST, before anything can fail ----------
LAUNCHER_LOG_DIR="${HOME:-/home/deck}/.cache/multideck"
mkdir -p "$LAUNCHER_LOG_DIR" 2>/dev/null
LAUNCHER_LOG="$LAUNCHER_LOG_DIR/launcher.log"
# Tee stdout AND stderr to the log; keep them on the original streams too
# so Steam captures crashes in its own log.
exec > >(tee -a "$LAUNCHER_LOG") 2>&1

echo
echo "================================================================"
echo "[$(date -Iseconds)] launcher invoked"
echo "  USER=${USER:-<unset>}  HOME=${HOME:-<unset>}  PWD=$(pwd)"
echo "  DISPLAY=${DISPLAY:-<unset>}  XAUTHORITY=${XAUTHORITY:-<unset>}"
echo "  WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-<unset>}"
echo "  GAMESCOPE_WAYLAND_DISPLAY=${GAMESCOPE_WAYLAND_DISPLAY:-<unset>}"
echo "  XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-<unset>}"
echo "  argv: $0 $*"
echo "================================================================"

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
    *) echo "[warn] unknown flag: $1, ignoring"; shift ;;
  esac
done

# ---------- env ----------
ENV_FILE="${HOME:-/home/deck}/.config/multideck/env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[fail] $ENV_FILE not found. Run scripts/install-steamdeck.sh first."
  exit 1
fi
echo "[info] sourcing $ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE"

BOX="${MULTIDECK_BOX:-multideck-box}"
PORT="${DISPATCH_PORT:-3046}"
ROOT="${DISPATCH_ROOT:-${HOME:-/home/deck}/multideck}"
echo "[info] BOX=$BOX PORT=$PORT ROOT=$ROOT"

# ---------- step 2: strip Steam game overlay LD_PRELOAD ----------
if [[ -n "${LD_PRELOAD:-}" ]]; then
  echo "[info] stripping LD_PRELOAD=$LD_PRELOAD (Steam's 32-bit game overlay, incompatible with our 64-bit Chromium)"
  unset LD_PRELOAD
fi

# ---------- step 3: ensure DISPLAY + XAUTHORITY ----------
# Steam Gaming Mode (Gamescope) typically sets:
#   DISPLAY=:0
#   XAUTHORITY=/run/pressure-vessel/Xauthority
# Desktop Mode (KDE) typically sets:
#   DISPLAY=:0
#   XAUTHORITY=/run/user/1000/xauth_XXXXXX
# When both are stripped (some launch contexts), we recover by defaulting
# DISPLAY=:0 and searching known auth paths.
export DISPLAY="${DISPLAY:-:0}"

if [[ -n "${XAUTHORITY:-}" ]] && [[ -f "$XAUTHORITY" ]]; then
  echo "[info] using inherited XAUTHORITY=$XAUTHORITY"
else
  for candidate in \
      /run/pressure-vessel/Xauthority \
      /run/user/$(id -u 2>/dev/null)/xauth_* \
      "${HOME:-/home/deck}/.Xauthority"; do
    if [[ -f "$candidate" ]]; then
      export XAUTHORITY="$candidate"
      echo "[info] auto-detected XAUTHORITY=$XAUTHORITY"
      break
    fi
  done
fi
if [[ -z "${XAUTHORITY:-}" ]] || [[ ! -f "${XAUTHORITY:-}" ]]; then
  echo "[warn] no XAUTHORITY file found; X11 connection may fail unless xhost is permissive"
fi

# Stage XAUTHORITY in /tmp so the distrobox container can read it. The
# Gaming Mode auth path (/run/pressure-vessel/Xauthority) is inside Steam's
# pressure-vessel sandbox and typically not bind-mounted into our box.
STAGED_XAUTH="/tmp/multideck-xauth"
if [[ -n "${XAUTHORITY:-}" ]] && [[ -f "$XAUTHORITY" ]]; then
  if cp "$XAUTHORITY" "$STAGED_XAUTH" 2>/dev/null; then
    chmod 600 "$STAGED_XAUTH" 2>/dev/null
    export XAUTHORITY="$STAGED_XAUTH"
    echo "[info] staged XAUTHORITY at $STAGED_XAUTH for container visibility"
  else
    echo "[warn] could not stage XAUTHORITY at $STAGED_XAUTH (source: $XAUTHORITY)"
  fi
fi

# ---------- helpers ----------
log()  { printf '[multideck] %s\n' "$*"; }

in_box() {
  distrobox enter "$BOX" -- bash -lc "$*"
}

LOG_DIR="${HOME:-/home/deck}/.cache/multideck"
DASHBOARD_LOG="$LOG_DIR/dashboard.log"

# ---------- step 4: ensure dashboard ----------
dashboard_responds() {
  curl -fsS --max-time 2 "http://localhost:$PORT/launcher" >/dev/null 2>&1
}

ensure_dashboard() {
  if dashboard_responds && [[ "$RESTART_DASHBOARD" != true ]]; then
    log "Dashboard already responding on http://localhost:$PORT (reusing)"
    return 0
  fi

  if [[ "$RESTART_DASHBOARD" == true ]]; then
    log "Restarting dashboard (--restart-dashboard)"
    pkill -f 'node dashboard/server.cjs' 2>/dev/null || true
    sleep 1
  fi

  log "Starting dashboard server in container (logs: $DASHBOARD_LOG)"
  in_box "cd '$ROOT' && setsid nohup node dashboard/server.cjs > '$DASHBOARD_LOG' 2>&1 < /dev/null &"

  local tries=0
  until dashboard_responds; do
    tries=$((tries+1))
    if [[ $tries -gt 30 ]]; then
      echo "[fail] Dashboard did not start within 30s. Last 30 lines of dashboard log:"
      tail -n 30 "$DASHBOARD_LOG" 2>&1 || true
      return 1
    fi
    sleep 1
  done
  log "Dashboard is up on http://localhost:$PORT"
}

# ---------- step 5: open browser ----------
open_browser() {
  if [[ "$HEADLESS" == true ]]; then
    log "Headless mode. Dashboard at http://localhost:$PORT/launcher"
    log "Press Ctrl-C to stop (dashboard keeps running)."
    while sleep 3600; do :; done
  fi

  # ?deck=1 tells the launcher JS to set deck mode, which makes the
  # /launcher/launch endpoint append a 10-line-cap constraint to the
  # persona prompt. Reading area on the Deck is constrained at the
  # 28px xterm font, so verbose persona output is unreadable.
  local url="http://localhost:$PORT/launcher?deck=1"
  local profile_dir="${HOME:-/home/deck}/.cache/multideck/chromium-profile"
  mkdir -p "$profile_dir"

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
  log "Passing to container: DISPLAY=$DISPLAY XAUTHORITY=${XAUTHORITY:-<unset>}"

  if ! distrobox enter "$BOX" -- bash -lc "command -v chromium >/dev/null"; then
    echo "[fail] chromium not installed in container $BOX (run install-steamdeck.sh)"
    exit 1
  fi

  # exec replaces this script's PID with the container exec wrapper, which
  # in turn execs chromium inside the container. When chromium exits, the
  # entire chain exits with chromium's code. Steam sees the "game" close
  # cleanly via PID tracking.
  exec distrobox enter "$BOX" -- bash -lc "exec chromium ${common_args[*]} ${mode_args[*]}"
}

# ---------- main ----------
if ! ensure_dashboard; then
  echo "[fail] dashboard bringup failed, aborting before chromium"
  exit 1
fi
open_browser
