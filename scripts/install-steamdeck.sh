#!/usr/bin/env bash
# =====================================================
#  MultiDeck — Steam Deck (SteamOS 3) installer
#
#  Installs MultiDeck into a distrobox Arch container so the
#  read-only SteamOS root is never touched. Survives SteamOS updates.
#
#  What it does:
#    1. Ensures distrobox + podman are available (one-time pacman if missing).
#    2. Creates an Arch container named 'multideck-box' with persistent $HOME.
#    3. Installs nodejs/npm/tmux/ffmpeg/python/git/firefox inside the box.
#    4. Installs Claude Code CLI globally inside the box.
#    5. Creates the Kokoro venv at $DISPATCH_KOKORO_VENV with pinned versions.
#    6. Writes ~/.config/multideck/env with framework env vars.
#    7. Generates ~/.local/share/applications/multideck.desktop so Steam can
#       pick it up via 'Add a Non-Steam Game'.
#
#  Idempotent: safe to re-run. Use --force to rebuild the venv, --verify to
#  exit nonzero on drift, --overlay <zip> to extract a personal-content
#  overlay over the clean clone (personas, projects-pinned.json, etc.).
#
#  Usage:
#    ./scripts/install-steamdeck.sh
#    ./scripts/install-steamdeck.sh --force
#    ./scripts/install-steamdeck.sh --verify
#    ./scripts/install-steamdeck.sh --overlay ~/Downloads/multideck-overlay.zip
#    ./scripts/install-steamdeck.sh --skip-claude   # skip claude-code npm step
#
#  Prerequisites:
#    - SteamOS 3 (Holo) on a Steam Deck. Other Arch-based distros work too.
#    - sudo password set: `passwd` in Konsole if you have not done this yet.
#    - Internet connectivity from Desktop Mode.
#
#  After install: see docs/STEAMDECK_SETUP.md §"Steam shortcut".
# =====================================================

set -euo pipefail

# ---------- flags ----------
FORCE=false
VERIFY_ONLY=false
OVERLAY=""
SKIP_CLAUDE=false
BOX_NAME="${MULTIDECK_BOX:-multideck-box}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)        FORCE=true; shift ;;
    --verify)       VERIFY_ONLY=true; shift ;;
    --overlay)      OVERLAY="$2"; shift 2 ;;
    --skip-claude)  SKIP_CLAUDE=true; shift ;;
    --box-name)     BOX_NAME="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^# =====/p' "${BASH_SOURCE[0]}" | sed 's/^#\s\?//'
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MULTIDECK_ROOT="$(dirname "$SCRIPT_DIR")"

# ---------- pinned Kokoro versions (match install-wsl-kokoro-venv.sh) ----------
PIN_KOKORO="0.9.4"
PIN_MISAKI="0.9.4"
PIN_TORCH="2.11.0"
PIN_SOUNDFILE="0.13.1"
PIN_NUMPY="2.4.4"
PIN_ESPEAKNG_LOADER="0.2.4"

