#!/usr/bin/env bash
# Print a stylized callsign banner before claude takes over the pane.
# Called from launch-persona-tmux.sh just before the claude invocation.
#
# Usage: multideck-banner.sh <callsign> <color_hex>
set -euo pipefail
CALLSIGN="${1:-OPERATIVE}"
COLOR_HEX="${2:-#00FFCC}"

# Strip leading # if present, then build ANSI 24-bit fg sequence
HEX="${COLOR_HEX#'#'}"
R=$((16#${HEX:0:2}))
G=$((16#${HEX:2:2}))
B=$((16#${HEX:4:2}))
ESC=$(printf '\e[38;2;%s;%s;%sm' "$R" "$G" "$B")
DIM=$'\e[38;2;96;112;144m'
BOLD=$'\e[1m'
RST=$'\e[0m'

# Box-drawing banner
LINE=$(printf -- '─%.0s' $(seq 1 $((${#CALLSIGN} + 8))))
printf '\n'
printf '  %s%s┌%s┐%s\n' "$BOLD" "$ESC" "$LINE" "$RST"
printf '  %s%s│%s>>  %s  <<%s%s│%s\n' "$BOLD" "$ESC" "$RST$BOLD$ESC" "$CALLSIGN" "$RST" "$BOLD$ESC" "$RST"
printf '  %s%s└%s┘%s\n' "$BOLD" "$ESC" "$LINE" "$RST"
printf '  %sMultiDeck operative online%s\n' "$DIM" "$RST"
printf '\n'
