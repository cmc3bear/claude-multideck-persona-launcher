#!/usr/bin/env bash
# =====================================================
#  MultiDeck pkexec helper
#
#  Runs as root via pkexec. Does ONLY the privileged work
#  that the main installer cannot do as a normal user:
#    - steamos-readonly disable/enable
#    - pacman -Sy distrobox podman fuse-overlayfs
#    - apt-get install runtime packages on Ubuntu/Debian
#    - dnf install runtime packages on Fedora
#    - create /usr/local/bin/claude symlink target dir if missing
#
#  Invoked once by install-multideck.sh. The user sees exactly
#  ONE graphical password prompt for the entire install.
#
#  Environment:
#    MULTIDECK_TARGET   one of: steamdeck, linux-generic, wsl
#
#  Exit codes:
#    0  success
#    1  failure
#    2  bad target
# =====================================================

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "ERROR: this helper must run as root (invoke via pkexec, not directly)" >&2
  exit 1
fi

TARGET="${MULTIDECK_TARGET:-}"
if [[ -z "$TARGET" ]]; then
  echo "ERROR: MULTIDECK_TARGET not set in environment" >&2
  exit 2
fi

log() { printf '[pkexec-helper] %s\n' "$*"; }

# ---------- target: steamdeck ----------
do_steamdeck() {
  log "target=steamdeck"

  if command -v steamos-readonly >/dev/null 2>&1; then
    log "disabling SteamOS read-only mode"
    steamos-readonly disable || {
      log "(already disabled, continuing)"
    }
  fi

  log "pacman -Sy --noconfirm --needed distrobox podman fuse-overlayfs"
  pacman -Sy --noconfirm --needed distrobox podman fuse-overlayfs

  if command -v steamos-readonly >/dev/null 2>&1; then
    log "re-enabling SteamOS read-only mode"
    steamos-readonly enable || log "(re-enable failed, system still functional)"
  fi

  # Ensure /usr/local/bin exists and is writable for the user's symlink later
  mkdir -p /usr/local/bin
  log "done"
}

# ---------- target: linux-generic ----------
do_linux_generic() {
  log "target=linux-generic"

  # Detect package manager
  if command -v pacman >/dev/null 2>&1; then
    log "pacman detected"
    pacman -Sy --noconfirm --needed \
      nodejs npm python python-pip ffmpeg jq curl wget git base-devel chromium xdg-utils
  elif command -v apt-get >/dev/null 2>&1; then
    log "apt detected"
    apt-get update
    apt-get install -y \
      nodejs npm python3 python3-pip python3-venv ffmpeg jq curl wget git build-essential \
      chromium chromium-browser xdg-utils || \
      apt-get install -y \
        nodejs npm python3 python3-pip python3-venv ffmpeg jq curl wget git build-essential xdg-utils
  elif command -v dnf >/dev/null 2>&1; then
    log "dnf detected"
    dnf install -y \
      nodejs npm python3 python3-pip ffmpeg jq curl wget git gcc-c++ make chromium xdg-utils
  else
    log "ERROR: no supported package manager (pacman/apt/dnf)" >&2
    exit 1
  fi

  mkdir -p /usr/local/bin
  log "done"
}

# ---------- target: wsl ----------
do_wsl() {
  log "target=wsl"

  # WSL is almost always Ubuntu/Debian-flavored
  if command -v apt-get >/dev/null 2>&1; then
    log "apt detected"
    apt-get update
    apt-get install -y \
      nodejs npm python3 python3-pip python3-venv ffmpeg jq curl wget git build-essential tmux xdg-utils
  else
    log "ERROR: WSL distro not Ubuntu/Debian-based; install manually" >&2
    exit 1
  fi

  mkdir -p /usr/local/bin
  log "done"
}

# ---------- main ----------
case "$TARGET" in
  steamdeck)      do_steamdeck ;;
  linux-generic)  do_linux_generic ;;
  wsl)            do_wsl ;;
  *)
    log "ERROR: unknown target: $TARGET" >&2
    exit 2 ;;
esac

log "pkexec helper exiting cleanly"
exit 0
