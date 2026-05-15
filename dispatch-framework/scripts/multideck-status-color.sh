#!/usr/bin/env bash
# Emit a hex color code based on time of day. Used by status-style format
# string in multideck.tmux.conf so the status bar accent shifts subtly
# through the day. Output: a single hex code without # prefix; tmux
# wraps it via #[fg=#$(...)] in the status format.
H=$(date +%H)
H=${H#0}  # strip leading zero
H=${H:-0}
if (( H >= 6 && H < 12 )); then
  echo "00FFCC"   # morning teal
elif (( H >= 12 && H < 17 )); then
  echo "FFB700"   # afternoon amber
elif (( H >= 17 && H < 21 )); then
  echo "FF00AA"   # evening magenta
else
  echo "0088FF"   # late blue
fi
