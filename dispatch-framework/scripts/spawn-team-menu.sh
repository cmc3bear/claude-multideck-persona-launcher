#!/usr/bin/env bash
# Display a tmux popup menu of team presets from dashboard/team-presets.json.
# When picked, spawns each persona in the team into the multideck session
# via launch-persona-tmux.sh --no-attach (one viewer wt window opens for the
# first member if no session exists; rest pack in silently).
#
# Bind in ~/.tmux.conf (already done by multideck.tmux.conf):
#   bind-key -n C-S-t run-shell ".../scripts/spawn-team-menu.sh"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH_ROOT="${DISPATCH_ROOT:-$(dirname "$SCRIPT_DIR")}"
PRESETS_JSON="${DISPATCH_TEAM_PRESETS:-$DISPATCH_ROOT/dashboard/team-presets.json}"
LAUNCH_SCRIPT="$SCRIPT_DIR/launch-persona-tmux.sh"

[[ -f "$PRESETS_JSON" ]] || {
  tmux display-message "team-presets.json missing: $PRESETS_JSON"; exit 1;
}

PRESETS_JSON="$PRESETS_JSON" LAUNCH_SCRIPT="$LAUNCH_SCRIPT" python3 - <<'PY' >"/tmp/multideck-team-menu.$$"
import json, os, shlex
with open(os.environ['PRESETS_JSON'], encoding='utf-8') as f:
    d = json.load(f)
launch = os.environ['LAUNCH_SCRIPT']
seen = set()
for p in d.get('presets', []):
    name = p.get('name', p.get('id', '?'))
    personas = p.get('personas', [])
    label = f"{name} ({len(personas)})"
    hotkey = ''
    for ch in name:
        if ch.isalpha() and ch.lower() not in seen:
            hotkey = ch.lower(); seen.add(hotkey); break
    # Compose: spawn each persona in the team back-to-back (sleep 0.7 between
    # so tmux pane operations and any wt window stagger settle).
    bash_cmd = ' && '.join(
        f"sleep {0.7 * i} && {shlex.quote(launch)} {shlex.quote(k)} --no-attach"
        for i, k in enumerate(personas)
    )
    cmd = f"run-shell {shlex.quote('bash -c ' + shlex.quote(bash_cmd))}"
    print(f"{label}|{hotkey}|{cmd}")
PY

MENU_ARGS=()
while IFS='|' read -r label hotkey cmd; do
  [[ -z "$label" ]] && continue
  MENU_ARGS+=("$label" "$hotkey" "$cmd")
done <"/tmp/multideck-team-menu.$$"
rm -f "/tmp/multideck-team-menu.$$"

tmux display-menu -T " spawn team " -x C -y C "${MENU_ARGS[@]}"
