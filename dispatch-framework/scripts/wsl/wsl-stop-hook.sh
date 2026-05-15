#!/bin/bash
# WSL Claude Code Stop hook bridge.
# Forwards stdin JSON payload to Windows-side speak-kokoro.py via the kokoro-venv Python.
# Sets DISPATCH_ROOT so MP3s land in dispatch-framework/tts-output (audio feed source).
# WSLENV forwards CLAUDE_CODE_SSE_PORT (voice config isolation) and DISPATCH_ROOT.
# Path arg is converted to Windows form via wslpath since WSL interop arg translation
# is unreliable when env vars precede the command.

export DISPATCH_ROOT='F:\03-INFRASTRUCTURE\dispatch-framework'
export WSLENV='CLAUDE_CODE_SSE_PORT:DISPATCH_ROOT'

PYEXE='/mnt/c/Users/cmc3b/.claude/hooks/kokoro-venv/Scripts/python.exe'
SCRIPT_WIN="$(wslpath -w /mnt/c/Users/cmc3b/.claude/hooks/speak-kokoro.py)"

exec "$PYEXE" "$SCRIPT_WIN"
