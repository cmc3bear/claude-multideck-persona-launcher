# MultiDeck Quickstart — 5 Minutes to First Agent

Get a working MultiDeck setup in under 5 minutes. This walks you through initialization, configuring your first voice, creating an agent, and launching the dashboard.

## Prerequisites

- **Python 3.9+** (for scripts)
- **Node.js 16+** (for dashboard)
- **Kokoro** (for voice TTS)
- **Claude Code** — Already running or ready to launch

---

## Step 1: Clone and Initialize (1 minute)

```bash
# Clone the framework
git clone https://github.com/multideck/dispatch-framework.git
cd dispatch-framework

# Initialize on Windows (PowerShell)
.\scripts\init-multideck.ps1

# Or on macOS/Linux
./scripts/init-multideck.sh
```

The init script:
- Creates state directories
- Installs Node dependencies for the dashboard
- Sets up Python virtual environment
- Registers the default agent roster (Dispatch, Architect, Engineer, Reviewer, Researcher)
- Tests Kokoro connectivity

---

## Step 2: Configure Your First Voice (1 minute)

```bash
# Assign the Dispatch agent the af_sky voice
python scripts/set-voice.py dispatch af_sky

# Choose from: af_sky, am_eric, bf_emma, bm_lewis, bm_fable, etc.
# See docs/KOKORO_SETUP.md for the full catalog
```

This writes a per-session voice configuration file, so your voice choice doesn't interfere with other running Claude Code tabs.

---

## Step 3: Launch the Dashboard (30 seconds)

```bash
# Start the dashboard server
node dashboard/server.cjs

# Output:
# Dashboard running on http://localhost:3045
# Open in your browser to see the job board, agents, and briefing
```

**Dashboard routes:**
- `http://localhost:3045/` — Main desktop view (job board, agents, calendar)
- `http://localhost:3045/mobile` — Mobile-optimized (smaller screen)
- `http://localhost:3045/briefing` — Morning briefing view
- `http://localhost:3045/audio-feed` — Listen to agent announcements (SSE stream)

---

## Step 4: Open Claude Code (1 minute)

In Claude Code:

```
Load the Dispatch persona
```

This triggers Claude to read `personas/DISPATCH_AGENT.md` and adopt the Dispatch identity.

---

## Step 5: Create Your First Job (1 minute)

In the Claude Code session or dashboard, create a test job:

```bash
python scripts/job-board.py create \
  --agent "Architect" \
  --summary "Write a quickstart guide for MultiDeck" \
  --description "5-minute walkthrough to get users running" \
  --priority "P2"
```

Or post directly to the job board JSON and watch the dashboard update in real-time.

---

## Step 6: Assign and Complete

1. Open the dashboard at `http://localhost:3045`
2. See your job in the queue
3. Assign it to an agent (click agent name)
4. Agent processes the job (in their Claude Code tab)
5. Agent submits completion with results
6. Reviewer gate checks the work (PASS/FLAG)
7. On PASS, job moves to completed. On FLAG, back to the agent with feedback
8. If listening to `/audio-feed`, hear a Kokoro TTS announcement: "Architect reporting: quickstart guide complete and approved."

---

## Next Steps

- **Add a custom agent** — `python scripts/dispatch-agent.py add --callsign MyAgent --color "#HEX" --voice "voice_key"`
- **Read the full docs** — See `docs/` for deep dives on OQE discipline, persona system, voice rules, and more
- **Extend the dashboard** — See `CONTRIBUTING.md` for adding new routes and hooks
- **Explore examples** — Check `examples/` for real-world use cases

---

## Troubleshooting

**Dashboard won't start:**
```bash
# Check if port 3045 is in use
netstat -an | grep 3045  # (macOS/Linux)
netstat -ano | findstr :3045  # (Windows)

# Kill the process and try again
kill -9 <PID>  # (macOS/Linux)
taskkill /PID <PID> /F  # (Windows)
```

**Voice not playing:**
- Verify Kokoro is installed: `python -c "import kokoro; print('OK')"`
- Check KOKORO_VENV path in init script
- See `docs/KOKORO_SETUP.md` for detailed voice setup

**Claude Code session not loading persona:**
- Copy the full path to your `personas/DISPATCH_AGENT.md`
- Paste into Claude: "Load this persona from [path]"

---

For more help, see the full documentation in `docs/`.
