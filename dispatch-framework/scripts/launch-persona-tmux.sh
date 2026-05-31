#!/usr/bin/env bash
# =====================================================
#  MultiDeck Persona Launcher — tmux (WSL) transport
#
#  Spawns a Codex persona into a tiled pane within a single tmux
#  session named 'multideck'. Topology B (operator decision 2026-04-26):
#  one session, one window, N tiled panes — one persona per pane.
#
#  Per-pane identity:
#    - pane title carries the callsign with embedded #[fg=color_hex] escape
#    - select-pane -P sets content fg tint to color_hex
#    - active-pane border highlights focused persona via global style
#
#  This is the WSL/Linux counterpart to scripts/launch-persona.ps1. The ps1
#  remains the default transport; this script activates when the operator
#  passes --transport tmux to the dashboard or invokes this script directly
#  from a WSL shell.
#
#  Audio path: B-2 — relies on the WSL Kokoro venv at
#  $DISPATCH_KOKORO_VENV (default: ~/.dispatch-kokoro-venv) installed per
#  job MULTI-FEAT-0055 task 5. Hooks under hooks/ run native in WSL Python.
#
#  Usage:
#    launch-persona-tmux.sh <persona-key> [initial-prompt] [--no-attach]
#
#  Examples:
#    launch-persona-tmux.sh engineer
#    launch-persona-tmux.sh dispatch "quick sanity check"
#    launch-persona-tmux.sh engineer --no-attach    # for dashboard caller
#
#  Environment:
#    DISPATCH_ROOT             Framework root (auto-detected)
#    DISPATCH_USER_ROOT        Workspace root for personas with that cwd
#    DISPATCH_PERSONAS_JSON    Override personas registry path
#    DISPATCH_KOKORO_VENV      WSL Kokoro venv (default ~/.dispatch-kokoro-venv)
#    DISPATCH_TMUX_SESSION     Session name (default 'multideck')
#    DISPATCH_CODEX_BIN        Override codex binary. When unset, prefers a
#                              native WSL codex and falls back to the Windows
#                              npm codex.cmd shim through cmd.exe.
# =====================================================

set -euo pipefail

usage() {
  sed -n '2,/^# =====/p' "${BASH_SOURCE[0]}" | sed 's/^#\s\?//'
  exit "${1:-0}"
}

ATTACH=true
SAFE=false
CWD_OVERRIDE=""
PERSONA=""
PROMPT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-attach) ATTACH=false; shift ;;
    --safe)      SAFE=true; shift ;;
    --dangerous) SAFE=false; shift ;;
    --cwd)       CWD_OVERRIDE="$2"; shift 2 ;;
    -h|--help)   usage 0 ;;
    --) shift; break ;;
    -*) echo "unknown flag: $1" >&2; usage 2 ;;
    *)
      if [[ -z "$PERSONA" ]]; then PERSONA="$1"
      elif [[ -z "$PROMPT" ]]; then PROMPT="$1"
      else echo "extra arg: $1" >&2; usage 2
      fi
      shift ;;
  esac
done

[[ -n "$PERSONA" ]] || usage 2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_ROOT="${DISPATCH_ROOT:-$(dirname "$SCRIPT_DIR")}"
DISPATCH_USER_ROOT="${DISPATCH_USER_ROOT:-$(dirname "$DISPATCH_ROOT")}"
DISPATCH_PERSONAS_JSON="${DISPATCH_PERSONAS_JSON:-$DISPATCH_ROOT/personas/personas.json}"
DISPATCH_KOKORO_VENV="${DISPATCH_KOKORO_VENV:-$HOME/.dispatch-kokoro-venv}"
SESSION="${DISPATCH_TMUX_SESSION:-multideck}"
CODEX_BIN="${DISPATCH_CODEX_BIN:-}"
CODEX_MODE="native"
WINDOWS_CODEX_CMD=""
WINDOWS_CODEX_JS=""

# Prefer native WSL tools for tmux. Windows PATH interop can put symlinked
# node.exe/codex shims ahead of Ubuntu binaries; those do not provide a stable
# TUI inside tmux.
export PATH="$HOME/.npm-global/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/sbin:/usr/local/bin:$PATH"

