#!/usr/bin/env python3
"""MultiDeck Agent Management CLI

Cross-platform tool for adding, removing, and listing Dispatch agents/personas.

Commands:
  python dispatch-agent.py add       - Interactive: create new agent
  python dispatch-agent.py remove    - Interactive: remove existing agent
  python dispatch-agent.py list      - List all agents
  python dispatch-agent.py show <id> - Show details of one agent

Uses personas.json as the registry. Logs operations to dispatch-agent.log.
"""
import sys
import os
import json
import re
import argparse
from pathlib import Path
from datetime import datetime

# Find the framework root (parent of scripts/)
SCRIPT_DIR = Path(__file__).resolve().parent
FRAMEWORK_ROOT = SCRIPT_DIR.parent
PERSONAS_JSON = FRAMEWORK_ROOT / "personas" / "personas.json"
VOICES_SCRIPT = FRAMEWORK_ROOT / "hooks" / "set-voice.py"
LOG_FILE = FRAMEWORK_ROOT / "dispatch-agent.log"

# Default color palette for personas
DEFAULT_COLORS = [
    "#0088FF",  # electric blue (engineer)
    "#FF6B00",  # orange (architect)
    "#FF0055",  # pink (reviewer)
    "#00CC88",  # green (researcher)
    "#6B5BFF",  # purple
]


def log(msg):
    """Log to dispatch-agent.log with timestamp."""
    timestamp = datetime.now().isoformat()
    line = f"[{timestamp}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def ensure_personas_json():
    """Create personas.json if it doesn't exist."""
    if not PERSONAS_JSON.exists():
        PERSONAS_JSON.parent.mkdir(parents=True, exist_ok=True)
        template = {
            "meta": {"version": "0.1.0", "framework": "MultiDeck"},
            "personas": {
                "dispatch": {
                    "callsign": "Dispatch",
                    "description": "Central coordination and workflow orchestration",
                    "color_hex": "#00FFCC",
                    "tab_color": "#00CCFF",
                    "voice_key": "dispatch",
                    "scope": "coordination, job board, briefing generation",
                    "cwd": str(FRAMEWORK_ROOT),
                    "agent_file": "personas/DISPATCH_AGENT.md"
                }
            }
        }
        with open(PERSONAS_JSON, "w") as f:
            json.dump(template, f, indent=2)
        log(f"Created {PERSONAS_JSON}")


def load_personas():
    """Load personas.json."""
    ensure_personas_json()
    with open(PERSONAS_JSON) as f:
        return json.load(f)


def save_personas(data):
    """Save personas.json."""
    with open(PERSONAS_JSON, "w") as f:
        json.dump(data, f, indent=2)
    log(f"Saved {PERSONAS_JSON}")


def is_valid_hex_color(s):
    """Check if string is valid hex color."""
    return bool(re.match(r"^#[0-9A-Fa-f]{6}$", s))


