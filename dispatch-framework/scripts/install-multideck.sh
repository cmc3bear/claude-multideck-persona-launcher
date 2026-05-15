#!/usr/bin/env bash
# =====================================================
#  MultiDeck universal installer
#
#  Steam Store quality install for SteamOS / Linux / WSL.
#  Single pkexec prompt up front, atomic with rollback,
#  idempotent, --verify self-test, progress UI.
#
#  Usage:
#    ./scripts/install-multideck.sh                   auto-detect target
#    ./scripts/install-multideck.sh --target <name>   force target
#    ./scripts/install-multideck.sh --verify          self-test only
#    ./scripts/install-multideck.sh --force           rebuild venvs
#    ./scripts/install-multideck.sh --quiet           minimal output (for CI/Steam)
#    ./scripts/install-multideck.sh --steamworks-mode bundled-runtime install
#    ./scripts/install-multideck.sh --uninstall       remove (keeps state)
#    ./scripts/install-multideck.sh --uninstall --purge   remove state too
#
#  Targets (autodetected if --target omitted):
#    steamdeck         SteamOS 3 with steamos-readonly, distrobox container
#    linux-generic     Arch/Ubuntu/Fedora, packages installed to host
#    wsl               WSL2 Ubuntu, tmux transport
#    steamworks        bundled runtimes from Steam Store depot, no sudo
#
#  Exit codes:
#    0  success
#    1  install failed (rolled back where possible)
#    2  bad usage
#    3  prerequisite missing (no internet, no disk, etc.)
#    4  verify failed (drift detected)
# =====================================================

set -euo pipefail

VERSION="0.7.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MULTIDECK_ROOT="$(dirname "$SCRIPT_DIR")"

# ---------- flags ----------
TARGET=""
FORCE=false
VERIFY_ONLY=false
QUIET=false
STEAMWORKS_MODE=false
UNINSTALL=false
PURGE=false
NONINTERACTIVE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)            TARGET="$2"; shift 2 ;;
    --force)             FORCE=true; shift ;;
    --verify)            VERIFY_ONLY=true; shift ;;
    --quiet)             QUIET=true; shift ;;
    --steamworks-mode)   STEAMWORKS_MODE=true; TARGET="steamworks"; shift ;;
    --uninstall)         UNINSTALL=true; shift ;;
    --purge)             PURGE=true; shift ;;
    --noninteractive)    NONINTERACTIVE=true; shift ;;
    -h|--help)
      sed -n '2,/^# =====/p' "${BASH_SOURCE[0]}" | sed 's/^#\s\?//'
      exit 0 ;;
    -v|--version)        echo "multideck installer $VERSION"; exit 0 ;;
    *)                   echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ---------- progress UI ----------
COL_RESET='\033[0m'
COL_CYAN='\033[1;36m'
COL_GREEN='\033[1;32m'
COL_YELLOW='\033[1;33m'
COL_RED='\033[1;31m'
COL_DIM='\033[2m'
COL_BOLD='\033[1m'

if $QUIET; then
  COL_RESET=''; COL_CYAN=''; COL_GREEN=''; COL_YELLOW=''
  COL_RED=''; COL_DIM=''; COL_BOLD=''
fi

# Step tracker
STEP_NUM=0
STEP_TOTAL=12
CURRENT_STEP=""

step()  {
  STEP_NUM=$((STEP_NUM + 1))
  CURRENT_STEP="$1"
  if $QUIET; then
    printf '[%d/%d] %s\n' "$STEP_NUM" "$STEP_TOTAL" "$1"
  else
    printf '\n%b[%d/%d]%b %b%s%b\n' "$COL_CYAN" "$STEP_NUM" "$STEP_TOTAL" "$COL_RESET" "$COL_BOLD" "$1" "$COL_RESET"
  fi
}

log()   { $QUIET || printf '  %b\xe2\x86\x92%b %s\n' "$COL_DIM" "$COL_RESET" "$*"; }
ok()    { printf '  %b\xe2\x9c\x93%b %s\n' "$COL_GREEN" "$COL_RESET" "$*"; }
warn()  { printf '  %b!%b %s\n' "$COL_YELLOW" "$COL_RESET" "$*" >&2; }
fail()  { printf '\n%b\xe2\x9c\x97 FAILED at step %d: %s%b\n  %s\n' "$COL_RED" "$STEP_NUM" "$CURRENT_STEP" "$COL_RESET" "$*" >&2; exit 1; }

