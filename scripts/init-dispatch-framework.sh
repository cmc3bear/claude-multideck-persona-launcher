#!/bin/bash
# =====================================================
#  MultiDeck Framework Initialization (Linux/Mac)
#
#  This script:
#  1. Asks user for DISPATCH_USER_ROOT
#  2. Creates directory structure
#  3. Sets up Python venv and installs kokoro deps
#  4. Creates empty state files from templates
#  5. Prompts for first persona customization
#  6. Prints next steps
# =====================================================

set -e

echo "=== MultiDeck Framework Initialization ==="
echo ""

# Step 1: Ask for DISPATCH_USER_ROOT
DEFAULT_ROOT="${HOME}/dispatch"
read -p "DISPATCH_USER_ROOT (default: $DEFAULT_ROOT): " USER_ROOT
USER_ROOT="${USER_ROOT:-$DEFAULT_ROOT}"
mkdir -p "$USER_ROOT"
echo "Using: $USER_ROOT"
echo ""

# Step 2: Create directory structure
echo "Creating directories..."
for dir in state personas personas/archived briefings tts-output; do
    mkdir -p "$USER_ROOT/$dir"
    echo "  Created: $dir"
done
echo ""

# Step 3: Create empty state files from templates
echo "Creating state file templates..."
cat > "$USER_ROOT/state/actions.json" << 'EOF'
{"personal": [], "goals": [], "family": [], "claude_projects": {}}
EOF
cat > "$USER_ROOT/state/calendar.json" << 'EOF'
{"source": "template", "agenda": [], "cron_jobs": [], "free_blocks": [], "suggestions": []}
EOF
cat > "$USER_ROOT/state/dispatch-log.json" << 'EOF'
{"entries": []}
EOF
cat > "$USER_ROOT/state/project-summary.json" << 'EOF'
{"source": "template", "projects": []}
EOF
cat > "$USER_ROOT/state/inbox-flags.json" << 'EOF'
{"flagged": []}
EOF
cat > "$USER_ROOT/state/followups.json" << 'EOF'
{"tracked": []}
EOF
cat > "$USER_ROOT/state/escalations.json" << 'EOF'
{"pending": []}
EOF
cat > "$USER_ROOT/state/morning-pipeline.json" << 'EOF'
{"date": null, "stages": {}, "meta": {"version": "0.1.0"}}
EOF
cat > "$USER_ROOT/state/pulse-log.json" << 'EOF'
{"entries": []}
EOF
cat > "$USER_ROOT/state/state-meta.json" << 'EOF'
{"last_updated": {}, "data_sources": {}, "version": "0.1.0"}
EOF
cat > "$USER_ROOT/state/weather.json" << 'EOF'
{"provider": "none", "current": null}
EOF
cat > "$USER_ROOT/state/job-board.json" << 'EOF'
{"meta": {"version": 1, "next_job_id": 1}, "jobs": []}
EOF
echo "  Created 11 state files"
echo ""

# Step 4: Set up Python venv and install deps
echo "Setting up Python environment..."
FRAMEWORK_ROOT="$(dirname "$(dirname "$(realpath "$0")")")"
VENV_PATH="$FRAMEWORK_ROOT/hooks/kokoro-venv"
if [ -d "$VENV_PATH" ]; then
    echo "Venv already exists at $VENV_PATH"
else
    echo "Creating venv at $VENV_PATH..."
    python3 -m venv "$VENV_PATH"
    echo "Installing dependencies..."
    "$VENV_PATH/bin/pip" install -q -r "$FRAMEWORK_ROOT/hooks/requirements.txt"
    echo "Dependencies installed"
fi
echo ""

# Step 5: Create personas.json
echo "Creating personas registry..."
cat > "$USER_ROOT/personas/personas.json" << EOF
{
  "meta": {
    "version": "0.1.0",
    "framework": "MultiDeck"
  },
  "personas": {
    "dispatch": {
      "callsign": "Dispatch",
      "description": "Central coordination and workflow orchestration",
      "color_hex": "#00FFCC",
      "tab_color": "#00CCFF",
      "voice_key": "dispatch",
      "scope": "coordination, job board, briefing generation",
      "cwd": "$USER_ROOT",
      "agent_file": "personas/DISPATCH_AGENT.md"
    }
  }
}
EOF
echo "Created personas.json with default 'dispatch' persona"
echo ""

# Step 6: Print next steps
echo "=== Next Steps ==="
echo ""
echo "1. Set environment variable for easy access:"
echo "   export DISPATCH_USER_ROOT='$USER_ROOT'"
echo "   export DISPATCH_PERSONAS_JSON='$USER_ROOT/personas/personas.json'"
echo ""
echo "2. Add to your shell profile (~/.bashrc, ~/.zshrc, etc.) for persistence"
echo ""
echo "3. Launch the dispatch persona:"
echo "   $FRAMEWORK_ROOT/scripts/launch-persona.sh dispatch"
echo ""
echo "4. Start the dashboard server (from framework root):"
echo "   node $FRAMEWORK_ROOT/dashboard/server.cjs"
echo "   Then visit: http://localhost:3045"
echo ""
echo "Setup complete!"
