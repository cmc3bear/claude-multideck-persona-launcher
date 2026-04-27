#!/usr/bin/env bash
# =====================================================
#  MultiDeck — WSL Kokoro venv installer (audio path B-2)
#
#  Reproducibly installs the Linux-side Kokoro TTS venv at
#  $DISPATCH_KOKORO_VENV (default ~/.dispatch-kokoro-venv) so that
#  scripts/launch-persona-tmux.sh (tmux transport, MULTI-FEAT-0055
#  audio path B-2) can run hooks/kokoro-speak.py natively in WSL
#  Python without crossing back into Windows.
#
#  Closes MULTI-OQE-0062 criterion 1 (reproducible install recipe).
#
#  Idempotent: safe to re-run. If $DISPATCH_KOKORO_VENV already
#  exists, the script verifies pinned package versions and exits
#  unchanged unless --force is passed.
#
#  Required by: MULTI-FEAT-0055 (B-2 audio path) and
#  scripts/launch-persona-tmux.sh boot sequence at line 216 which
#  sources $DISPATCH_KOKORO_VENV/bin/activate before launching claude.
#
#  Usage:
#    ./scripts/install-wsl-kokoro-venv.sh             # fresh install
#    ./scripts/install-wsl-kokoro-venv.sh --force     # rebuild from scratch
#    ./scripts/install-wsl-kokoro-venv.sh --verify    # verify-only, exit nonzero if drift
#
#  Pinned versions match what was empirically validated on the host
#  during MULTI-FEAT-0055 (see state/feasibility-MULTI-FEAT-0055-tmux-transport.md §3(b)).
# =====================================================

set -euo pipefail

VENV="${DISPATCH_KOKORO_VENV:-$HOME/.dispatch-kokoro-venv}"
FORCE=false
VERIFY_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)   FORCE=true; shift ;;
    --verify)  VERIFY_ONLY=true; shift ;;
    -h|--help)
      sed -n '2,/^# =====/p' "${BASH_SOURCE[0]}" | sed 's/^#\s\?//'
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# Pinned package versions — sourced from the operational venv on the
# host machine during MULTI-OQE-0062 inspection (2026-04-26). Bump these
# deliberately; do not silently float to latest because Kokoro+torch+misaki
# version compatibility is fragile (see hooks/requirements.txt history).
PIN_KOKORO="0.9.4"
PIN_MISAKI="0.9.4"
PIN_TORCH="2.11.0"
PIN_SOUNDFILE="0.13.1"
PIN_NUMPY="2.4.4"
PIN_ESPEAKNG_LOADER="0.2.4"

# System packages required for audio synthesis + playback in WSL
APT_PACKAGES=(python3-venv python3-pip ffmpeg)

require_wsl() {
  if ! grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
    echo "WARN: not running in WSL; this venv is intended for the WSL Kokoro path." >&2
    echo "      Native Linux is supported but untested for the dispatch tmux flow." >&2
  fi
}

ensure_apt_packages() {
  local missing=()
  for pkg in "${APT_PACKAGES[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done
  if (( ${#missing[@]} )); then
    echo "Installing system packages: ${missing[*]}"
    sudo apt-get update
    sudo apt-get install -y "${missing[@]}"
  fi
}

verify_versions() {
  local py="$VENV/bin/python"
  [[ -x "$py" ]] || { echo "FAIL: $py not executable"; return 1; }
  local got_kokoro got_torch got_misaki
  got_kokoro="$("$py" -c 'import kokoro; print(kokoro.__version__)' 2>/dev/null || echo MISSING)"
  got_torch="$("$py" -c 'import torch; print(torch.__version__)' 2>/dev/null || echo MISSING)"
  got_misaki="$("$py" -c 'import misaki; print(misaki.__version__)' 2>/dev/null || echo MISSING)"
  echo "  kokoro:  pinned=$PIN_KOKORO  installed=$got_kokoro"
  echo "  torch:   pinned=$PIN_TORCH  installed=$got_torch"
  echo "  misaki:  pinned=$PIN_MISAKI  installed=$got_misaki"
  local drift=0
  [[ "$got_kokoro" == "$PIN_KOKORO" ]] || drift=1
  [[ "$got_torch"  == "$PIN_TORCH"  ]] || drift=1
  [[ "$got_misaki" == "$PIN_MISAKI" ]] || drift=1
  return $drift
}

install_venv() {
  if [[ -d "$VENV" && "$FORCE" == false ]]; then
    echo "venv exists at $VENV — verifying versions"
    if verify_versions; then
      echo "OK: pinned versions match. Pass --force to rebuild."
      return 0
    fi
    echo "DRIFT detected. Pass --force to rebuild from scratch, or run with --verify to fail loudly."
    return 1
  fi

  if [[ "$FORCE" == true && -d "$VENV" ]]; then
    echo "removing existing venv at $VENV"
    rm -rf "$VENV"
  fi

  echo "creating venv at $VENV"
  python3 -m venv "$VENV"

  local pip="$VENV/bin/pip"
  "$pip" install --upgrade pip wheel setuptools

  echo "installing pinned packages"
  "$pip" install \
    "kokoro==$PIN_KOKORO" \
    "misaki==$PIN_MISAKI" \
    "torch==$PIN_TORCH" \
    "soundfile==$PIN_SOUNDFILE" \
    "numpy==$PIN_NUMPY" \
    "espeakng-loader==$PIN_ESPEAKNG_LOADER"

  echo
  echo "verifying"
  verify_versions
}

main() {
  require_wsl

  if [[ "$VERIFY_ONLY" == true ]]; then
    if [[ ! -d "$VENV" ]]; then
      echo "FAIL: venv not present at $VENV"
      exit 1
    fi
    if verify_versions; then
      echo "PASS"
      exit 0
    fi
    exit 1
  fi

  ensure_apt_packages
  install_venv

  echo
  echo "DONE. Set DISPATCH_KOKORO_VENV=$VENV in the dashboard environment to use this venv."
  echo "scripts/launch-persona-tmux.sh sources \$DISPATCH_KOKORO_VENV/bin/activate at boot (line 216)."
}

main
