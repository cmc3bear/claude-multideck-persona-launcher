#!/usr/bin/env bash
# =====================================================
#  MultiDeck Steamworks tarball builder
#
#  Produces a self-contained tarball suitable for Steamworks depot
#  upload. Targets Steam Linux Runtime 3.0 (sniper).
#
#  Run on a Linux host with Node 22, Python 3.12, build-essential.
#  For CI use steamrt:sniper docker image to match the runtime exactly.
#
#  Usage:
#    ./build-tarball.sh                          full build
#    ./build-tarball.sh --skip-models            no whisper model download
#    ./build-tarball.sh --skip-venv              skip Python venv (use prebuilt)
#    ./build-tarball.sh --skip-node              skip Node 22 bundling (use system node)
#    ./build-tarball.sh --output ../dist         custom output dir
#    ./build-tarball.sh --version 0.7.1          override version (default: VERSION file or CHANGELOG)
#    ./build-tarball.sh --no-tar                 stage only, do not tarball
#
#  Output:
#    <output>/multideck-<version>-linux-x64.tar.zst
#    <output>/multideck-<version>-linux-x64.tar.zst.sha256
#    <output>/multideck-<version>-manifest.txt
# =====================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGING_ROOT="$(dirname "$SCRIPT_DIR")"
MULTIDECK_ROOT="$(dirname "$PACKAGING_ROOT")"

# ---------- flags ----------
SKIP_MODELS=false
SKIP_VENV=false
SKIP_NODE=false
NO_TAR=false
OUTPUT_DIR="$MULTIDECK_ROOT/dist"
VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-models)  SKIP_MODELS=true; shift ;;
    --skip-venv)    SKIP_VENV=true; shift ;;
    --skip-node)    SKIP_NODE=true; shift ;;
    --no-tar)       NO_TAR=true; shift ;;
    --output)       OUTPUT_DIR="$2"; shift 2 ;;
    --version)      VERSION="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^# =====/p' "${BASH_SOURCE[0]}" | sed 's/^#\s\?//'
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ---------- pinned versions (match install-steamdeck.sh) ----------
PIN_KOKORO="0.9.4"
PIN_MISAKI="0.9.4"
PIN_TORCH="2.11.0"
PIN_SOUNDFILE="0.13.1"
PIN_NUMPY="2.4.4"
PIN_ESPEAKNG_LOADER="0.2.4"
PIN_WHISPER_TAG="v1.7.4"
WHISPER_MODEL="${MULTIDECK_WHISPER_MODEL:-base.en}"

NODE_VERSION="22.11.0"

