#!/usr/bin/env bash
# Hook script — invoked by tmux pane-focus-in. Reads the focused pane's
# embedded color escape from its title and sets pane-active-border-style
# to that color, so the focused pane's border matches the persona accent.
#
# Bound in multideck.tmux.conf:
#   set-hook -g pane-focus-in 'run-shell ".../multideck-active-border.sh"'
set -euo pipefail

# Pane title format from launch-persona-tmux.sh:
#   "#[fg=#14B8A6,bold] Launcher-Engineer #[default]"
# Extract the first hex color (the persona accent).
TITLE="$(tmux display-message -p '#{pane_title}' 2>/dev/null || true)"
COLOR="$(printf '%s' "$TITLE" | grep -oE '#[0-9A-Fa-f]{6}' | head -1 || true)"

# Fallback to the cyberpunk magenta if no embedded color (ad-hoc panes).
if [[ -z "$COLOR" ]]; then
  COLOR="#D946EF"
fi

tmux set -g pane-active-border-style "fg=${COLOR},bold" 2>/dev/null
