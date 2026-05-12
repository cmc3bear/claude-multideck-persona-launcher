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
git clone https://github.com/cmc3bear/claude-multideck-persona-launcher.git
cd dispatch-framework

# Initialize on Windows (PowerShell)
.\scripts\init-dispatch-framework.ps1

# Or on macOS/Linux
./scripts/init-dispatch-framework.sh
```

The init script:
- Creates state directories
- Installs Node dependencies for the dashboard
- Sets up Python virtual environment
- Registers the default agent roster (all 9 operatives from personas.json)
- Tests Kokoro connectivity

---

## Step 2: Configure Your First Voice (1 minute)

```bash
# Assign the Dispatch agent the af_sky voice
python hooks/set-voice.py dispatch af_sky

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
# Dashboard running on http://localhost:3046
# Open in your browser to see the job board, agents, and briefing
```

**Dashboard routes:**
- `http://localhost:3046/` — Main desktop view (job board, agents, calendar)
- `http://localhost:3046/launcher` — Agent launcher with browser terminal
- `http://localhost:3046/briefing` — Morning briefing view
- `http://localhost:3046/audio-feed` — Listen to agent announcements (SSE stream)

---

## Step 3b: Launch an Agent in the Browser Terminal (optional)

The launcher includes a built-in browser terminal — no separate window needed.

1. Open `http://localhost:3046/launcher`
2. Select a persona from the character grid
3. In the transport row, select **BROWSER**
4. Click **LAUNCH**

A cyberpunk terminal panel slides up from the bottom. The agent session runs via WebSocket through a WSL pseudo-TTY. Features:

- **Multi-session tabs** — click `[ + NEW ]` to spawn additional agents; each gets its own tab with `×` to close independently
- **Minimize / restore** — `[ − MIN ]` hides the panel without killing sessions; a restore tab appears at bottom-right
- **Matrix rain panel** — 660px character stream to the right of the terminal, colored in the active persona's accent; composites all running persona colors when multiple sessions are active
- **Portrait watermarks** — each session's persona portrait appears as a tile in the rain at position N (one per session, rest blank)
- **Dangerous mode** — check `⚠ DANGEROUS` before launching to pass `--dangerously-skip-permissions` to claude

See [docs/BROWSER_TERMINAL.md](BROWSER_TERMINAL.md) for full reference.

### Remote Access via Tailscale

Because the server listens on `0.0.0.0:3046`, any device on your Tailscale network can open the launcher and use the browser terminal — the `claude` session runs on your dev machine:

```
# On any device in your Tailscale network:
http://your-machine-name:3046/launcher
```

Install Tailscale on both the host and the remote device. No port forwarding required. See [BROWSER_TERMINAL.md — Tailscale Remote Access](BROWSER_TERMINAL.md#tailscale-remote-access).

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

1. Open the dashboard at `http://localhost:3046`
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
# Check if port 3046 is in use
netstat -an | grep 3046  # (macOS/Linux)
netstat -ano | findstr :3046  # (Windows)

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