def cmd_add():
    """Interactive prompt to add a new agent."""
    print("\n=== Add New Agent ===")

    # Callsign (unique key)
    while True:
        callsign = input("Agent callsign (lowercase, unique): ").strip().lower()
        if not callsign:
            print("Callsign required")
            continue
        if not re.match(r"^[a-z_]+$", callsign):
            print("Callsign must be lowercase letters and underscores only")
            continue
        personas = load_personas()
        if callsign in personas["personas"]:
            response = input(f"Agent '{callsign}' already exists. Overwrite? (y/n): ")
            if response.lower() != "y":
                continue
        break

    # Display name
    display_name = input("Display name (e.g., 'Engineer'): ").strip()
    if not display_name:
        display_name = callsign.title()

    # Description
    description = input("Brief description: ").strip()
    if not description:
        description = f"Agent {display_name}"

    # Color hex
    while True:
        color = input("Color hex (e.g., #0088FF): ").strip()
        if not is_valid_hex_color(color):
            print("Invalid hex color. Format: #RRGGBB")
            continue
        break

    # Tab color (Windows Terminal)
    while True:
        tab_color = input("Tab color hex (e.g., #0088FF): ").strip()
        if not is_valid_hex_color(tab_color):
            print("Invalid hex color. Format: #RRGGBB")
            continue
        break

    # Voice key
    print("\nAvailable voices: dispatch, architect, engineer, reviewer, researcher, (or custom)")
    voice_key = input("Voice key: ").strip().lower()
    if not voice_key:
        voice_key = "engineer"

    # Scope
    scope = input("Scope/responsibilities (comma-separated): ").strip()
    if not scope:
        scope = "general"

    # Working directory
    cwd = input(f"Working directory (default: {FRAMEWORK_ROOT}): ").strip()
    if not cwd:
        cwd = str(FRAMEWORK_ROOT)
    cwd = str(Path(cwd).resolve())

    # Agent file name
    agent_file_default = f"personas/{callsign}.md"
    agent_file = input(f"Agent file path (default: {agent_file_default}): ").strip()
    if not agent_file:
        agent_file = agent_file_default

    # Confirm
    print(f"\n=== Confirmation ===")
    print(f"Callsign:    {callsign}")
    print(f"Display:     {display_name}")
    print(f"Description: {description}")
    print(f"Color:       {color}")
    print(f"Tab Color:   {tab_color}")
    print(f"Voice:       {voice_key}")
    print(f"Scope:       {scope}")
    print(f"CWD:         {cwd}")
    print(f"Agent File:  {agent_file}")

    response = input("\nProceed? (y/n): ")
    if response.lower() != "y":
        print("Aborted.")
        return

    # Add to personas.json
    personas = load_personas()
    personas["personas"][callsign] = {
        "callsign": display_name,
        "description": description,
        "color_hex": color,
        "tab_color": tab_color,
        "voice_key": voice_key,
        "scope": scope,
        "cwd": cwd,
        "agent_file": agent_file
    }
    save_personas(personas)
    log(f"Added agent '{callsign}'")

    # Update set-voice.py VOICE_MAP
    update_voice_map(callsign, voice_key)

    # Create personas/ directory and shortcut
    personas_dir = FRAMEWORK_ROOT / "personas"
    personas_dir.mkdir(exist_ok=True)
    create_launch_shortcut(callsign)

    print(f"\nAgent '{callsign}' created successfully!")
    print(f"Next: Add {agent_file} with persona details")