[[ -f "$DISPATCH_PERSONAS_JSON" ]] || {
  echo "personas.json not found at $DISPATCH_PERSONAS_JSON" >&2; exit 1
}

# Translate Windows-style paths (C:/foo) to WSL (/mnt/c/foo)
to_wsl_path() {
  local p="$1"
  if [[ "$p" =~ ^([A-Za-z]):[/\\](.*)$ ]]; then
    local drive
    drive="$(echo "${BASH_REMATCH[1]}" | tr 'A-Z' 'a-z')"
    local rest="${BASH_REMATCH[2]//\\//}"
    echo "/mnt/$drive/$rest"
  else
    echo "$p"
  fi
}

to_windows_path() {
  local p="$1"
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$p"
  else
    echo "$p"
  fi
}

sq() {
  local s="$1"
  printf "'%s'" "${s//\'/\'\\\'\'}"
}

cmd_dq() {
  local s="$1"
  s="${s//\"/\"\"}"
  printf '"%s"' "$s"
}

resolve_codex_runtime() {
  if [[ -n "$CODEX_BIN" ]]; then
    CODEX_MODE="native"
    return
  fi

  local found
  found="$(command -v codex 2>/dev/null || true)"
  if [[ -n "$found" && "$found" != /mnt/* ]]; then
    CODEX_BIN="$found"
    CODEX_MODE="native"
    return
  fi

  cat >&2 <<'EOF'
native codex not found in WSL.

Install native Codex inside WSL. Windows npm shims are intentionally rejected
because they do not provide a stable tmux TUI and cannot share WSL trust state.
EOF
  exit 1
}

resolve_codex_runtime

# Read a single persona field, resolving ${DISPATCH_*} placeholders
read_persona_field() {
  local field="$1"
  PERSONA="$PERSONA" FIELD="$field" \
  DISPATCH_ROOT="$DISPATCH_ROOT" \
  DISPATCH_USER_ROOT="$DISPATCH_USER_ROOT" \
  DISPATCH_PERSONAS_JSON="$DISPATCH_PERSONAS_JSON" \
  python3 - <<'PY'
import json, os, sys
with open(os.environ['DISPATCH_PERSONAS_JSON'], encoding='utf-8') as f:
    d = json.load(f)
key = os.environ['PERSONA'].lower()
p = d.get('personas', {}).get(key)
if not p:
    sys.stderr.write(f"unknown persona: {key}\n")
    sys.exit(1)
val = p.get(os.environ['FIELD'], '')
for var in ('DISPATCH_ROOT', 'DISPATCH_USER_ROOT'):
    val = val.replace('${' + var + '}', os.environ.get(var, ''))
print(val)
PY
}

CALLSIGN="$(read_persona_field callsign)"
COLOR_HEX="$(read_persona_field color_hex)"
TAB_COLOR="$(read_persona_field tab_color)"
VOICE_KEY="$(read_persona_field voice_key)"
RAW_CWD="$(read_persona_field cwd)"
CWD="$(to_wsl_path "$RAW_CWD")"

[[ -d "$CWD" ]] || {
  echo "cwd does not exist: $CWD (raw: $RAW_CWD)" >&2
  CWD="$DISPATCH_ROOT"
}

if [[ -n "$CWD_OVERRIDE" ]]; then
  CWD="$CWD_OVERRIDE"
  [[ -d "$CWD" ]] || { echo "cwd override does not exist: $CWD" >&2; exit 1; }
fi

ensure_codex_trust() {
  local trust_path="$1"
  local config="${CODEX_HOME:-$HOME/.codex}/config.toml"
  mkdir -p "$(dirname "$config")"
  CODEX_TRUST_PATH="$trust_path" CODEX_CONFIG="$config" python3 - <<'PY'
import os
from pathlib import Path

path = os.environ["CODEX_TRUST_PATH"]
config = Path(os.environ["CODEX_CONFIG"])
text = config.read_text(encoding="utf-8") if config.exists() else ""

section = f'[projects."{path.replace(chr(92), chr(92) * 2).replace(chr(34), chr(92) + chr(34))}"]'
if section not in text:
    if text and not text.endswith("\n"):
        text += "\n"
    text += f'\n{section}\ntrust_level = "trusted"\n'
    config.write_text(text, encoding="utf-8")
PY
}

if [[ "$CODEX_MODE" == "native" ]]; then
  ensure_codex_trust "$CWD"
fi

# Resolve hooks dir in WSL terms for the activation prompt.
# Project-local hooks/ takes precedence; fall back to ~/.claude/hooks/ for
# projects that don't ship their own (e.g. the dispatch workspace coordinator).
HOOKS_WSL="$(to_wsl_path "$DISPATCH_ROOT/hooks")"
if [[ ! -f "$HOOKS_WSL/set-voice.py" ]]; then
  HOOKS_WSL="$(to_wsl_path "$HOME/.claude/hooks")"
  if [[ ! -f "$HOOKS_WSL/set-voice.py" ]]; then
    # Last resort: try Windows-side global hooks via /mnt/c
    HOOKS_WSL="/mnt/c/Users/$USER/.claude/hooks"
  fi
fi
SET_VOICE_PY="$HOOKS_WSL/set-voice.py"

# Build activation prompt — mirrors launch-persona.ps1 structure
PROMPT_FILE="$(mktemp -t multideck-prompt-XXXXXX.txt)"
trap 'rm -f "$PROMPT_FILE"' EXIT

cat >"$PROMPT_FILE" <<EOF
Your first actions on startup, in this exact order:

1. Set the terminal title to "$CALLSIGN" by printing the ANSI escape:
   printf '\\033]0;$CALLSIGN\\007'

2. Load the $CALLSIGN persona from $DISPATCH_ROOT/personas/$(read_persona_field agent_file | sed 's|^personas/||').

3. Orient and stand ready for user instructions.
EOF

if [[ -n "$PROMPT" ]]; then
  printf '\nUser initial request: %s\n' "$PROMPT" >>"$PROMPT_FILE"
fi

# Persist prompt across script exit (codex reads it after we send-keys)
PERSIST_PROMPT="$HOME/.cache/multideck/prompt-${PERSONA}-$$.txt"
mkdir -p "$(dirname "$PERSIST_PROMPT")"
cp "$PROMPT_FILE" "$PERSIST_PROMPT"

PERSIST_RUNNER="$HOME/.cache/multideck/run-${PERSONA}-$$.sh"
if [[ "$CODEX_MODE" == "windows-cmd" ]]; then
  [[ -n "$WINDOWS_CODEX_JS" ]] || { echo "codex Windows JS entrypoint not found for $WINDOWS_CODEX_CMD" >&2; exit 1; }
  WIN_CWD="$(to_windows_path "$CWD")"
  CODEX_FLAGS=""
  if ! $SAFE; then
    CODEX_FLAGS="'--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust', "
  fi
cat >"$PERSIST_RUNNER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PATH="\$HOME/.npm-global/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/sbin:/usr/local/bin:\$PATH"
PROMPT_B64="\$(base64 -w0 $(sq "$PERSIST_PROMPT"))"
PS_SCRIPT="\$(cat <<'PS'
\$prompt = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PROMPT_B64__'))
\$codexArgs = @(${CODEX_FLAGS}'--cd', '$(printf "%s" "$WIN_CWD" | sed "s/'/''/g")', \$prompt)
& 'node.exe' '$(printf "%s" "$WINDOWS_CODEX_JS" | sed "s/'/''/g")' @codexArgs
exit \$LASTEXITCODE
PS
)"
PS_SCRIPT="\${PS_SCRIPT/__PROMPT_B64__/\$PROMPT_B64}"
PS_B64="\$(printf '%s' "\$PS_SCRIPT" | iconv -f UTF-8 -t UTF-16LE | base64 -w0)"
powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand "\$PS_B64"
EOF
else
  CODEX_BIN="${CODEX_BIN:-codex}"
  cat >"$PERSIST_RUNNER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export PATH="\$HOME/.npm-global/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/sbin:/usr/local/bin:\$PATH"
PROMPT_TEXT="\$(cat $(sq "$PERSIST_PROMPT"))"
$(sq "$CODEX_BIN") $(if $SAFE; then printf ""; else printf "%s" "--dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust "; fi)--cd $(sq "$CWD") "\$PROMPT_TEXT"
EOF
fi
chmod +x "$PERSIST_RUNNER"

# ---- tmux topology ----
# Reference windows/panes by ID (#{window_id}, #{pane_id}) instead of fixed
# index — operator's ~/.tmux.conf may set base-index != 0 (we recommend 1
# in multideck.tmux.conf), so :0 is not a stable target.
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -x 240 -y 60 -c "$CWD"
  WINDOW_ID="$(tmux list-windows -t "$SESSION" -F '#{window_id}' | head -1)"
  tmux set -t "$SESSION" -g pane-border-status top
  tmux set -t "$SESSION" -g pane-border-format "#{pane_title}"
  # Per-session styling defaults — user ~/.tmux.conf may already set richer
  # cyberpunk styling; these are conservative fallbacks for ad-hoc spawns.
  if [[ -z "$(tmux show -t "$SESSION" -gv pane-active-border-style 2>/dev/null)" ]]; then
    tmux set -t "$SESSION" -g pane-active-border-style "fg=#FFFFFF,bold"
    tmux set -t "$SESSION" -g pane-border-style        "fg=#444444"
  fi
  PANE_ID="$(tmux list-panes -t "$WINDOW_ID" -F '#{pane_id}' | head -1)"
else
  WINDOW_ID="$(tmux list-windows -t "$SESSION" -F '#{window_id}' | head -1)"
  PANE_ID="$(tmux split-window -P -F '#{pane_id}' -t "$WINDOW_ID" -c "$CWD")"
  tmux select-layout -t "$WINDOW_ID" tiled
fi
PANE_TARGET="$PANE_ID"

# Per-pane identity: title with embedded color escape (callsign + cwd-tail
# for richer at-a-glance context). Content fg tint matches the persona accent.
CWD_TAIL="$(basename "$CWD")"
TITLE="#[fg=${COLOR_HEX},bold] ${CALLSIGN} #[fg=#607090,nobold]· ${CWD_TAIL} #[default]"
tmux select-pane -t "$PANE_TARGET" -T "$TITLE"
tmux select-pane -t "$PANE_TARGET" -P "fg=${COLOR_HEX}"

# Persona auto-greet: drop the persona's intro mp3 (if it exists) into the
# tts-output directory with a fresh timestamp so the audio feed dashboard
# auto-plays it. Fire-and-forget; harmless if no intro asset exists.
INTRO_MP3="$DISPATCH_ROOT/dashboard/launcher-assets/intros/${PERSONA}.mp3"
TTS_OUT_DIR="${DISPATCH_TTS_OUTPUT:-$DISPATCH_ROOT/tts-output}"
if [[ -f "$INTRO_MP3" && -d "$TTS_OUT_DIR" ]]; then
  cp "$INTRO_MP3" "$TTS_OUT_DIR/$(date +%s)-${PERSONA}-intro.mp3" 2>/dev/null || true
fi

# Boot sequence inside the pane: ASCII banner first, then Codex
SCRIPT_DIR_ESC="$(printf '%q' "$SCRIPT_DIR")"
RUNNER_ESC="$(printf '%q' "$PERSIST_RUNNER")"
tmux send-keys -t "$PANE_TARGET" "clear" Enter
tmux send-keys -t "$PANE_TARGET" \
  "$SCRIPT_DIR_ESC/multideck-banner.sh '$CALLSIGN' '$COLOR_HEX'" Enter
tmux send-keys -t "$PANE_TARGET" "$RUNNER_ESC" Enter

# ---- Attach unless dashboard caller suppressed it ----
if $ATTACH; then
  if [[ -n "${TMUX:-}" ]]; then
    tmux switch-client -t "$SESSION"
  else
    tmux attach -t "$SESSION"
    status=$?
    echo "tmux attach exited with status $status. Press Enter to close this window."
    read -r _ || true
    exit "$status"
  fi
fi
