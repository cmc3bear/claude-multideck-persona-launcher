#!/usr/bin/env bash
# =====================================================
#  Stage a built tarball into the layout steamcmd expects.
#
#  Takes the .tar.zst from build-tarball.sh, extracts it
#  into build-staging/depot/, and verifies depot.vdf +
#  app_build.vdf are populated.
#
#  Usage:
#    ./stage-steamworks-build.sh <tarball> [staging-dir]
#
#  Defaults staging-dir to ./build-staging next to this script.
# =====================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <tarball> [staging-dir]" >&2
  exit 2
fi

TARBALL="$1"
STAGING="${2:-$SCRIPT_DIR/build-staging}"

log()  { printf '\033[1;36m[stage]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$TARBALL" ]] || fail "tarball not found: $TARBALL"

# Validate .vdf files have been populated from templates
for vdf in depot.vdf app_build.vdf; do
  if [[ ! -f "$SCRIPT_DIR/$vdf" ]]; then
    fail "$vdf not found. Copy from $vdf.template and fill in IDs."
  fi
  if grep -q "REPLACE_WITH_" "$SCRIPT_DIR/$vdf"; then
    fail "$vdf still has REPLACE_WITH_ placeholders. Fill them in first."
  fi
done

log "Cleaning $STAGING"
rm -rf "$STAGING"
mkdir -p "$STAGING/depot" "$STAGING/build-output"

log "Extracting $TARBALL into $STAGING/depot"
case "$TARBALL" in
  *.tar.zst) tar --zstd -xf "$TARBALL" -C "$STAGING/depot" --strip-components=1 ;;
  *.tar.gz)  tar -xzf "$TARBALL" -C "$STAGING/depot" --strip-components=1 ;;
  *.tar)     tar -xf "$TARBALL" -C "$STAGING/depot" --strip-components=1 ;;
  *)         fail "unsupported archive format: $TARBALL" ;;
esac

ok "depot staged at $STAGING/depot"
ok "ready to upload:"
echo "  cd $SCRIPT_DIR && steamcmd +login <user> +run_app_build app_build.vdf +quit"
