#!/usr/bin/env bash
# =====================================================
#  MultiDeck — generic Linux installer
#
#  Installs MultiDeck on a regular Linux host (Arch, Ubuntu, Fedora).
#  No distrobox layer — runtimes go directly to the host. Privileged
#  package install happens via install-pkexec-helper.sh ONCE before
#  this script is invoked; this script runs entirely as the user.
#
#  Idempotent. Same flags as install-steamdeck.sh.
#
#  Usage:
#    ./scripts/install-linux-generic.sh
#    ./scripts/install-linux-generic.sh --force
#    ./scripts/install-linux-generic.sh --verify
#    ./scripts/install-linux-generic.sh --skip-claude
#
#  Typically invoked via:
#    ./scripts/install-multideck.sh --target linux-generic
# =====================================================

set -euo pipefail

# ---------- flags ----------
FORCE=false
VERIFY_ONLY=false
SKIP_CLAUDE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)        FORCE=true; shift ;;
    --verify)       VERIFY_ONLY=true; shift ;;
    --skip-claude)  SKIP_CLAUDE=true; shift ;;
    -h|--help)
      sed -n '2,/^# =====/p' "${BASH_SOURCE[0]}" | sed 's/^#\s\?//'
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MULTIDECK_ROOT="$(dirname "$SCRIPT_DIR")"

# ---------- pinned versions (must match install-steamdeck.sh) ----------
PIN_KOKORO="0.9.4"
PIN_MISAKI="0.9.4"
PIN_TORCH="2.11.0"
PIN_SOUNDFILE="0.13.1"
PIN_NUMPY="2.4.4"
PIN_ESPEAKNG_LOADER="0.2.4"
PIN_WHISPER_TAG="v1.7.4"
WHISPER_MODEL="${DISPATCH_WHISPER_MODEL_NAME:-base.en}"

# ---------- XDG paths ----------
XDG_DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}"
MULTIDECK_DATA="$XDG_DATA/multideck"
KOKORO_VENV="${DISPATCH_KOKORO_VENV:-$MULTIDECK_DATA/kokoro-venv}"
WHISPER_ROOT="${DISPATCH_WHISPER_ROOT:-$MULTIDECK_DATA/whisper}"

