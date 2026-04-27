#!/usr/bin/env bash
# =====================================================
#  MultiDeck Persona Launcher — tmux (WSL) transport
#
#  Spawns a Claude Code persona into a tiled pane within a single tmux
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
#    launch-persona-tmux.sh launcher-engineer
#    launch-persona-tmux.sh dispatch "quick sanity check"
#    launch-persona-tmux.sh engineer --no-attach    # for dashboard caller
#
#  Environment:
#    DISPATCH_ROOT             Framework root (auto-detected)
#    DISPATCH_USER_ROOT        Workspace root for personas with that cwd
#    DISPATCH_PERSONAS_JSON    Override personas registry path
#    DISPATCH_KOKORO_VENV      WSL Kokoro venv (default ~/.dispatch-kokoro-venv)
#    DISPATCH_TMUX_SESSION     Session name (default 'multideck')
#    DISPATCH_CLAUDE_BIN       Override claude binary (default 'claude'; set to
#                              'echo' for tmux-only dry runs without a real spawn)
# =====================================================

set -euo pipefail

usage() {
  sed -n '2,/^# =====/p' "${BASH_SOURCE[0]}" | sed 's/^#\s\?//'
  exit "${1:-0}"
}

ATTACH=true
PERSONA=""
PROMPT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-attach) ATTACH=false; shift ;;
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
CLAUDE_BIN="${DISPATCH_CLAUDE_BIN:-claude}"

[[ -f "$DISPATCH_PERSONAS_JSON" ]] || {
  echo "personas.json not found at $DISPATCH_PERSONAS_JSON" >&2; exit 1
}

# Translate Windows-style paths (F:/foo) to WSL (/mnt/f/foo)
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

2. Use the Bash tool to run exactly this command (forward slashes, single-quoted path):
   python3 '$SET_VOICE_PY' $VOICE_KEY
   This writes the per-session voice config (uses CLAUDE_CODE_SSE_PORT).
   Do NOT write to the shared voice-config.json file.

3. Load the $CALLSIGN persona from $DISPATCH_ROOT/personas/$(read_persona_field agent_file | sed 's|^personas/||').

4. Orient and stand ready for user instructions.
EOF

if [[ -n "$PROMPT" ]]; then
  printf '\nUser initial request: %s\n' "$PROMPT" >>"$PROMPT_FILE"
fi

# Persist prompt across script exit (claude reads it after we send-keys)
PERSIST_PROMPT="$HOME/.cache/multideck/prompt-${PERSONA}-$$.txt"
mkdir -p "$(dirname "$PERSIST_PROMPT")"
cp "$PROMPT_FILE" "$PERSIST_PROMPT"

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
  tmux split-window -t "$WINDOW_ID" -c "$CWD"
  tmux select-layout -t "$WINDOW_ID" tiled
  PANE_ID="$(tmux list-panes -t "$WINDOW_ID" -F '#{pane_id}' | tail -1)"
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

# Boot sequence inside the pane: ASCII banner first, then venv + claude
SCRIPT_DIR_ESC="$(printf '%q' "$SCRIPT_DIR")"
tmux send-keys -t "$PANE_TARGET" "clear" Enter
tmux send-keys -t "$PANE_TARGET" \
  "$SCRIPT_DIR_ESC/multideck-banner.sh '$CALLSIGN' '$COLOR_HEX'" Enter
tmux send-keys -t "$PANE_TARGET" "source '$DISPATCH_KOKORO_VENV/bin/activate' 2>/dev/null" Enter
tmux send-keys -t "$PANE_TARGET" \
  "$CLAUDE_BIN --dangerously-skip-permissions --name '$CALLSIGN' \"\$(cat '$PERSIST_PROMPT')\"" Enter

# ---- Attach unless dashboard caller suppressed it ----
if $ATTACH; then
  if [[ -n "${TMUX:-}" ]]; then
    tmux switch-client -t "$SESSION"
  else
    exec tmux attach -t "$SESSION"
  fi
fi
