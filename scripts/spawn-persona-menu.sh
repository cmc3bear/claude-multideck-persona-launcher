#!/usr/bin/env bash
# Display a tmux popup menu of available personas. When the operator picks one,
# spawns it as a new tiled pane in the current multideck session via
# launch-persona-tmux.sh --no-attach (the operator's already attached).
#
# Bind in ~/.tmux.conf:
#   bind-key D run-shell "/mnt/f/03-INFRASTRUCTURE/dispatch-framework/scripts/spawn-persona-menu.sh"
#
# Press Ctrl+b D from any pane to invoke.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_ROOT="${DISPATCH_ROOT:-$(dirname "$SCRIPT_DIR")}"
DISPATCH_PERSONAS_JSON="${DISPATCH_PERSONAS_JSON:-$DISPATCH_ROOT/personas/personas.json}"
LAUNCH_SCRIPT="$SCRIPT_DIR/launch-persona-tmux.sh"

[[ -f "$DISPATCH_PERSONAS_JSON" ]] || {
  tmux display-message "personas.json missing: $DISPATCH_PERSONAS_JSON"; exit 1;
}

# Read persona keys + callsigns; emit one tmux menu entry per persona.
# Hotkey is the first letter of the key (deconflicted by python).
DISPATCH_PERSONAS_JSON="$DISPATCH_PERSONAS_JSON" LAUNCH_SCRIPT="$LAUNCH_SCRIPT" python3 - <<'PY' >"/tmp/multideck-menu-args.$$"
import json, os, shlex
with open(os.environ['DISPATCH_PERSONAS_JSON'], encoding='utf-8') as f:
    d = json.load(f)
launch = os.environ['LAUNCH_SCRIPT']
seen = set()
for key, p in d.get('personas', {}).items():
    callsign = p.get('callsign', key)
    # Pick hotkey: first non-collided letter of the key
    hotkey = ''
    for ch in key:
        if ch.isalpha() and ch.lower() not in seen:
            hotkey = ch.lower()
            seen.add(hotkey)
            break
    if not hotkey:
        hotkey = ''  # tmux accepts '' = no shortcut, just pick from list
    label = f"{callsign}"
    cmd = f"run-shell {shlex.quote(launch + ' ' + key + ' --no-attach')}"
    # tmux display-menu expects: name key command (each as separate args)
    # We emit as one line with '|' separators that the bash side splits on.
    print(f"{label}|{hotkey}|{cmd}")
PY

MENU_ARGS=()
while IFS='|' read -r label hotkey cmd; do
  [[ -z "$label" ]] && continue
  MENU_ARGS+=("$label" "$hotkey" "$cmd")
done <"/tmp/multideck-menu-args.$$"
rm -f "/tmp/multideck-menu-args.$$"

# tmux 3.0+ has display-menu. Render and let the operator pick.
tmux display-menu -T " spawn persona " -x C -y C "${MENU_ARGS[@]}"
