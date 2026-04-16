"""Set per-instance Kokoro voice config for a persona.

Usage: python set-voice.py <persona_callsign>
       python set-voice.py --voice <voice_id> --lang <lang_code> [--speed <speed>]

Reads CLAUDE_CODE_SSE_PORT from env to write session-specific config.
Each persona entry includes a 'callsign' field that the TTS hook prepends to the text
so each voice introduces itself when speaking.

MultiDeck framework: Default personas only (dispatch, architect, engineer, reviewer, researcher).
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
    "default":            {"voice": "am_puck",   "lang": "a", "speed": 1.05, "callsign": ""},
}

# CUSTOM_VOICES: Add custom voice tensor mappings here.
# Example: "my_voice": {"voice_pt": "/path/to/my_voice.pt", "lang": "a", "speed": 1.0, ...}
# See kokoro-speak.py for the full schema (includes ffmpeg post-processing chains).
CUSTOM_VOICES = {}

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

    # Determine session-specific config path
    port = os.environ.get("CLAUDE_CODE_SSE_PORT")
    hooks_dir = os.path.dirname(os.path.abspath(__file__))
    if port:
        config_path = os.path.join(hooks_dir, f"voice-config-{port}.json")
    else:
        config_path = os.path.join(hooks_dir, "voice-config.json")

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    label = f" (port {port})" if port else " (shared fallback)"
    cs = f" as {config['callsign']}" if config.get('callsign') else ""
    print(f"Voice set: {config['voice']} [{config['lang']}, {config['speed']}x]{cs}{label}")

if __name__ == "__main__":
    main()