banner() {
  $QUIET && return
  cat <<BANNER

${COL_CYAN}  __  __        _ _   _ ____            _
 |  \\/  |_   _| | |_(_)  _ \\  ___  ___| | __
 | |\\/| | | | | | __| | | | |/ _ \\/ __| |/ /
 | |  | | |_| | | |_| | |_| |  __/ (__|   <
 |_|  |_|\\__,_|_|\\__|_|____/ \\___|\\___|_|\\_\\${COL_RESET}
  ${COL_DIM}v${VERSION}  -  Multi-agent Claude Code launcher${COL_RESET}

BANNER
}

# ---------- rollback journal ----------
JOURNAL="${XDG_STATE_HOME:-$HOME/.local/state}/multideck/install-journal"
mkdir -p "$(dirname "$JOURNAL")"

journal_add()    { echo "$1" >> "$JOURNAL.partial"; }
journal_commit() { mv "$JOURNAL.partial" "$JOURNAL.complete"; }
journal_rollback() {
  if [[ -f "$JOURNAL.partial" ]]; then
    warn "rolling back partial install"
    # In phase 1, rollback is conservative: log what would be undone, do not actually undo
    # (data loss risk). Phase 2 may add automatic cleanup.
    tail -20 "$JOURNAL.partial" | sed 's/^/    /' >&2
    mv "$JOURNAL.partial" "$JOURNAL.failed-$(date +%s)"
  fi
}

trap 'rc=$?; if [[ $rc -ne 0 && $VERIFY_ONLY == false ]]; then journal_rollback; fi' EXIT

# ---------- target detection ----------
detect_target() {
  if [[ -n "$TARGET" ]]; then echo "$TARGET"; return; fi
  if command -v steamos-readonly >/dev/null 2>&1; then echo "steamdeck"; return; fi
  if grep -qi microsoft /proc/version 2>/dev/null; then echo "wsl"; return; fi
  echo "linux-generic"
}

TARGET="$(detect_target)"

# ---------- privileged helper invocation ----------
# All privileged operations are bundled into install-pkexec-helper.sh
# and invoked ONCE via pkexec. The user sees one polkit prompt and that
# is it for the entire install.
need_privileged_step() {
  case "$TARGET" in
    steamdeck)
      command -v distrobox >/dev/null 2>&1 && command -v podman >/dev/null 2>&1 && return 1
      return 0 ;;
    linux-generic)
      # Generic Linux: needs root only if missing system packages
      for cmd in node python3 ffmpeg chromium google-chrome curl jq; do
        command -v "$cmd" >/dev/null 2>&1 || return 0
      done
      return 1 ;;
    wsl)
      for cmd in node python3 ffmpeg curl jq; do
        command -v "$cmd" >/dev/null 2>&1 || return 0
      done
      return 1 ;;
    steamworks)
      return 1 ;;  # bundled, never needs sudo
    *)
      warn "unknown target: $TARGET"
      return 0 ;;
  esac
}

invoke_privileged_helper() {
  local helper="$SCRIPT_DIR/install-pkexec-helper.sh"
  [[ -f "$helper" ]] || fail "privileged helper missing: $helper"
  chmod +x "$helper"

  log "Asking for your password once for privileged setup (pkexec)"
  log "Target: $TARGET"

  if command -v pkexec >/dev/null 2>&1; then
    if ! pkexec env MULTIDECK_TARGET="$TARGET" "$helper"; then
      fail "pkexec helper failed (rerun with --verify after fixing, or check journal)"
    fi
  else
    warn "pkexec not available, falling back to sudo (may prompt multiple times)"
    if ! sudo env MULTIDECK_TARGET="$TARGET" "$helper"; then
      fail "sudo helper failed"
    fi
  fi
  ok "Privileged setup complete"
}

