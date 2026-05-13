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
#    3. Installs nodejs/npm/tmux/ffmpeg/python/git/chromium inside the box.
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

# ---------- pinned whisper.cpp ----------
PIN_WHISPER_TAG="v1.7.4"
WHISPER_MODEL="${DISPATCH_WHISPER_MODEL_NAME:-base.en}"

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
    chromium jq curl wget xdg-utils'
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
  # Symlink into /usr/local/bin so non-interactive non-login shells find it
  # (the launcher's BROWSER transport spawns `bash -lc 'script -q -c claude ...'`
  # which is a login shell, but .bashrc has the standard non-interactive
  # short-circuit and the npm-global PATH never gets exported there).
  # Matches the pattern documented in docs/WSL_SETUP.md.
  in_box 'sudo ln -sf $HOME/.npm-global/bin/claude /usr/local/bin/claude'
  ok "Claude Code CLI installed and symlinked. Run `claude login` inside the box on first use."
}

# ---------- step 5b: dashboard npm deps (browser terminal needs ws) ----------
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

# ---------- step 6b: whisper.cpp (local STT for mic input on the Deck) ----------
WHISPER_ROOT="${DISPATCH_WHISPER_ROOT:-$HOME/.dispatch-whisper}"
WHISPER_BIN_CANDIDATES=("$WHISPER_ROOT/main" "$WHISPER_ROOT/build/bin/whisper-cli")

resolve_whisper_bin() {
  for cand in "${WHISPER_BIN_CANDIDATES[@]}"; do
    if [[ -x "$cand" ]]; then
      echo "$cand"
      return 0
    fi
  done
  return 1
}

verify_whisper() {
  local bin
  bin="$(resolve_whisper_bin)" || { echo "  whisper: binary missing"; return 1; }
  local model="$WHISPER_ROOT/models/ggml-${WHISPER_MODEL}.bin"
  [[ -f "$model" ]] || { echo "  whisper: model ggml-${WHISPER_MODEL}.bin missing"; return 1; }
  echo "  whisper: bin=$bin  model=$model"
}

ensure_whisper() {
  if [[ -d "$WHISPER_ROOT" && "$FORCE" == false ]]; then
    log "Verifying existing whisper.cpp at $WHISPER_ROOT"
    if verify_whisper; then
      ok "whisper.cpp ready (use --force to rebuild)"
      return
    fi
    warn "whisper.cpp incomplete, repairing"
  fi

  if [[ "$FORCE" == true && -d "$WHISPER_ROOT" ]]; then
    log "Removing existing whisper.cpp install"
    rm -rf "$WHISPER_ROOT"
  fi

  if [[ ! -d "$WHISPER_ROOT/.git" ]]; then
    log "Cloning whisper.cpp ($PIN_WHISPER_TAG) to $WHISPER_ROOT"
    in_box "git clone --depth 1 --branch '$PIN_WHISPER_TAG' \
      https://github.com/ggerganov/whisper.cpp.git '$WHISPER_ROOT'"
  fi

  log "Building whisper.cpp (CPU only, Zen 2)"
  in_box "cd '$WHISPER_ROOT' && make -j\$(nproc) 2>&1 | tail -n 5"

  local model_path="$WHISPER_ROOT/models/ggml-${WHISPER_MODEL}.bin"
  if [[ ! -f "$model_path" ]]; then
    log "Downloading whisper model: $WHISPER_MODEL"
    in_box "cd '$WHISPER_ROOT' && bash ./models/download-ggml-model.sh '$WHISPER_MODEL'"
  fi

  verify_whisper || fail "whisper.cpp install verification failed"
  ok "whisper.cpp ready"
}

# ---------- step 7: env file ----------
write_env_file() {
  local env_dir="$HOME/.config/multideck"
  local env_file="$env_dir/env"
  mkdir -p "$env_dir"

  local whisper_bin
  whisper_bin="$(resolve_whisper_bin 2>/dev/null || echo "$WHISPER_ROOT/main")"
  local whisper_model="$WHISPER_ROOT/models/ggml-${WHISPER_MODEL}.bin"

  log "Writing $env_file"
  cat > "$env_file" <<EOF
# MultiDeck environment for Steam Deck
# Sourced by scripts/steamdeck-launcher.sh
export DISPATCH_ROOT="$MULTIDECK_ROOT"
export DISPATCH_PORT="${DISPATCH_PORT:-3046}"
export DISPATCH_KOKORO_VENV="$KOKORO_VENV"
export DISPATCH_WHISPER_BIN="$whisper_bin"
export DISPATCH_WHISPER_MODEL="$whisper_model"
export DISPATCH_LAUNCHER_TRANSPORT="tmux"
export DISPATCH_TMUX_SESSION="multideck"
export DISPATCH_CLAUDE_BIN="claude"
export MULTIDECK_BOX="$BOX_NAME"
EOF
  ok "env file written"
}

