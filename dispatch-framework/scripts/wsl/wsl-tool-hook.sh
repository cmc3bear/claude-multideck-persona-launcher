#!/bin/bash
# WSL Claude Code PostToolUse hook bridge.
# Forwards stdin JSON to Windows-side speak-tool-status.py via kokoro-venv Python.

export DISPATCH_ROOT='F:\03-INFRASTRUCTURE\dispatch-framework'
export WSLENV='CLAUDE_CODE_SSE_PORT:DISPATCH_ROOT'

PYEXE='/mnt/c/Users/cmc3b/.claude/hooks/kokoro-venv/Scripts/python.exe'
SCRIPT_WIN="$(wslpath -w /mnt/c/Users/cmc3b/.claude/hooks/speak-tool-status.py)"

exec "$PYEXE" "$SCRIPT_WIN"