def cmd_remove():
    """Interactive prompt to remove an agent."""
    personas = load_personas()
    persona_keys = list(personas["personas"].keys())

    if len(persona_keys) == 0:
        print("No agents to remove.")
        return

    print("\n=== Remove Agent ===")
    print("Available agents:")
    for i, key in enumerate(persona_keys, 1):
        p = personas["personas"][key]
        print(f"  {i}. {key:20} ({p.get('callsign', key)})")

    response = input("\nSelect agent to remove (number or name), or 'cancel': ").strip()
    if response.lower() == "cancel":
        return

    if response.isdigit():
        idx = int(response) - 1
        if 0 <= idx < len(persona_keys):
            key = persona_keys[idx]
        else:
            print("Invalid selection")
            return
    else:
        key = response.lower()
        if key not in personas["personas"]:
            print(f"Unknown agent: {key}")
            return

    # Refuse to remove dispatch
    if key == "dispatch":
        print("Cannot remove 'dispatch' (framework core).")
        return

    # Confirm
    response = input(f"Remove '{key}'? (y/n): ")
    if response.lower() != "y":
        print("Aborted.")
        return

    # Remove from personas.json
    agent_file = personas["personas"][key].get("agent_file", "")
    del personas["personas"][key]
    save_personas(personas)
    log(f"Removed agent '{key}'")

    # Archive agent file if it exists
    if agent_file:
        agent_path = FRAMEWORK_ROOT / agent_file
        if agent_path.exists():
            archive_dir = FRAMEWORK_ROOT / "personas" / "archived"
            archive_dir.mkdir(exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            archive_path = archive_dir / f"{key}-{timestamp}.md"
            agent_path.rename(archive_path)
            log(f"Archived {agent_file} to {archive_path}")

    # Remove from VOICE_MAP
    remove_voice_map_entry(key)

    # Remove launch shortcut
    remove_launch_shortcut(key)

    # Kill matching tmux pane in the shared multideck session if running.
    # Other personas keep their PIDs; the tiled layout rebalances around the
    # gap (MULTI-FEAT-0065 criterion 3).
    callsign = personas["personas"].get(key, {}).get("callsign") or key
    kill_tmux_pane_if_running(key, callsign)

    print(f"Agent '{key}' removed.")


def kill_tmux_pane_if_running(persona_key, callsign):
    """Best-effort tmux pane kill for the removed persona.

    Looks up the multideck session (or whatever DISPATCH_TMUX_SESSION names),
    matches a pane whose title contains the callsign, kills it, then runs
    select-layout tiled so the remaining panes rebalance. No-ops cleanly when:
      - tmux is not installed
      - the multideck session doesn't exist
      - no pane title matches

    Runs through `wsl -d Ubuntu` on Windows so it works whether dispatch-agent.py
    runs from PowerShell or from an interactive WSL shell.
    """
    import shutil
    import subprocess as sp

    session = os.environ.get("DISPATCH_TMUX_SESSION", "multideck")

    def _tmux(args):
        # Prefer native tmux when running inside WSL/Linux; fall back to wsl.exe
        # interop when the script runs on Windows.
        if shutil.which("tmux"):
            return sp.run(["tmux", *args], capture_output=True, text=True, timeout=5)
        if sys.platform.startswith("win"):
            return sp.run(["wsl.exe", "-d", "Ubuntu", "--", "tmux", *args],
                          capture_output=True, text=True, timeout=10)
        return None

    has = _tmux(["has-session", "-t", session])
    if has is None or has.returncode != 0:
        return  # tmux not available or session not running — silent no-op

    listing = _tmux(["list-panes", "-t", session, "-F", "#{pane_id}\t#{pane_title}"])
    if listing is None or listing.returncode != 0:
        return

    target_pane = None
    for line in (listing.stdout or "").splitlines():
        parts = line.split("\t", 1)
        if len(parts) == 2 and callsign in parts[1]:
            target_pane = parts[0]
            break

    if not target_pane:
        log(f"No tmux pane found for '{callsign}' in session '{session}'")
        return

    killed = _tmux(["kill-pane", "-t", target_pane])
    if killed and killed.returncode == 0:
        log(f"Killed tmux pane {target_pane} ({callsign}) in session '{session}'")
        # Re-tile remaining panes. Best-effort — if select-layout fails (e.g.
        # the kill closed the last pane and ended the session), that's fine.
        _tmux(["select-layout", "-t", session, "tiled"])


def cmd_list():
    """List all agents."""
    personas = load_personas()
    if not personas["personas"]:
        print("No agents configured.")
        return

    print("\n=== Agents ===")
    print(f"{'Callsign':<15} {'Display':<20} {'Voice':<12} {'Scope':<40}")
    print("-" * 87)

    for key, p in personas["personas"].items():
        display = p.get("callsign", key)
        voice = p.get("voice_key", "?")
        scope = p.get("scope", "?")[:40]
        print(f"{key:<15} {display:<20} {voice:<12} {scope:<40}")


def cmd_show(agent_id):
    """Show details of one agent."""
    personas = load_personas()
    if agent_id not in personas["personas"]:
        print(f"Unknown agent: {agent_id}")
        return

    p = personas["personas"][agent_id]
    print(f"\n=== {agent_id} ===")
    for key, value in p.items():
        print(f"{key:<20} {value}")


def update_voice_map(callsign, voice_key):
    """Update set-voice.py VOICE_MAP to include the new agent."""
    if not VOICES_SCRIPT.exists():
        log(f"Warning: {VOICES_SCRIPT} not found, skipping VOICE_MAP update")
        return

    with open(VOICES_SCRIPT) as f:
        content = f.read()

    # Find the VOICE_MAP dict and insert the new entry (if not already present)
    if f'"{callsign}"' in content:
        log(f"Voice '{callsign}' already in VOICE_MAP")
        return

    # Insert before "default" entry
    insertion = f'    "{callsign}":   {{"voice": "{voice_key}", "lang": "a", "speed": 1.05, "callsign": "{callsign.title()}"}},\n'
    updated = content.replace(
        '    "default":',
        insertion + '    "default":'
    )

    with open(VOICES_SCRIPT, "w") as f:
        f.write(updated)

    log(f"Updated VOICE_MAP in {VOICES_SCRIPT}")


def remove_voice_map_entry(callsign):
    """Remove agent from set-voice.py VOICE_MAP."""
    if not VOICES_SCRIPT.exists():
        log(f"Warning: {VOICES_SCRIPT} not found, skipping VOICE_MAP removal")
        return

    with open(VOICES_SCRIPT) as f:
        lines = f.readlines()

    # Find and remove the line containing this callsign
    new_lines = [ln for ln in lines if f'"{callsign}"' not in ln]

    if len(new_lines) < len(lines):
        with open(VOICES_SCRIPT, "w") as f:
            f.writelines(new_lines)
        log(f"Removed '{callsign}' from VOICE_MAP in {VOICES_SCRIPT}")


def create_launch_shortcut(callsign):
    """Create a Windows .bat or Unix .sh shortcut to launch the persona."""
    script_path = SCRIPT_DIR / "launch-persona.ps1" if sys.platform == "win32" else SCRIPT_DIR / "launch-persona.sh"

    if not script_path.exists():
        log(f"Warning: launch script not found at {script_path}")
        return

    if sys.platform == "win32":
        shortcut_path = FRAMEWORK_ROOT / f"{callsign}-launch.bat"
        content = f"@echo off\npowershell -ExecutionPolicy Bypass -File \"{SCRIPT_DIR / 'launch-persona.ps1'}\" {callsign} %*\n"
    else:
        shortcut_path = FRAMEWORK_ROOT / f"{callsign}-launch.sh"
        content = f"#!/bin/bash\n\"{SCRIPT_DIR / 'launch-persona.sh'}\" {callsign} \"$@\"\n"

    with open(shortcut_path, "w") as f:
        f.write(content)

    if sys.platform != "win32":
        os.chmod(shortcut_path, 0o755)

    log(f"Created launch shortcut: {shortcut_path}")


def remove_launch_shortcut(callsign):
    """Remove the launch shortcut for a persona."""
    for ext in [".bat", ".sh"]:
        shortcut_path = FRAMEWORK_ROOT / f"{callsign}-launch{ext}"
        if shortcut_path.exists():
            shortcut_path.unlink()
            log(f"Removed launch shortcut: {shortcut_path}")


def main():
    parser = argparse.ArgumentParser(description="MultiDeck Agent Management")
    subparsers = parser.add_subparsers(dest="command", help="Command")

    subparsers.add_parser("add", help="Add a new agent (interactive)")
    subparsers.add_parser("remove", help="Remove an agent (interactive)")
    subparsers.add_parser("list", help="List all agents")
    show_parser = subparsers.add_parser("show", help="Show agent details")
    show_parser.add_argument("agent_id", help="Agent callsign")

    args = parser.parse_args()

    try:
        if args.command == "add":
            cmd_add()
        elif args.command == "remove":
            cmd_remove()
        elif args.command == "list":
            cmd_list()
        elif args.command == "show":
            cmd_show(args.agent_id)
        else:
            parser.print_help()
    except Exception as e:
        print(f"Error: {e}")
        log(f"Error in {args.command}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
