# MultiDeck Dashboard

Real-time dashboard server for the MultiDeck framework. Displays state, calendar, actions, and audio feed.

## Running the Dashboard

```bash
node dashboard/server.cjs
```

Then visit `http://localhost:3045` in your browser.

## Environment Variables

- `DISPATCH_PORT` — Port to listen on (default: 3045)
- `DISPATCH_STATE_DIR` — Path to state directory (default: ./state)
- `DISPATCH_ROOT` — Framework root (default: parent directory)
- `DISPATCH_TTS_OUTPUT` — Path to TTS output directory (default: ./tts-output)

Example:

```bash
DISPATCH_PORT=3000 DISPATCH_STATE_DIR=/var/lib/dispatch/state node server.cjs
```

## Routes

- `/` — Main dashboard with overview and cards
- `/briefing` — Morning briefing (JSON from morning-pipeline.json)
- `/audio-feed` — Cyberpunk-themed audio feed player
- `/audio-feed/list` — List of available MP3 files (JSON)
- `/audio-feed/mp3/<filename>` — Download MP3 file
- `/state.json` — Complete state dump (all JSON files merged)
- `/launcher` — MultiDeck cyberpunk character-select launcher UI
- `/launcher/personas` — Persona registry (JSON from personas.json)
- `/launcher/projects` — Active projects list (JSON)
- `/launcher/music` — Available music bed tracks (JSON)
- `/launcher/team-presets` — Team preset configurations (JSON)
- `/launcher/launch` — Launch a single persona (POST)
- `/launcher/launch-team` — Launch a team preset (POST)
- `/launcher/assets/*` — Portraits, intros, and other launcher assets

## Features

- Auto-loads all state files from state/ directory
- Streams MP3 files from tts-output/ on demand
- Polls for new audio files every 4 seconds
- Clean, responsive dashboard UI
- Minimal dependencies (Node builtins only)