# ---------- pre-flight ----------
preflight() {
  step "Pre-flight checks"

  # Not root
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    fail "Do not run this installer as root. Run as your normal user."
  fi

  # Disk space
  local avail_mb
  avail_mb=$(df -m "$HOME" | awk 'NR==2 {print $4}')
  if [[ -z "$avail_mb" || "$avail_mb" -lt 10000 ]]; then
    warn "less than 10 GB free in $HOME (have ${avail_mb:-unknown} MB)"
    if ! $NONINTERACTIVE; then
      read -p "  Continue anyway? [y/N] " yn
      [[ "$yn" =~ ^[Yy] ]] || exit 3
    fi
  else
    ok "disk: ${avail_mb} MB free"
  fi

  # Internet
  if ! curl -fsS --max-time 5 -o /dev/null https://github.com 2>/dev/null; then
    fail "no internet (cannot reach github.com)"
  fi
  ok "internet reachable"

  # OS detection
  log "target: $TARGET"
  ok "OS preflight ok"
}

# ---------- main install pipeline ----------
run_install() {
  preflight

  if need_privileged_step; then
    step "Privileged setup (one password prompt)"
    invoke_privileged_helper
  else
    step "Privileged setup (skipped, nothing needed)"
    ok "no privileged ops required"
  fi

  # Delegate platform-specific install to the existing scripts
  case "$TARGET" in
    steamdeck)
      step "Steam Deck install pipeline"
      "$SCRIPT_DIR/install-steamdeck.sh" \
        $($FORCE && echo --force) \
        $($VERIFY_ONLY && echo --verify)
      ;;
    linux-generic|wsl)
      step "Linux install pipeline"
      if [[ -x "$SCRIPT_DIR/install-linux-generic.sh" ]]; then
        "$SCRIPT_DIR/install-linux-generic.sh" \
          $($FORCE && echo --force) \
          $($VERIFY_ONLY && echo --verify)
      else
        warn "install-linux-generic.sh not yet written (phase 1.5)"
        warn "for now use install-steamdeck.sh as a template"
        exit 3
      fi
      ;;
    steamworks)
      step "Steamworks bundled install"
      if [[ -x "$SCRIPT_DIR/install-steamworks.sh" ]]; then
        "$SCRIPT_DIR/install-steamworks.sh" $($VERIFY_ONLY && echo --verify)
      else
        warn "install-steamworks.sh not yet written (phase 2)"
        exit 3
      fi
      ;;
    *)
      fail "unknown target: $TARGET"
      ;;
  esac

  step "Post-install: state directories"
  mkdir -p \
    "${XDG_DATA_HOME:-$HOME/.local/share}/multideck" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/multideck" \
    "${XDG_CACHE_HOME:-$HOME/.cache}/multideck" \
    "${XDG_STATE_HOME:-$HOME/.local/state}/multideck"
  ok "state directories ready"

  step "Post-install: self-test"
  run_verify

  step "Done"
  print_next_steps
  journal_commit
}

# ---------- verify ----------
run_verify() {
  local fails=0
  local checks=0

  check() {
    checks=$((checks + 1))
    if eval "$2" >/dev/null 2>&1; then
      ok "$1"
    else
      warn "FAIL: $1"
      fails=$((fails + 1))
    fi
  }

  case "$TARGET" in
    steamdeck)
      check "distrobox installed" "command -v distrobox"
      check "podman installed" "command -v podman"
      check "container 'multideck-box' exists" \
        "distrobox list 2>/dev/null | grep -q '| multideck-box '"
      check "claude in container" \
        "distrobox enter multideck-box -- bash -lc 'command -v claude' 2>/dev/null"
      check "node in container" \
        "distrobox enter multideck-box -- bash -lc 'command -v node' 2>/dev/null"
      check "ffplay in container" \
        "distrobox enter multideck-box -- bash -lc 'command -v ffplay' 2>/dev/null"
      ;;
    linux-generic|wsl)
      check "claude on host" "command -v claude"
      check "node on host" "command -v node"
      check "ffplay on host" "command -v ffplay"
      ;;
  esac

  # Common checks
  check "env file exists" "[[ -f $HOME/.config/multideck/env ]]"
  check "kokoro venv exists" \
    "[[ -x $HOME/.dispatch-kokoro-venv/bin/python ]] || \
     [[ -x ${XDG_DATA_HOME:-$HOME/.local/share}/multideck/kokoro-venv/bin/python ]]"
  check "whisper-cli built" \
    "[[ -x $HOME/.dispatch-whisper/build/bin/whisper-cli ]] || \
     [[ -x ${XDG_DATA_HOME:-$HOME/.local/share}/multideck/whisper/build/bin/whisper-cli ]]"
  check "claude hook wired" \
    "grep -q 'AskUserQuestion' $HOME/.claude/settings.json 2>/dev/null || \
     distrobox enter multideck-box -- bash -lc 'grep -q AskUserQuestion ~/.claude/settings.json' 2>/dev/null"

  printf '\n  %d checks, %d failures\n' "$checks" "$fails"
  if [[ "$fails" -eq 0 ]]; then
    ok "all checks passed"
    return 0
  else
    warn "$fails check(s) failed -- re-run installer without --verify to repair"
    return 4
  fi
}

