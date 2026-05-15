#!/usr/bin/env bash
# Minimap popup — lists all panes in multideck session with index, callsign,
# color, current command, and idle time. Press a number to jump to that pane.
# Called by Ctrl+Shift+M keybinding via display-popup.
set -euo pipefail

SESSION="${DISPATCH_TMUX_SESSION:-multideck}"

C_TEAL=$'\e[38;2;0;255;204m'
C_PINK=$'\e[38;2;255;0;170m'
C_DIM=$'\e[38;2;96;112;144m'
C_BOLD=$'\e[1m'
C_RST=$'\e[0m'

clear
printf '%s%s┌─ MULTIDECK MINIMAP ─' "$C_BOLD" "$C_TEAL"
printf '%s\n%s\n\n' "$(printf -- '─%.0s' {1..40})" "$C_RST"

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  printf '  %sno %s session%s\n' "$C_PINK" "$SESSION" "$C_RST"
  printf '\n%s(press any key to close)%s\n' "$C_DIM" "$C_RST"
  read -n 1 -s
  exit 0
fi

# Header
printf '  %s%-3s %-22s %-10s %-9s%s\n' "$C_DIM" "IDX" "CALLSIGN" "CMD" "IDLE" "$C_RST"
printf '  %s%s%s\n' "$C_DIM" "$(printf -- '─%.0s' {1..52})" "$C_RST"

# List panes
NOW=$(date +%s)
tmux list-panes -t "$SESSION" -F '#{pane_index}|#{pane_title}|#{pane_current_command}|#{pane_active}' | while IFS='|' read -r idx title cmd active; do
  # Strip tmux color escapes from title for display
  callsign=$(printf '%s' "$title" | sed -E 's/#\[[^]]*\]//g; s/^[[:space:]]*//; s/[[:space:]]*$//')
  # Pull the embedded persona color hex out of the original title
  color=$(printf '%s' "$title" | grep -oE '#[0-9A-Fa-f]{6}' | head -1)
  [[ -z "$color" ]] && color="#888888"
  # ANSI 24-bit RGB from hex
  r=$((16#${color:1:2})); g=$((16#${color:3:2})); b=$((16#${color:5:2}))
  ESC="\e[38;2;${r};${g};${b}m"
  # Active marker
  marker=" "
  [[ "$active" == "1" ]] && marker="*"
  # Truncate cmd
  cmd_short=$(printf '%s' "$cmd" | cut -c1-10)
  # Idle: tmux gives pane_activity (epoch); we need to fetch it per pane
  activity=$(tmux display-message -p -t "${SESSION}.${idx}" '#{pane_activity}' 2>/dev/null || echo "$NOW")
  idle=$(( NOW - activity ))
  if [[ "$idle" -lt 60 ]]; then
    idle_str="${idle}s"
  elif [[ "$idle" -lt 3600 ]]; then
    idle_str="$((idle/60))m"
  else
    idle_str="$((idle/3600))h"
  fi
  printf "  ${marker} ${ESC}%-3s%s ${ESC}%-22s%s %-10s %-9s\n" "$idx" "$C_RST" "$callsign" "$C_RST" "$cmd_short" "$idle_str"
done

printf '\n%s%s* = focused pane%s\n' "$C_DIM" "$C_BOLD" "$C_RST"
printf '%s(press a number to jump, q to close)%s\n' "$C_DIM" "$C_RST"

# Read single key
read -n 1 -s key
if [[ "$key" =~ ^[0-9]$ ]]; then
  tmux select-pane -t "${SESSION}.${key}" 2>/dev/null || true
fi