# ---------- helpers ----------
log()  { printf '\033[1;36m[multideck]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

resolve_chromium() {
  for cand in chromium google-chrome google-chrome-stable chrome brave; do
    command -v "$cand" >/dev/null 2>&1 && { echo "$cand"; return 0; }
  done
  # Flatpak fallback
  if command -v flatpak >/dev/null 2>&1; then
    if flatpak list --app 2>/dev/null | grep -qi -E "chromium|chrome|brave"; then
      echo "flatpak"
      return 0
    fi
  fi
  return 1
}

# ---------- step 1: host check ----------
check_host() {
  log "Checking host system"

  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    fail "Do not run as root. Run as your normal user."
  fi

  for cmd in node python3 ffmpeg ffplay git curl jq; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      fail "missing dependency: $cmd (run scripts/install-multideck.sh which invokes pkexec helper)"
    fi
  done

  if ! resolve_chromium >/dev/null 2>&1; then
    warn "no chromium-class browser detected (chromium/chrome/brave). Dashboard will work but launcher kiosk needs one."
  fi

  ok "host check passed"
}

# ---------- step 2: Claude Code CLI ----------
ensure_claude_code() {
  if [[ "$SKIP_CLAUDE" == true ]]; then
    warn "skipping Claude Code CLI install (--skip-claude)"
    return
  fi

  if command -v claude >/dev/null 2>&1; then
    ok "Claude Code CLI already installed"
    return
  fi

  log "Installing Claude Code CLI to ~/.npm-global"
  mkdir -p ~/.npm-global
  npm config set prefix "$HOME/.npm-global"

  if ! grep -q "npm-global/bin" ~/.bashrc 2>/dev/null; then
    echo "export PATH=\$HOME/.npm-global/bin:\$PATH" >> ~/.bashrc
  fi

  export PATH="$HOME/.npm-global/bin:$PATH"
  npm install -g @anthropic-ai/claude-code

  # Symlink to /usr/local/bin if writable (matches Steam Deck pattern; avoids
  # the non-interactive shell PATH issue).
  if [[ -w /usr/local/bin ]]; then
    ln -sf "$HOME/.npm-global/bin/claude" /usr/local/bin/claude
    ok "claude symlinked to /usr/local/bin/claude"
  else
    warn "/usr/local/bin not writable; claude only on PATH for interactive shells"
    warn "fix with: sudo ln -sf $HOME/.npm-global/bin/claude /usr/local/bin/claude"
  fi

  ok "Claude Code CLI installed (run 'claude login' first time you use it)"
}

# ---------- step 3: Kokoro venv ----------
verify_kokoro() {
  [ -x "$KOKORO_VENV/bin/python" ] || { echo "  kokoro: venv missing"; return 1; }
  got_kokoro=$("$KOKORO_VENV/bin/python" -c 'import kokoro; print(kokoro.__version__)' 2>/dev/null || echo MISSING)
  got_torch=$("$KOKORO_VENV/bin/python" -c 'import torch; print(torch.__version__)' 2>/dev/null || echo MISSING)
  got_misaki=$("$KOKORO_VENV/bin/python" -c 'import misaki; print(misaki.__version__)' 2>/dev/null || echo MISSING)
  echo "  kokoro:  pinned=$PIN_KOKORO  installed=$got_kokoro"
  echo "  torch:   pinned=$PIN_TORCH  installed=$got_torch"
  echo "  misaki:  pinned=$PIN_MISAKI  installed=$got_misaki"
  drift=0
  [ "$got_kokoro" = "$PIN_KOKORO" ] || drift=1
  [ "$got_torch"  = "$PIN_TORCH" ]  || drift=1
  [ "$got_misaki" = "$PIN_MISAKI" ] || drift=1
  return $drift
}

ensure_kokoro_venv() {
  if [[ -d "$KOKORO_VENV" && "$FORCE" == false ]]; then
    log "Verifying existing Kokoro venv at $KOKORO_VENV"
    if verify_kokoro; then
      ok "Kokoro venv versions match pins"
      return
    fi
    warn "Kokoro venv drift; use --force to rebuild"
    return 1
  fi

  if [[ "$FORCE" == true && -d "$KOKORO_VENV" ]]; then
    log "Removing existing Kokoro venv"
    rm -rf "$KOKORO_VENV"
  fi

  log "Creating Kokoro venv at $KOKORO_VENV (CPU torch, ~3 GB download)"
  mkdir -p "$(dirname "$KOKORO_VENV")"
  python3 -m venv "$KOKORO_VENV"
  "$KOKORO_VENV/bin/pip" install --upgrade pip wheel setuptools
  "$KOKORO_VENV/bin/pip" install \
    "kokoro==$PIN_KOKORO" \
    "misaki==$PIN_MISAKI" \
    "torch==$PIN_TORCH" \
    "soundfile==$PIN_SOUNDFILE" \
    "numpy==$PIN_NUMPY" \
    "espeakng-loader==$PIN_ESPEAKNG_LOADER" \
    --extra-index-url https://download.pytorch.org/whl/cpu

  verify_kokoro || fail "Kokoro venv installed but versions do not match pins"
  ok "Kokoro venv ready"
}

# ---------- step 4: whisper.cpp ----------
resolve_whisper_bin() {
  for cand in "$WHISPER_ROOT/build/bin/whisper-cli" "$WHISPER_ROOT/main"; do
    [[ -x "$cand" ]] && { echo "$cand"; return 0; }
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
      ok "whisper.cpp ready"
      return
    fi
    warn "whisper.cpp incomplete; repairing"
  fi

  if [[ "$FORCE" == true && -d "$WHISPER_ROOT" ]]; then
    log "Removing existing whisper.cpp"
    rm -rf "$WHISPER_ROOT"
  fi

  mkdir -p "$(dirname "$WHISPER_ROOT")"

  if [[ ! -d "$WHISPER_ROOT/.git" ]]; then
    log "Cloning whisper.cpp ($PIN_WHISPER_TAG)"
    git clone --depth 1 --branch "$PIN_WHISPER_TAG" \
      https://github.com/ggerganov/whisper.cpp.git "$WHISPER_ROOT"
  fi

  log "Building whisper.cpp (CPU only)"
  (cd "$WHISPER_ROOT" && make -j"$(nproc)" 2>&1 | tail -n 5)

  local model_path="$WHISPER_ROOT/models/ggml-${WHISPER_MODEL}.bin"
  if [[ ! -f "$model_path" ]]; then
    log "Downloading whisper model: $WHISPER_MODEL"
    (cd "$WHISPER_ROOT" && bash ./models/download-ggml-model.sh "$WHISPER_MODEL")
  fi

  verify_whisper || fail "whisper.cpp install verification failed"
  ok "whisper.cpp ready"
}

# ---------- step 5: Claude hook ----------
ensure_claude_hook() {
  local hook_path="$MULTIDECK_ROOT/hooks/dashboard-question-bridge.py"
  [[ -f "$hook_path" ]] || { warn "hook script missing: $hook_path (skipping)"; return; }

  log "Wiring PreToolUse hook into ~/.claude/settings.json"

  python3 - <<PY
import json
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
PY

  ok "PreToolUse hook wired"
}

# ---------- step 6: env file ----------
write_env_file() {
  local env_file="$XDG_CONFIG/multideck/env"
  mkdir -p "$(dirname "$env_file")"

  local whisper_bin
  whisper_bin="$(resolve_whisper_bin 2>/dev/null || echo $WHISPER_ROOT/build/bin/whisper-cli)"
  local whisper_model="$WHISPER_ROOT/models/ggml-${WHISPER_MODEL}.bin"

  log "Writing $env_file"
  cat > "$env_file" <<EOF
# MultiDeck environment (generic Linux install)
# Sourced by scripts/start-dashboard.sh and shortcuts
export DISPATCH_ROOT="$MULTIDECK_ROOT"
export DISPATCH_PORT="${DISPATCH_PORT:-3046}"
export DISPATCH_KOKORO_VENV="$KOKORO_VENV"
export DISPATCH_WHISPER_BIN="$whisper_bin"
export DISPATCH_WHISPER_MODEL="$whisper_model"
export DISPATCH_LAUNCHER_TRANSPORT="${DISPATCH_LAUNCHER_TRANSPORT:-BROWSER}"
export DISPATCH_CLAUDE_BIN="claude"
EOF
  ok "env file written"
}

# ---------- step 7: desktop entry + start script ----------
write_start_script() {
  local start="$SCRIPT_DIR/start-dashboard.sh"
  if [[ -f "$start" ]]; then
    ok "start-dashboard.sh already present"
    return
  fi
  log "Writing $start"
  cat > "$start" <<'EOF'
#!/usr/bin/env bash
# MultiDeck dashboard start script (generic Linux)
set -e
ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/multideck/env"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_ROOT="${DISPATCH_ROOT:-$(dirname "$SCRIPT_DIR")}"
exec node "$DISPATCH_ROOT/dashboard/server.cjs"
EOF
  chmod +x "$start"
  ok "start script written"
}

write_desktop_entry() {
  local apps_dir="$XDG_DATA/applications"
  local desktop_file="$apps_dir/multideck.desktop"
  mkdir -p "$apps_dir"

  log "Writing $desktop_file"
  cat > "$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Name=MultiDeck
Comment=Multi-agent Claude Code launcher
Exec=$SCRIPT_DIR/start-dashboard.sh
Icon=$MULTIDECK_ROOT/dashboard/launcher-assets/portraits/dispatch.png
Terminal=false
Categories=Development;
StartupNotify=false
EOF
  ok "desktop entry written"
}

# ---------- verify-only path ----------
if [[ "$VERIFY_ONLY" == true ]]; then
  log "Verify-only mode (read-only health check)"
  command -v claude >/dev/null 2>&1 || fail "claude CLI missing on host"
  command -v node >/dev/null 2>&1 || fail "node missing on host"
  command -v ffplay >/dev/null 2>&1 || fail "ffplay missing on host"
  verify_kokoro || fail "Kokoro venv drift"
  verify_whisper || fail "whisper.cpp not ready"
  ok "All checks passed."
  exit 0
fi

# ---------- main ----------
check_host
ensure_claude_code
ensure_kokoro_venv
ensure_whisper
ensure_claude_hook
write_env_file
write_start_script
write_desktop_entry

cat <<EOF

==================================================================
MultiDeck install complete (generic Linux).

Next steps:
  1. Start the dashboard:
       $SCRIPT_DIR/start-dashboard.sh

  2. Open the launcher in your browser:
       http://localhost:${DISPATCH_PORT:-3046}/launcher

  3. First-time Claude Code auth:
       claude login

For docs: docs/INSTALL.md, docs/TROUBLESHOOTING.md
==================================================================
EOF
