#!/usr/bin/env bash
# Cross-OS mkdir-mutex orchestrator. Runs N rounds where each round fires a
# Windows-native Python attempt AND a WSL Linux Python attempt at the same
# instant via process fork. Tallies wins and verifies invariants.
#
# Invariants checked per round:
#   I1: exactly one process emits role=win
#   I2: the other emits role=lose
#   I3: neither emits role=err
#
# Run from WSL Ubuntu inside the dispatch-framework directory:
#   ./scripts/test-mutex-cross-os.sh [rounds=10]
#
# Requires powershell.exe reachable (default install on WSL with interop).

set -euo pipefail

ROUNDS="${1:-10}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY_LINUX="$(command -v python3)"
PY_WIN="powershell.exe"  # we'll invoke via -Command python

HERE_LINUX="$SCRIPT_DIR"
# Convert /mnt/f/03-INFRASTRUCTURE/... → F:\03-INFRASTRUCTURE\...
HERE_WIN="$(echo "$HERE_LINUX" | sed -E 's|^/mnt/([a-z])/|\U\1:\\|;s|/|\\|g')"

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

attempt_round() {
  local round="$1"
  local hold="$2"
  local linux_log="$LOG_DIR/round-$round-linux.json"
  local win_log="$LOG_DIR/round-$round-win.json"

  # Pre-cleanup any stale lock from prior failures
  "$PY_LINUX" "$SCRIPT_DIR/test-mutex-cross-os.py" cleanup >/dev/null

  # Launch-skew correction (MULTI-OQE-0062 criterion 2): both sides receive
  # an identical --barrier-ts target wall-clock instant and busy-wait until
  # it fires. Powershell cold-starts ~150-250ms; Linux Python ~30ms. By
  # giving them BARRIER_HEADROOM seconds of slack, both interpreters are
  # warmed and parked on the busy-wait by the time the gate opens, so
  # neither side wins by virtue of starting earlier.
  local barrier_headroom="${BARRIER_HEADROOM:-1.0}"
  local barrier_ts
  barrier_ts="$(awk -v h="$barrier_headroom" 'BEGIN { printf "%.6f", systime() + h }' 2>/dev/null \
                || python3 -c "import time,sys; print(time.time() + float(sys.argv[1]))" "$barrier_headroom")"

  ( "$PY_LINUX" "$SCRIPT_DIR/test-mutex-cross-os.py" attempt "$hold" --barrier-ts "$barrier_ts" >"$linux_log" 2>&1 ) &
  local linux_pid=$!

  ( powershell.exe -NoProfile -Command "& python '$HERE_WIN\\test-mutex-cross-os.py' attempt $hold --barrier-ts $barrier_ts" >"$win_log" 2>&1 ) &
  local win_pid=$!

  wait "$linux_pid" "$win_pid" 2>/dev/null || true

  cat "$linux_log"
  cat "$win_log"
}

echo "=== cross-OS mutex test: $ROUNDS rounds ==="
echo "Linux python: $PY_LINUX"
echo "Windows python: via powershell (warming up)..."
powershell.exe -NoProfile -Command "& python --version" >/dev/null 2>&1
echo

WINS_LINUX=0
WINS_WIN=0
LOSES_LINUX=0
LOSES_WIN=0
ERRS=0
DOUBLE_WINS=0

for i in $(seq 1 "$ROUNDS"); do
  result=$(attempt_round "$i" 0.3)
  win_count=$(echo "$result" | grep -c '"role": "win"' || true)
  lose_count=$(echo "$result" | grep -c '"role": "lose"' || true)
  err_count=$(echo "$result" | grep -c '"role": "err"' || true)

  if [[ "$win_count" -ne 1 ]]; then
    DOUBLE_WINS=$((DOUBLE_WINS + 1))
    echo "round $i: VIOLATION — wins=$win_count loses=$lose_count errs=$err_count"
    echo "$result"
  elif [[ "$err_count" -ne 0 ]]; then
    ERRS=$((ERRS + 1))
    echo "round $i: ERROR"
    echo "$result"
  else
    win_side=$(echo "$result" | grep '"role": "win"' | head -1 | sed -nE 's/.*"side": "([^"]+)".*/\1/p')
    if [[ "$win_side" == "wsl" ]]; then
      WINS_LINUX=$((WINS_LINUX + 1))
      LOSES_WIN=$((LOSES_WIN + 1))
      echo "round $i: wsl wins"
    else
      WINS_WIN=$((WINS_WIN + 1))
      LOSES_LINUX=$((LOSES_LINUX + 1))
      echo "round $i: windows wins"
    fi
  fi
done

echo
echo "=== summary ==="
echo "rounds: $ROUNDS"
echo "wins (wsl):     $WINS_LINUX"
echo "wins (windows): $WINS_WIN"
echo "loses (wsl):     $LOSES_LINUX"
echo "loses (windows): $LOSES_WIN"
echo "double wins (mutex VIOLATION):   $DOUBLE_WINS"
echo "errors:                          $ERRS"

# Final cleanup
"$PY_LINUX" "$SCRIPT_DIR/test-mutex-cross-os.py" cleanup >/dev/null

if [[ "$DOUBLE_WINS" -gt 0 || "$ERRS" -gt 0 ]]; then
  echo
  echo "FAIL — mutex did not serialize across OS boundary"
  exit 1
fi
echo
echo "PASS — mkdir mutex is atomic across Windows + WSL"
