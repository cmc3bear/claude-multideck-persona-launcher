#!/bin/bash
# =====================================================
#  MultiDeck Persona Launcher (Linux/Mac)
#  Opens a new terminal window/tab for a persona with:
#    - Correct working directory
#    - Terminal title set to callsign
#    - Claude Code launched with --dangerously-skip-permissions
#    - Activation prompt that loads persona + sets Kokoro voice
#
#  Usage:
#    ./launch-persona.sh dispatch
#    ./launch-persona.sh engineer
#    ./launch-persona.sh dispatch "quick sanity check"
# =====================================================

set -e

PERSONA_KEY="${1:-}"
INITIAL_PROMPT="${2:-}"

if [ -z "$PERSONA_KEY" ]; then
    echo "Usage: launch-persona.sh <persona_key> [initial_prompt]"
    exit 1
fi

# Read personas.json from configurable path or default
PERSONAS_PATH="${DISPATCH_PERSONAS_JSON:-$(dirname "$0")/../personas/personas.json}"

if [ ! -f "$PERSONAS_PATH" ]; then
    echo "Error: Persona registry not found at $PERSONAS_PATH"
    echo "Set \$DISPATCH_PERSONAS_JSON or ensure personas/personas.json exists"
    exit 1
fi

# Parse JSON (minimal jq-free version using grep/sed)
persona_key_lower=$(echo "$PERSONA_KEY" | tr '[:upper:]' '[:lower:]')

# Extract callsign, cwd, voice_key, tab_color from personas.json
# This is a simple approach; for complex JSON parsing, install jq
if command -v jq &> /dev/null; then
    PERSONA_DATA=$(jq -r ".personas[\"$persona_key_lower\"]" "$PERSONAS_PATH")
    CALLSIGN=$(echo "$PERSONA_DATA" | jq -r '.callsign // empty')
    CWD=$(echo "$PERSONA_DATA" | jq -r '.cwd // empty')
    VOICE_KEY=$(echo "$PERSONA_DATA" | jq -r '.voice_key // empty')
else
    echo "Error: jq not found. Please install jq to parse personas.json"
    exit 1
fi

if [ -z "$CALLSIGN" ]; then
    echo "Error: Unknown persona: $PERSONA_KEY"
    exit 1
fi

if [ ! -d "$CWD" ]; then
    echo "Warning: CWD does not exist: $CWD, using current directory"
    CWD="$(pwd)"
fi

# Build activation prompt
read -r -d '' BASE_PROMPT << EOF || true
Your first actions on startup, in this exact order:

1. Set the terminal title to "$CALLSIGN" (varies by terminal, example for xterm):
   printf '\\033]0;$CALLSIGN\\007'

2. Use the Bash tool to run exactly this command:
   python '$PWD/hooks/set-voice.py' $VOICE_KEY
   This writes the per-session voice config (uses CLAUDE_CODE_SSE_PORT).

3. Load the $CALLSIGN persona.

4. Orient and stand ready for user instructions.
EOF

if [ -n "$INITIAL_PROMPT" ]; then
    BASE_PROMPT="${BASE_PROMPT}

User's initial request: $INITIAL_PROMPT"
fi

# Detect terminal and launch appropriately
if [ "$OSTYPE" == "darwin"* ]; then
    # macOS — use iTerm2 or Terminal.app
    if command -v open &> /dev/null; then
        # Create a temporary AppleScript
        APPLE_SCRIPT="tell application \"Terminal\"
    activate
    tell application \"System Events\"
        keystroke \"n\" using command down
    end tell
    delay 1
    do script \"cd '$CWD' && printf '\\\\033]0;$CALLSIGN\\\\007' && clear && claude --dangerously-skip-permissions --name '$CALLSIGN' '$(echo "$BASE_PROMPT" | sed "s/'/'\\\\\\''/g")'\" in front window
end tell"
        osascript -e "$APPLE_SCRIPT" &
    fi
elif command -v gnome-terminal &> /dev/null; then
    # Linux — GNOME Terminal
    gnome-terminal --new-window --working-directory="$CWD" -- bash -c "
        printf '\\033]0;$CALLSIGN\\007'
        printf '\\033]0;$CALLSIGN\\007'
        claude --dangerously-skip-permissions --name '$CALLSIGN' '$BASE_PROMPT'
    " &
elif command -v konsole &> /dev/null; then
    # Linux — KDE Konsole
    konsole --new-window --workdir "$CWD" -e bash -c "
        printf '\\033]0;$CALLSIGN\\007'
        claude --dangerously-skip-permissions --name '$CALLSIGN' '$BASE_PROMPT'
    " &
elif command -v xterm &> /dev/null; then
    # Fallback to xterm
    xterm -e "cd '$CWD' && printf '\\033]0;$CALLSIGN\\007' && claude --dangerously-skip-permissions --name '$CALLSIGN' '$BASE_PROMPT'" &
else
    echo "Error: No supported terminal found (gnome-terminal, konsole, xterm, or macOS Terminal required)"
    exit 1
fi

echo "Launched $CALLSIGN persona"
echo "  CWD: $CWD"
echo "  Voice: $VOICE_KEY"
echo "  Mode: --dangerously-skip-permissions"
echo "  Claude --name: $CALLSIGN"