# ---------- step 8: desktop entries ----------
write_desktop_entry() {
  local apps_dir="$HOME/.local/share/applications"
  mkdir -p "$apps_dir"

  # Kiosk launcher entry (the cyberpunk character select, full-screen)
  local desktop_file="$apps_dir/multideck.desktop"
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

  # Windowed dashboard entry — pairs with the audio daemon for headless audio
  local dashboard_desktop="$apps_dir/multideck-dashboard.desktop"
  log "Writing $dashboard_desktop"
  cat > "$dashboard_desktop" <<EOF
[Desktop Entry]
Type=Application
Name=MultiDeck Dashboard
Comment=MultiDeck ops dashboard, windowed. Background audio handled separately.
Exec=$SCRIPT_DIR/steamdeck-dashboard.sh
Icon=$MULTIDECK_ROOT/dashboard/launcher-assets/icon.png
Terminal=false
Categories=Development;
StartupNotify=false
EOF
  chmod +x "$dashboard_desktop"

  ok "desktop entries written (multideck.desktop + multideck-dashboard.desktop)"
}

# ---------- step 8c: install + enable audio-feed daemon ----------
# Background systemd user service. Polls /audio-feed/list every 4s, plays new
# MP3s via ffplay+PipeWire. Survives Gaming Mode, dashboard restarts, etc.
# No-op if systemd --user is unavailable (e.g. running under non-systemd init).
ensure_audio_daemon() {
  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl not found on host; skipping audio daemon."
    return
  fi
  local unit_src="$SCRIPT_DIR/multideck-audio.service"
  local unit_dst="$HOME/.config/systemd/user/multideck-audio.service"
  local daemon="$SCRIPT_DIR/multideck-audio-daemon.sh"

  [[ -f "$daemon" ]]   || { warn "audio daemon script missing: $daemon"; return; }
  [[ -f "$unit_src" ]] || { warn "audio service unit missing: $unit_src"; return; }
  chmod +x "$daemon"

  log "Installing audio-feed daemon at $unit_dst"
  mkdir -p "$(dirname "$unit_dst")"
  cp "$unit_src" "$unit_dst"

  systemctl --user daemon-reload
  systemctl --user enable --now multideck-audio.service 2>&1 | tail -2 || true
  if systemctl --user is-active --quiet multideck-audio.service; then
    ok "audio-feed daemon enabled and running"
  else
    warn "audio-feed daemon installed but not active; check: systemctl --user status multideck-audio"
  fi
}

# ---------- step 8b: wire PreToolUse hook into Claude Code settings.json ----------
# The hook bridges Claude's AskUserQuestion tool to the dashboard's glyph
# modal. Idempotent: if a hook with matcher "AskUserQuestion" pointing at this
# script is already present, the script does nothing.
ensure_claude_hook() {
  local hook_path="$MULTIDECK_ROOT/hooks/dashboard-question-bridge.py"
  [[ -f "$hook_path" ]] || fail "hook script missing: $hook_path"

  log "Wiring PreToolUse hook into ~/.claude/settings.json"
  # Run the Python merge inside the box so it uses the same python3 the hook
  # itself will use at runtime, and so the home path inside the container
  # matches the install location.
  in_box "python3 - <<'PY'
import json, os
from pathlib import Path

settings_path = Path.home() / '.claude' / 'settings.json'
settings_path.parent.mkdir(parents=True, exist_ok=True)

if settings_path.exists():
    try:
        data = json.loads(settings_path.read_text() or '{}')
    except Exception:
        data = {}
else:
    data = {}

hooks = data.setdefault('hooks', {})
pre = hooks.setdefault('PreToolUse', [])

hook_cmd = 'python3 ${hook_path}'
already = False
for entry in pre:
    if entry.get('matcher') == 'AskUserQuestion':
        for h in entry.get('hooks', []):
            if h.get('command') == hook_cmd:
                already = True
                break
        if not already:
            entry.setdefault('hooks', []).append({'type': 'command', 'command': hook_cmd})
            already = True
        break

if not already:
    pre.append({
        'matcher': 'AskUserQuestion',
        'hooks': [{'type': 'command', 'command': hook_cmd}],
    })

settings_path.write_text(json.dumps(data, indent=2))
print(f'wrote {settings_path}')
PY"
  ok "PreToolUse hook wired"
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
  in_box 'command -v chromium >/dev/null 2>&1' || fail "chromium missing inside box"
  verify_kokoro || fail "Kokoro venv drift"
  verify_whisper || fail "whisper.cpp not ready"
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
ensure_whisper
ensure_claude_hook
write_env_file
write_desktop_entry
ensure_audio_daemon
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