# ---------- helpers ----------
log()  { printf '\033[1;36m[multideck]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

in_box() {
  distrobox enter "$BOX_NAME" -- bash -lc "$*"
}

# ---------- step 1: check host OS ----------
check_host() {
  if ! command -v steamos-readonly >/dev/null 2>&1; then
    warn "steamos-readonly not found. Are you on SteamOS?"
    warn "This script is designed for SteamOS 3 but may work on other Arch hosts."
  fi
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    fail "Do not run as root. Run as the 'deck' user; the script will sudo when needed."
  fi
  if ! sudo -n true 2>/dev/null; then
    log "sudo password needed for one-time package install."
    log "If you have not set a password yet, exit and run: passwd"
    sudo -v
  fi
}

# ---------- step 2: install distrobox + podman if missing ----------
ensure_container_engine() {
  if command -v distrobox >/dev/null 2>&1 && command -v podman >/dev/null 2>&1; then
    ok "distrobox + podman already installed"
    return
  fi

  log "Installing distrobox + podman via pacman (one-time, requires readonly disable)"

  if command -v steamos-readonly >/dev/null 2>&1; then
    sudo steamos-readonly disable
    trap 'sudo steamos-readonly enable 2>/dev/null || true' EXIT
  fi

  sudo pacman -Sy --noconfirm --needed distrobox podman fuse-overlayfs

  if command -v steamos-readonly >/dev/null 2>&1; then
    sudo steamos-readonly enable
    trap - EXIT
  fi

  ok "container engine installed"
  warn "NOTE: SteamOS updates may wipe /usr binaries. Re-run this script after major updates."
}

# ---------- step 3: create Arch container ----------
ensure_box() {
  if distrobox list 2>/dev/null | grep -q "^| $BOX_NAME "; then
    ok "container '$BOX_NAME' already exists"
    return
  fi

  log "Creating Arch container '$BOX_NAME' (this pulls ~500 MB)"
  distrobox create \
    --name "$BOX_NAME" \
    --image quay.io/toolbx/arch-toolbox:latest \
    --home "$HOME" \
    --yes

  ok "container created"
}

# ---------- step 4: install runtime packages inside the box ----------
ensure_runtime_packages() {
  log "Installing runtime packages inside container"
  in_box 'sudo pacman -Sy --noconfirm --needed \
    nodejs npm tmux ffmpeg python python-pip git base-devel \
    firefox jq curl wget xdg-utils'
  ok "runtime packages installed"
}

# ---------- step 5: install Claude Code CLI ----------
ensure_claude_code() {
  if [[ "$SKIP_CLAUDE" == true ]]; then
    warn "skipping Claude Code CLI install (--skip-claude)"
    return
  fi

  if in_box 'command -v claude >/dev/null 2>&1'; then
    ok "Claude Code CLI already installed"
    return
  fi

  log "Installing Claude Code CLI inside container"
  # User-scope npm install to avoid sudo + EACCES inside the box
  in_box 'mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global'
  in_box 'grep -q "npm-global/bin" ~/.bashrc || echo "export PATH=\$HOME/.npm-global/bin:\$PATH" >> ~/.bashrc'
  in_box 'export PATH=$HOME/.npm-global/bin:$PATH && npm install -g @anthropic-ai/claude-code'
  ok "Claude Code CLI installed (run `claude login` inside the box on first use)"
}

# ---------- step 5b: dashboard npm deps (browser terminal) ----------
ensure_dashboard_deps() {
  log "Installing dashboard runtime deps (ws for browser terminal)"
  in_box "cd '$MULTIDECK_ROOT/dashboard' && npm install --omit=dev"
  ok "dashboard deps installed"
}

# ---------- step 6: Kokoro venv ----------
KOKORO_VENV="${DISPATCH_KOKORO_VENV:-$HOME/.dispatch-kokoro-venv}"

verify_kokoro() {
  in_box "
    set -e
    [ -x '$KOKORO_VENV/bin/python' ] || { echo 'venv missing'; exit 1; }
    got_kokoro=\$('$KOKORO_VENV/bin/python' -c 'import kokoro; print(kokoro.__version__)' 2>/dev/null || echo MISSING)
    got_torch=\$('$KOKORO_VENV/bin/python' -c 'import torch; print(torch.__version__)' 2>/dev/null || echo MISSING)
    got_misaki=\$('$KOKORO_VENV/bin/python' -c 'import misaki; print(misaki.__version__)' 2>/dev/null || echo MISSING)
    echo \"  kokoro:  pinned=$PIN_KOKORO  installed=\$got_kokoro\"
    echo \"  torch:   pinned=$PIN_TORCH  installed=\$got_torch\"
    echo \"  misaki:  pinned=$PIN_MISAKI  installed=\$got_misaki\"
    drift=0
    [ \"\$got_kokoro\" = '$PIN_KOKORO' ] || drift=1
    [ \"\$got_torch\"  = '$PIN_TORCH'  ] || drift=1
    [ \"\$got_misaki\" = '$PIN_MISAKI' ] || drift=1
    exit \$drift
  "
}

ensure_kokoro_venv() {
  if [[ -d "$KOKORO_VENV" && "$FORCE" == false ]]; then
    log "Verifying existing Kokoro venv at $KOKORO_VENV"
    if verify_kokoro; then
      ok "Kokoro venv versions match pins. Use --force to rebuild."
      return
    fi
    warn "Kokoro venv drift detected. Pass --force to rebuild."
    return 1
  fi

  if [[ "$FORCE" == true && -d "$KOKORO_VENV" ]]; then
    log "Removing existing Kokoro venv"
    rm -rf "$KOKORO_VENV"
  fi

  log "Creating Kokoro venv at $KOKORO_VENV (CPU torch, ~3 GB download)"
  in_box "python -m venv '$KOKORO_VENV'"
  in_box "'$KOKORO_VENV/bin/pip' install --upgrade pip wheel setuptools"
  in_box "'$KOKORO_VENV/bin/pip' install \
    'kokoro==$PIN_KOKORO' \
    'misaki==$PIN_MISAKI' \
    'torch==$PIN_TORCH' \
    'soundfile==$PIN_SOUNDFILE' \
    'numpy==$PIN_NUMPY' \
    'espeakng-loader==$PIN_ESPEAKNG_LOADER' \
    --extra-index-url https://download.pytorch.org/whl/cpu"

  log "Verifying versions"
  verify_kokoro || fail "Kokoro venv installed but versions do not match pins"
  ok "Kokoro venv ready"
}

# ---------- step 7: env file ----------
write_env_file() {
  local env_dir="$HOME/.config/multideck"
  local env_file="$env_dir/env"
  mkdir -p "$env_dir"

  log "Writing $env_file"
  cat > "$env_file" <<EOF
# MultiDeck environment for Steam Deck
# Sourced by scripts/steamdeck-launcher.sh
export DISPATCH_ROOT="$MULTIDECK_ROOT"
export DISPATCH_PORT="${DISPATCH_PORT:-3046}"
export DISPATCH_KOKORO_VENV="$KOKORO_VENV"
export DISPATCH_LAUNCHER_TRANSPORT="tmux"
export DISPATCH_TMUX_SESSION="multideck"
export DISPATCH_CLAUDE_BIN="claude"
export MULTIDECK_BOX="$BOX_NAME"
EOF
  ok "env file written"
}

# ---------- step 8: desktop entry ----------
write_desktop_entry() {
  local apps_dir="$HOME/.local/share/applications"
  local desktop_file="$apps_dir/multideck.desktop"
  mkdir -p "$apps_dir"

  log "Writing $desktop_file"
  cat > "$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Name=MultiDeck
Comment=Multi-agent Claude Code launcher
Exec=$SCRIPT_DIR/steamdeck-launcher.sh
Icon=$MULTIDECK_ROOT/dashboard/launcher-assets/icon.png
Terminal=false
Categories=Development;
StartupNotify=false
EOF
  chmod +x "$desktop_file"
  ok "desktop entry written"
}

# ---------- step 9: optional personal overlay ----------
apply_overlay() {
  [[ -z "$OVERLAY" ]] && return

  [[ -f "$OVERLAY" ]] || fail "overlay zip not found: $OVERLAY"

  log "Extracting personal overlay: $OVERLAY"
  in_box "cd '$MULTIDECK_ROOT' && unzip -o '$OVERLAY'"
  ok "overlay applied"
}

# ---------- main ----------
if [[ "$VERIFY_ONLY" == true ]]; then
  log "Verify-only mode"
  command -v distrobox >/dev/null 2>&1 || fail "distrobox missing"
  command -v podman >/dev/null 2>&1 || fail "podman missing"
  distrobox list 2>/dev/null | grep -q "^| $BOX_NAME " || fail "container '$BOX_NAME' missing"
  in_box 'command -v claude >/dev/null 2>&1' || fail "claude CLI missing inside box"
  in_box 'command -v node >/dev/null 2>&1' || fail "node missing inside box"
  in_box 'command -v ffplay >/dev/null 2>&1' || fail "ffplay missing inside box"
  verify_kokoro || fail "Kokoro venv drift"
  ok "All checks passed."
  exit 0
fi

check_host
ensure_container_engine
ensure_box
ensure_runtime_packages
ensure_claude_code
ensure_dashboard_deps
ensure_kokoro_venv
write_env_file
write_desktop_entry
apply_overlay

cat <<EOF

==================================================================
MultiDeck install complete.

Next steps:
  1. Test the dashboard launches:
       $SCRIPT_DIR/steamdeck-launcher.sh

  2. Add to Steam (from Desktop Mode):
       Steam -> Games (menu) -> Add a Non-Steam Game to My Library
       Browse to: $HOME/.local/share/applications/multideck.desktop
       (or pick MultiDeck if it appears in the dialog list)

  3. First-time Claude Code auth:
       distrobox enter $BOX_NAME
       claude login

  4. Kiosk mode (optional):
       Edit steamdeck-launcher.sh and uncomment the gamescope wrapper line.

For troubleshooting see docs/STEAMDECK_SETUP.md.
==================================================================
EOF
