#!/usr/bin/env bash
# Measure tmux tiled-layout pane dimensions at varying pane counts on a fixed
# terminal size, to determine the readability threshold for the callsign +
# cwd-tail title format used by scripts/launch-persona-tmux.sh.
#
# MULTI-FEAT-0065 criterion 1 (empirical pane count threshold).
#
# Usage:
#   ./scripts/measure-pane-threshold.sh
#
# Output: JSON list { n, pane_width, pane_height, title_chars_visible }.

set -euo pipefail

SESSION="multideck-pane-probe-$$"
TERM_W=240
TERM_H=60
TITLE_FORMAT_LEN=37  # "Launcher-Engineer · dispatch-framework " ≈ 37 chars

trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true' EXIT

probe_n() {
  local n="$1"
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  tmux new-session -d -s "$SESSION" -x "$TERM_W" -y "$TERM_H"
  for i in $(seq 2 "$n"); do
    tmux split-window -t "$SESSION" 2>/dev/null
    tmux select-layout -t "$SESSION" tiled
  done

  local widths
  widths="$(tmux list-panes -t "$SESSION" -F '#{pane_width}' | sort -n | head -1)"

  local heights
  heights="$(tmux list-panes -t "$SESSION" -F '#{pane_height}' | sort -n | head -1)"

  # Conservative legibility heuristic: title is readable if pane_width is at
  # least the title format length plus 4 chars of border padding.
  local readable="no"
  if [[ "$widths" -ge $((TITLE_FORMAT_LEN + 4)) ]]; then
    readable="yes"
  fi

  echo "{\"n\": $n, \"min_pane_width\": $widths, \"min_pane_height\": $heights, \"title_chars_needed\": $TITLE_FORMAT_LEN, \"readable\": \"$readable\"}"
}

echo "["
first=true
for n in 4 5 9 12 15 20 25; do
  if [[ "$first" == false ]]; then echo ","; fi
  first=false
  probe_n "$n"
done
echo "]"
