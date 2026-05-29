#!/usr/bin/env bash
set -euo pipefail

# Prefer native WSL binaries over Windows PATH interop. A Windows node.exe or
# npm shim can appear valid to `command -v` but cannot host a tmux TUI reliably.
export PATH="$HOME/.npm-global/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/sbin:/usr/local/bin:$PATH"

tmux_path="$(command -v tmux || true)"
codex_path="$(command -v codex || true)"
codex_status="missing"
codex_detail=""

if [[ -n "$codex_path" ]]; then
  if codex_detail="$(codex --version 2>/tmp/multideck-codex-version.err)"; then
    codex_status="native"
  else
    codex_status="broken"
    codex_detail="$(head -5 /tmp/multideck-codex-version.err 2>/dev/null || true)"
  fi
fi

printf 'tmux=%s\ncodex=%s\ncodex_status=%s\ncodex_detail=%s\n' \
  "$tmux_path" "$codex_path" "$codex_status" "$codex_detail"

[[ -n "$tmux_path" ]] && {
  [[ "$codex_status" == "native" ]]
}