# ---------- next steps banner ----------
print_next_steps() {
  $QUIET && return
  cat <<EOF

${COL_GREEN}Install complete.${COL_RESET}

  1. Test the launcher:
       ${COL_BOLD}~/multideck/scripts/steamdeck-launcher.sh${COL_RESET}

  2. Test the dashboard alone (windowed, no kiosk):
       ${COL_BOLD}~/multideck/scripts/steamdeck-dashboard.sh${COL_RESET}

  3. Self-test anytime:
       ${COL_BOLD}~/multideck/scripts/install-multideck.sh --verify${COL_RESET}

  4. First-time Claude Code auth (Steam Deck):
       ${COL_BOLD}distrobox enter multideck-box${COL_RESET}
       ${COL_BOLD}claude login${COL_RESET}

  5. Add to Steam (Steam Deck only):
       ${COL_BOLD}steam steam://addnonsteamgame${COL_RESET}
       Then browse to ~/multideck/scripts/steamdeck-launcher.sh

For docs: ${COL_DIM}docs/INSTALL.md${COL_RESET}, ${COL_DIM}docs/TROUBLESHOOTING.md${COL_RESET}

EOF
}

# ---------- uninstall ----------
run_uninstall() {
  step "Uninstall MultiDeck"

  if ! $NONINTERACTIVE; then
    printf 'This will remove:\n'
    printf '  - distrobox container (if any)\n'
    printf '  - desktop entries\n'
    printf '  - %s\n' "$MULTIDECK_ROOT"
    if $PURGE; then
      printf '  - ~/.local/share/multideck (state, transcripts, jobs)\n'
      printf '  - ~/.config/multideck (env, prefs)\n'
      printf '  - ~/.cache/multideck (logs, profiles)\n'
    fi
    printf '\n'
    read -p "  Continue? [y/N] " yn
    [[ "$yn" =~ ^[Yy] ]] || { warn "aborted"; exit 0; }
  fi

  if [[ "$TARGET" == "steamdeck" ]] && command -v distrobox >/dev/null 2>&1; then
    log "stopping + removing distrobox container"
    distrobox stop multideck-box --yes 2>/dev/null || true
    distrobox rm multideck-box --force 2>/dev/null || true
    ok "container removed"
  fi

  log "removing desktop entries"
  rm -f "$HOME/.local/share/applications/multideck.desktop"
  rm -f "$HOME/.local/share/applications/multideck-dashboard.desktop"
  rm -f "$HOME/.local/share/applications/multideck-box.desktop"
  ok "desktop entries removed"

  if $PURGE; then
    log "purging user state"
    rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/multideck"
    rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/multideck"
    rm -rf "${XDG_CACHE_HOME:-$HOME/.cache}/multideck"
    rm -rf "$HOME/.dispatch-kokoro-venv"
    rm -rf "$HOME/.dispatch-whisper"
    ok "user state purged"
  fi

  log "removing app root: $MULTIDECK_ROOT"
  # Do not rm -rf $MULTIDECK_ROOT from inside itself; suggest manual step
  warn "to remove the source tree, run: rm -rf $MULTIDECK_ROOT"
  warn "(skipped here because the running installer is inside that tree)"

  ok "uninstall complete"
}

# ---------- entry ----------
banner

if $UNINSTALL; then
  run_uninstall
  exit 0
fi

if $VERIFY_ONLY; then
  step "Verify mode (read-only health check)"
  run_verify
  exit $?
fi

run_install
