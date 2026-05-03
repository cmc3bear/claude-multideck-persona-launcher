"""Set per-instance Kokoro voice config for a persona.

Usage: python set-voice.py <persona_callsign>
       python set-voice.py --voice <voice_id> --lang <lang_code> [--speed <speed>]

Writes a per-session voice config keyed by the active Claude Code session UUID. The
session UUID is discovered by inspecting the most-recently-modified transcript JSONL
under ~/.claude/projects/<encoded-cwd>/, which the Stop hook also sees in its stdin
payload — that lets parallel Claude Code sessions in the same CWD each have their
own voice without overwriting a shared file. Falls back to CLAUDE_CODE_SSE_PORT,
then a shared file, if discovery fails.

Each persona entry includes a 'callsign' field that the TTS hook prepends to the text
so each voice introduces itself when speaking.

MultiDeck framework: see VOICE_MAP below for the full persona list.
Users can extend VOICE_MAP with custom personas. Custom voice tensors are added via CUSTOM_VOICES.
"""
import sys, os, json

VOICE_MAP = {
    "dispatch":           {"voice": "af_sky",    "lang": "a", "speed": 0.95, "callsign": "Dispatch"},
    "architect":          {"voice": "bm_daniel", "lang": "b", "speed": 1.05, "callsign": "Architect"},
    "engineer":           {"voice": "am_eric",   "lang": "a", "speed": 1.05, "callsign": "Engineer"},
    "reviewer":           {"voice": "bm_lewis",  "lang": "b", "speed": 1.05, "callsign": "Reviewer"},
    "researcher":         {"voice": "bf_emma",   "lang": "b", "speed": 1.05, "callsign": "Researcher"},
    "launcher-engineer":  {"voice": "am_michael","lang": "a", "speed": 1.05, "callsign": "Launcher-Engineer"},
    "voice-technician":   {"voice": "af_nova",   "lang": "a", "speed": 1.05, "callsign": "Voice-Technician"},
    "persona-author":     {"voice": "af_heart",  "lang": "a", "speed": 1.0,  "callsign": "Persona-Author"},
    "commercial-producer":{"voice": "bm_fable",  "lang": "b", "speed": 0.95, "callsign": "Commercial-Producer"},
    "dungeon-master":     {"voice": "dm",        "lang": "a", "speed": 1.0,  "callsign": "Dungeon-Master"},
    "dm":                 {"voice": "dm",        "lang": "a", "speed": 1.0,  "callsign": "Dungeon-Master"},
    "frasier":            {"voice": "bf_emma",   "lang": "b", "speed": 1.05, "callsign": "Frasier"},
    "npc-agent":          {"voice": "am_adam",    "lang": "a", "speed": 1.0,  "callsign": "NPC"},
    "npc":                {"voice": "am_adam",    "lang": "a", "speed": 1.0,  "callsign": "NPC"},
    "default":            {"voice": "am_puck",   "lang": "a", "speed": 1.05, "callsign": ""},
}

# CUSTOM_VOICES: Add custom voice tensor mappings here.
# Example: "my_voice": {"voice_pt": "/path/to/my_voice.pt", "lang": "a", "speed": 1.0, ...}
# See kokoro-speak.py for the full schema (includes ffmpeg post-processing chains).
# Drive the path via env var so it works across machines without hardcoded paths:
#   export DISPATCH_DM_VOICE_PT="/path/to/dm-voice.pt"
_dm_voice_pt = os.environ.get("DISPATCH_DM_VOICE_PT", "")
CUSTOM_VOICES = {
    **({
        "dm": {"voice_pt": _dm_voice_pt, "lang": "a", "speed": 1.0},
    } if _dm_voice_pt else {}),
}

def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: set-voice.py <persona> | --voice <id> --lang <code> [--speed <n>]")
        sys.exit(1)

    # Manual voice override mode
    if args[0] == "--voice":
        config = {"voice": args[1], "lang": "a", "speed": 1.05, "callsign": ""}
        i = 2
        while i < len(args):
            if args[i] == "--lang" and i + 1 < len(args):
                config["lang"] = args[i + 1]
                i += 2
            elif args[i] == "--speed" and i + 1 < len(args):
                config["speed"] = float(args[i + 1])
                i += 2
            elif args[i] == "--callsign" and i + 1 < len(args):
                config["callsign"] = args[i + 1]
                i += 2
            else:
                i += 1
    else:
        persona = args[0].lower()
        config = VOICE_MAP.get(persona)
        if not config:
            print(f"Unknown persona: {args[0]}")
            print(f"Available: {', '.join(VOICE_MAP.keys())}")
            sys.exit(1)

    hooks_dir = os.path.dirname(os.path.abspath(__file__))
    session_id = _discover_session_id()
    port = os.environ.get("CLAUDE_CODE_SSE_PORT")

    # Write to both the local hooks dir AND the Windows-side hooks dir where
    # kokoro-speak.py (the actual TTS runtime) reads voice configs from.
    # In WSL, the Windows hooks dir is at /mnt/c/Users/<user>/.claude/hooks.
    windows_hooks = "/mnt/c/Users/" + os.environ.get("USER", "") + "/.claude/hooks"
    write_dirs = [hooks_dir]
    if os.path.isdir(windows_hooks) and os.path.realpath(windows_hooks) != os.path.realpath(hooks_dir):
        write_dirs.append(windows_hooks)

    paths_written = []
    for d in write_dirs:
        if session_id:
            paths_written.append(os.path.join(d, f"voice-config-{session_id}.json"))
        if port:
            paths_written.append(os.path.join(d, f"voice-config-{port}.json"))
    if not paths_written:
        paths_written.append(os.path.join(hooks_dir, "voice-config.json"))

    for config_path in paths_written:
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
            f.write("\n")

    if session_id:
        label = f" (session {session_id[:8]}…)"
    elif port:
        label = f" (port {port})"
    else:
        label = " (shared fallback)"
    cs = f" as {config['callsign']}" if config.get('callsign') else ""
    print(f"Voice set: {config['voice']} [{config['lang']}, {config['speed']}x]{cs}{label}")


def _discover_session_id():
    """Find the active Claude Code session UUID by locating the most-recently-modified
    transcript JSONL in this CWD's project dir. Returns None on any failure.
    """
    try:
        ppid = os.getppid()
        try:
            cwd = os.readlink(f"/proc/{ppid}/cwd")
        except OSError:
            cwd = os.getcwd()
        encoded = cwd.replace("/", "-")
        proj_dir = os.path.expanduser(f"~/.claude/projects/{encoded}")
        if not os.path.isdir(proj_dir):
            return None
        candidates = []
        for fn in os.listdir(proj_dir):
            if not fn.endswith(".jsonl"):
                continue
            full = os.path.join(proj_dir, fn)
            try:
                candidates.append((os.path.getmtime(full), fn[:-6]))
            except OSError:
                continue
        if not candidates:
            return None
        candidates.sort(reverse=True)
        return candidates[0][1]
    except Exception:
        return None


if __name__ == "__main__":
    main()