# ---------- detect version ----------
# Resolution order:
#   1. --version flag (already populated)
#   2. VERSION file at repo root (canonical, lands when we tag a release)
#   3. CHANGELOG ## [Unreleased] -> use latest-released-version + "-dev" suffix
#      so unreleased builds are obviously not the same artifact as a tagged
#      release. (Older code grabbed the latest tagged version which silently
#      shipped pre-release builds as that version.)
#   4. CHANGELOG latest tagged version, when no Unreleased section exists
#   5. fallback "0.0.0-dev"
if [[ -z "$VERSION" ]]; then
  if [[ -f "$MULTIDECK_ROOT/VERSION" ]]; then
    VERSION=$(tr -d '[:space:]' < "$MULTIDECK_ROOT/VERSION")
  elif [[ -f "$MULTIDECK_ROOT/CHANGELOG.md" ]]; then
    if grep -q '^## \[Unreleased\]' "$MULTIDECK_ROOT/CHANGELOG.md"; then
      latest_released=$(grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$MULTIDECK_ROOT/CHANGELOG.md" \
        | head -1 | sed 's/[^0-9.]//g')
      if [[ -n "$latest_released" ]]; then
        # Bump minor for the dev tag so 0.6.0 -> 0.7.0-dev signals "next release"
        IFS=. read -r major minor patch <<<"$latest_released"
        VERSION="${major}.$((minor + 1)).0-dev"
      fi
    fi
    if [[ -z "$VERSION" ]]; then
      VERSION=$(grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$MULTIDECK_ROOT/CHANGELOG.md" \
        | head -1 | sed 's/[^0-9.]//g')
    fi
  fi
  VERSION="${VERSION:-0.0.0-dev}"
fi

log()  { printf '\033[1;36m[build]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- pre-flight ----------
preflight() {
  log "Pre-flight checks"
  for cmd in node python3 git make tar zstd sha256sum; do
    command -v "$cmd" >/dev/null 2>&1 || fail "missing build dep: $cmd"
  done
  ok "build deps present"

  if ! [[ "$(node --version)" =~ ^v22\. ]]; then
    warn "Node version is $(node --version); pinned target is v$NODE_VERSION"
  fi

  mkdir -p "$OUTPUT_DIR"
  ok "output dir: $OUTPUT_DIR"
  log "building MultiDeck v$VERSION"
}

# ---------- stage tree ----------
stage_tree() {
  log "Staging tarball tree"
  STAGE="$OUTPUT_DIR/multideck-$VERSION"
  rm -rf "$STAGE"
  mkdir -p "$STAGE"/{bin,app,data/models,share/portraits}

  # App source
  log "Copying app source"
  cp -r "$MULTIDECK_ROOT/dashboard" "$STAGE/app/"
  cp -r "$MULTIDECK_ROOT/personas"  "$STAGE/app/"
  cp -r "$MULTIDECK_ROOT/hooks"     "$STAGE/app/"
  cp -r "$MULTIDECK_ROOT/scripts"   "$STAGE/app/"
  cp -r "$MULTIDECK_ROOT/docs"      "$STAGE/app/"
  cp -r "$MULTIDECK_ROOT/templates" "$STAGE/app/" 2>/dev/null || true
  cp -r "$MULTIDECK_ROOT/examples"  "$STAGE/app/" 2>/dev/null || true
  cp    "$MULTIDECK_ROOT/CHANGELOG.md" "$STAGE/app/"
  cp    "$MULTIDECK_ROOT/CLAUDE.md"    "$STAGE/app/"
  cp    "$MULTIDECK_ROOT/LICENSE"      "$STAGE/app/"
  cp    "$MULTIDECK_ROOT/README.md"    "$STAGE/app/"

  # Strip runtime state, secrets, dev artifacts
  find "$STAGE/app" -name ".gitkeep" -delete 2>/dev/null || true
  find "$STAGE/app" -name "*.pyc" -delete 2>/dev/null || true
  find "$STAGE/app" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
  rm -rf "$STAGE/app/state" 2>/dev/null || true
  rm -rf "$STAGE/app/tts-output" 2>/dev/null || true
  rm -rf "$STAGE/app/.kokoro-queue" 2>/dev/null || true
  rm -rf "$STAGE/app/dashboard/audio-feed/*.mp3" 2>/dev/null || true

  # Sanity: no .env or secrets. Group the OR-clauses so -print applies to all
  # branches (POSIX find: -o has lower precedence than implicit -print, so
  # ungrouped ".env -o *.key -o *.pem" would only reliably emit *.pem).
  local secret_hits
  secret_hits="$(find "$STAGE/app" \( -name ".env" -o -name "*.key" -o -name "*.pem" \) -print 2>/dev/null)"
  if [[ -n "$secret_hits" ]]; then
    printf 'SECRETS FOUND in staged tree:\n%s\n' "$secret_hits" >&2
    fail "secrets detected; aborting"
  fi

  ok "app source staged"
}

# ---------- whisper.cpp ----------
build_whisper() {
  log "Building whisper.cpp (pinned $PIN_WHISPER_TAG)"
  local wsrc="$STAGE/build/whisper.cpp"
  mkdir -p "$STAGE/build"
  git clone --depth 1 --branch "$PIN_WHISPER_TAG" \
    https://github.com/ggerganov/whisper.cpp.git "$wsrc" 2>&1 | tail -3
  (cd "$wsrc" && make -j"$(nproc)" 2>&1 | tail -n 5)

  local bin
  for cand in "$wsrc/build/bin/whisper-cli" "$wsrc/main"; do
    [[ -x "$cand" ]] && { bin="$cand"; break; }
  done
  [[ -n "${bin:-}" ]] || fail "whisper.cpp build produced no binary"
  cp "$bin" "$STAGE/bin/whisper-cli"

  if ! $SKIP_MODELS; then
    log "Downloading whisper model: $WHISPER_MODEL"
    (cd "$wsrc" && bash ./models/download-ggml-model.sh "$WHISPER_MODEL")
    cp "$wsrc/models/ggml-${WHISPER_MODEL}.bin" "$STAGE/data/models/"
  fi

  rm -rf "$STAGE/build"
  ok "whisper.cpp staged"
}

# ---------- Bundle Node 22 ----------
# Downloads the pinned Node 22.11.0 Linux x64 tarball from nodejs.org/dist
# and stages just the `node` binary into bin/. The entry script prefers
# bundled node so depot users never depend on system Node.
bundle_node() {
  if $SKIP_NODE; then
    log "Skipping Node bundling (--skip-node); expect system node at runtime"
    return
  fi

  local node_url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
  local node_tarball="$STAGE/build/node-v${NODE_VERSION}-linux-x64.tar.xz"
  local sums_url="https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  local sums_file="$STAGE/build/SHASUMS256.txt"

  mkdir -p "$STAGE/build"
  log "Downloading Node v${NODE_VERSION} ($node_url)"
  if ! curl -fsSL --retry 3 -o "$node_tarball" "$node_url"; then
    fail "failed to download Node tarball from $node_url"
  fi

  # Verify checksum against the official SHASUMS256.txt from nodejs.org.
  # Defense in depth: HTTPS + CA pinning catches MITM; SHASUMS pins us to
  # the exact upstream artifact even if the CDN is later compromised.
  log "Verifying Node tarball SHA256"
  if ! curl -fsSL --retry 3 -o "$sums_file" "$sums_url"; then
    fail "failed to download SHASUMS256.txt from $sums_url"
  fi
  (cd "$STAGE/build" && grep "node-v${NODE_VERSION}-linux-x64.tar.xz$" "$sums_file" | sha256sum -c -) \
    || fail "Node tarball SHA256 mismatch; possible tampering"
  ok "Node tarball SHA256 verified against upstream SHASUMS256.txt"

  log "Extracting bin/node from Node tarball"
  tar -xJf "$node_tarball" -C "$STAGE/build" \
    "node-v${NODE_VERSION}-linux-x64/bin/node"

  cp "$STAGE/build/node-v${NODE_VERSION}-linux-x64/bin/node" "$STAGE/bin/node"
  chmod +x "$STAGE/bin/node"

  local node_size
  node_size=$(du -h "$STAGE/bin/node" | cut -f1)
  ok "Node v${NODE_VERSION} staged at bin/node ($node_size)"

  # Clean up extraction
  rm -rf "$STAGE/build/node-v${NODE_VERSION}-linux-x64"
}

# ---------- Python venv ----------
build_venv() {
  if $SKIP_VENV; then
    log "Skipping venv build (--skip-venv); expect prebuilt at data/kokoro-venv/"
    return
  fi

  log "Building Kokoro Python venv (CPU torch, ~3 GB)"
  python3 -m venv "$STAGE/data/kokoro-venv"
  "$STAGE/data/kokoro-venv/bin/pip" install --upgrade pip wheel setuptools >/dev/null
  "$STAGE/data/kokoro-venv/bin/pip" install \
    "kokoro==$PIN_KOKORO" \
    "misaki==$PIN_MISAKI" \
    "torch==$PIN_TORCH" \
    "soundfile==$PIN_SOUNDFILE" \
    "numpy==$PIN_NUMPY" \
    "espeakng-loader==$PIN_ESPEAKNG_LOADER" \
    --extra-index-url https://download.pytorch.org/whl/cpu

  # Make venv relocatable: rewrite shebangs to use a relative pattern
  # the launcher will fix at runtime via VIRTUAL_ENV reset
  log "Marking venv as relocatable"
  find "$STAGE/data/kokoro-venv/bin" -type f -exec sed -i.bak '1s|^#!.*python|#!/usr/bin/env python3|' {} \; 2>/dev/null || true
  find "$STAGE/data/kokoro-venv/bin" -name "*.bak" -delete

  ok "Kokoro venv staged"
}

# ---------- entry point ----------
write_entry_point() {
  log "Writing bin/multideck entry point"
  cat > "$STAGE/bin/multideck" <<'ENTRY'
#!/usr/bin/env bash
# MultiDeck Steamworks entry point
# Invoked by Steam launch option; runs inside Steam Linux Runtime sniper container.

set -e

# Resolve install root (the depot mount point under Steam)
ENTRY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="$(dirname "$ENTRY_DIR")"

# Wire bundled binaries
export PATH="$INSTALL_ROOT/bin:$PATH"
export DISPATCH_ROOT="$INSTALL_ROOT/app"
export DISPATCH_KOKORO_VENV="$INSTALL_ROOT/data/kokoro-venv"
export DISPATCH_WHISPER_BIN="$INSTALL_ROOT/bin/whisper-cli"
export DISPATCH_WHISPER_MODEL="$INSTALL_ROOT/data/models/ggml-base.en.bin"

# User state goes to XDG paths (Steam Runtime maps these correctly)
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

mkdir -p "$XDG_DATA_HOME/multideck" "$XDG_CACHE_HOME/multideck" "$XDG_CONFIG_HOME/multideck"

# First-launch self-test (writes to user state, not depot)
"$INSTALL_ROOT/app/scripts/install-multideck.sh" --steamworks-mode --verify --quiet || {
  echo "[multideck] first-launch verify failed; see ${XDG_CACHE_HOME}/multideck/install.log" >&2
  exit 1
}

# Find a chromium-class browser
for browser in chromium chromium-browser google-chrome google-chrome-stable brave; do
  if command -v "$browser" >/dev/null 2>&1; then
    BROWSER="$browser"
    break
  fi
done

# Pick a free port if 3046 is taken
PORT=3046
while ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":$PORT$"; do
  PORT=$((PORT + 1))
  [[ "$PORT" -gt 3100 ]] && { echo "[multideck] no free port" >&2; exit 1; }
done
export DISPATCH_PORT="$PORT"

# Prefer bundled Node 22 over system node (depot may have shipped on a
# host with no Node, or with a Node version that is incompatible).
NODE_BIN="$INSTALL_ROOT/bin/node"
[[ -x "$NODE_BIN" ]] || NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "[multideck] no node binary found (bundled or system)" >&2
  exit 1
fi

# Launch dashboard server (foreground; Steam treats it as the app)
"$NODE_BIN" "$INSTALL_ROOT/app/dashboard/server.cjs" &
SERVER_PID=$!

# Wait for the server to come up
for i in $(seq 1 20); do
  curl -fsS -o /dev/null --max-time 2 "http://localhost:$PORT/" && break
  sleep 0.5
done

# Open in browser app-mode if we have one; otherwise just hold the server
if [[ -n "${BROWSER:-}" ]]; then
  "$BROWSER" \
    --user-data-dir="$XDG_CACHE_HOME/multideck/chrome-profile" \
    --no-first-run \
    --use-fake-ui-for-media-stream \
    --autoplay-policy=no-user-gesture-required \
    --app="http://localhost:$PORT/launcher" &
  BROWSER_PID=$!
  wait "$BROWSER_PID"
  kill "$SERVER_PID" 2>/dev/null || true
else
  echo "[multideck] no browser found; dashboard at http://localhost:$PORT/launcher" >&2
  wait "$SERVER_PID"
fi
ENTRY
  chmod +x "$STAGE/bin/multideck"
  ok "entry point written"
}

# ---------- write manifest ----------
write_manifest() {
  log "Writing manifest"
  local manifest="$OUTPUT_DIR/multideck-${VERSION}-manifest.txt"
  {
    echo "MultiDeck depot manifest"
    echo "version: $VERSION"
    echo "built: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "node: $(node --version)"
    echo "python: $(python3 --version)"
    echo ""
    echo "pins:"
    echo "  kokoro: $PIN_KOKORO"
    echo "  misaki: $PIN_MISAKI"
    echo "  torch: $PIN_TORCH (CPU)"
    echo "  soundfile: $PIN_SOUNDFILE"
    echo "  numpy: $PIN_NUMPY"
    echo "  whisper.cpp: $PIN_WHISPER_TAG"
    echo "  whisper model: $WHISPER_MODEL"
    echo ""
    echo "files:"
    (cd "$STAGE" && find . -type f -printf '  %p  %s bytes\n' | sort)
  } > "$manifest"
  ok "manifest: $manifest"
}

# ---------- tar + sha256 ----------
make_tarball() {
  if $NO_TAR; then
    log "Skipping tarball (--no-tar); staged tree at $STAGE"
    return
  fi
  local tarball="$OUTPUT_DIR/multideck-${VERSION}-linux-x64.tar.zst"
  log "Creating tarball: $tarball"
  tar --zstd -cf "$tarball" -C "$OUTPUT_DIR" "multideck-$VERSION"
  sha256sum "$tarball" > "${tarball}.sha256"
  ok "tarball: $tarball ($(du -h "$tarball" | cut -f1))"
  ok "sha256: $(cat "${tarball}.sha256" | cut -d' ' -f1)"
}

# ---------- main ----------
preflight
stage_tree
build_whisper
bundle_node
build_venv
write_entry_point
write_manifest
make_tarball

cat <<EOF

==================================================================
Build complete.

  Stage:    $STAGE
  Output:   $OUTPUT_DIR
  Version:  $VERSION

Next steps:
  1. Test the entry point on a sniper container:
       sudo docker run --rm -v "$STAGE:/app:ro" registry.gitlab.steamos.cloud/steamrt/sniper/sdk \\
         /app/bin/multideck

  2. Stage for Steamworks upload:
       ./stage-steamworks-build.sh $OUTPUT_DIR/multideck-${VERSION}-linux-x64.tar.zst ./build-staging/

  3. Upload via steamcmd (requires Partner account + AppID).
==================================================================
EOF
