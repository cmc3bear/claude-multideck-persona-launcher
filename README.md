# MultiDeck

**A multi-agent orchestration framework for Claude Code that looks like a video game title screen. On purpose.**

Multiple AI operatives. Each with their own voice. One launcher. You pick your team from a character-select screen, hit DEPLOY, and real Claude Code sessions spin up in color-coded terminal tabs or right inside the browser, each with its own persona, scope, and synthesized voice. A job board tracks the work. A quality gate reviews it. An audio feed plays their reports out loud so you can walk away from the keyboard and just listen.

It runs entirely local. Zero API cost with a Claude Code CLI membership. Fork it, add your own operatives, your own voices, your own background music. Run it on Windows, Linux, macOS, or a **Steam Deck in your hands**. Make it yours.

![MultiDeck running on a Steam Deck — browser terminal, matrix rain, Voice-Technician persona, push-to-talk mic](docs/screenshots/steamdeck-voice-tech.jpg)

*Voice-Technician deployed on a Steam Deck. Browser terminal, matrix rain composite, push-to-talk mic in the header. Gamepad navigates the launcher. v0.7.*

![Live multi-session browser terminal — five operatives spawned, Dispatch active, matrix rain composites their accent colors with persona portraits as watermarks](docs/screenshots/browser-terminal.png)

*Five operatives spawned at once. Dispatch active on the terminal panel, the others holding state in their own tabs. Matrix rain composites every active persona's accent color and tiles their portraits as watermarks. Works locally and over Tailscale from any device on your network.*

### Watch: How Do You Claude?

![How Do You Claude?](docs/media/how-do-you-claude-preview.gif)

[Watch the full 40-second spot](https://github.com/cmc3bear/claude-multideck-persona-launcher/raw/main/docs/media/how-do-you-claude.mp4)

*Vanilla Claude Code vs Claude Code inside MultiDeck. Same tool, different deck.*

---

## What's New

**v0.7.0** — Steam Deck Native + Gamepad + Voice In

- **Steam Deck install** — `scripts/install-steamdeck.sh` puts MultiDeck inside a distrobox Arch container so SteamOS's read-only root is never touched and the install survives OS updates. `scripts/steamdeck-launcher.sh` opens the dashboard in Chromium kiosk mode, ready to add to Steam as a Non-Steam Game. Walks through gamepad-permission first-press, mic auto-grant, and the 7" Deck CSS pass at `@media (max-width: 1280px) and (max-height: 800px)`. Full guide in [STEAMDECK_SETUP.md](docs/STEAMDECK_SETUP.md).
- **Web Gamepad API input layer** — `dashboard/scripts/launcher-gamepad.js` polls `navigator.getGamepads()` at 60 Hz and dispatches `multideck:gamepad:*` events. Dpad and left stick both emit `nav`. A/B/X/Y emit `option` with index 0–3. L1 latches push-to-talk. The launcher and modals are fully navigable without touching the keyboard.
- **Push-to-talk mic** — `[ ◉ MIC ]` button in the terminal header, or hold L1 on the gamepad. Whisper.cpp runs locally inside the container (pinned `v1.7.4`, `base.en` model). Transcribed text is injected into the active xterm.js session as if typed. New `POST /stt/transcribe` route on the dashboard.
- **AskUserQuestion glyph modal** — when Claude calls its `AskUserQuestion` tool, a PreToolUse hook (`hooks/dashboard-question-bridge.py`) intercepts, writes the payload to `state/pending-questions/`, and the dashboard's new `GET /events/questions` SSE channel pushes it to a glyph-mapped modal. A/B/X/Y map to options 0/1/2/3 with green/red/blue/yellow glyphs. Multi-select via R1. Claude never renders its native CLI prompt; the operator answers with one button-press.
- **Installer auto-wires the hook** — `ensure_claude_hook` in `install-steamdeck.sh` idempotently merges the PreToolUse matcher into `~/.claude/settings.json` so the bridge works out-of-the-box.

**v0.6.0** — Browser Terminal + Remote Access

- **Browser transport** — fourth launcher transport option (`BROWSER`) opens a live Claude session inside the browser itself. No terminal emulator required. Runs via WebSocket to a host pseudo-TTY; the `claude` process has full local filesystem access.
- **Multi-session tab management** — spawn as many agents as you want; each gets its own tab in the terminal panel header with an independent `×` close. `[ + NEW ]` returns to character select while keeping all sessions alive. `[ − MIN ]` hides the panel without killing anything; a restore tab shows `[ ◈ N TERMINALS ACTIVE ]`.
- **Matrix rain panel** — cyberpunk character stream to the right of each terminal. Composites all active persona accent colors (each column picks randomly from the pool of running agents). Persona portraits tile as watermarks on the canvas. Density scales with session count, column width shrinks so the rain gets visibly denser as you add agents.
- **Terminal color theming** — xterm foreground, cursor, and ANSI color slots are set to the persona's accent color at session init. The "SECURE CHANNEL ESTABLISHED" banner uses ANSI true-color to match exactly.
- **Tailscale remote access** — because the server listens on `0.0.0.0:3046`, any device on your Tailscale network can open the launcher and run a full browser terminal session. The spawned `claude` process runs on your dev machine. Access your local agents from a phone, laptop, or tablet from anywhere.

**v0.5.0** — OpenCode + Local Models
- Run any persona on a local Ollama model instead of Claude Code. New `[ LOCAL ]` mode in the launcher sets runtime to OpenCode; HUD shows active runtime in color (gold = Claude, cyan = OpenCode, purple = VS)
- `scripts/launch-persona-opencode.ps1` — spawn a persona under OpenCode with a configurable Ollama model (default: `qwen3-coder:30b-32k`); honors `DISPATCH_OPENCODE_MODEL` env var
- `scripts/convert-personas-to-opencode.py` — converts all personas to OpenCode agent files at `~/.config/opencode/agents/<key>.md`; re-run after editing personas to regenerate
- VS mode (`scripts/vs-comparator.py`) — pair a Claude job and an OpenCode job on the same spec; per-criterion OQE scorecard written to `state/vs-scoreboard.json`
- `/launcher/models` endpoint — reads registered Ollama models from `~/.config/opencode/opencode.json` and surfaces them in the launcher model selector
- Three new example personas: **Dungeon-Master** (D&D 5e with server-authoritative dice API), **NPC-Agent** (in-character NPC spawned with identity and secret), **Frasier** (CBT-style wellness chat)
- `DISPATCH_DM_VOICE_PT` env var for custom Kokoro voice tensor — no hardcoded paths in the distributed hooks

**v0.4.0** — Job Board Dashboard + OQE 2.0 Self-Improvement Loop
- Visual job board at `/jobs` replaces the old server-rendered page (legacy preserved at `/jobs-classic`)
- Six view modes: Board, Dispatch Radar, Constellation, Reviewer Log, Pattern Detector, Meeting Room
- Live data mode pulls `/state.json` from the dashboard server; mock mode ships usable sample fixtures
- Lessons system (OQE 2.0): structured lesson capture with schema validation per REVIEWER_LOG.md §2
- Deterministic top-5 lesson matcher surfaces prior lessons on every open job's detail drawer
- Pattern Detector view: cross-job tenet-break trends, worktype heatmap, phase distribution, coverage gaps
- Meeting Room: create and browse structured agent round-tables linked to jobs
- Modular JS/CSS architecture under `dashboard/scripts/` and `dashboard/styles/`
- State templates for clean initialization of lessons, meetings, and all runtime state files
- `/state.json` extended to multi-board bundle: `job-boards` map + `lessons` + `meetings` + legacy briefing keys
- New static routes: `/scripts/*`, `/styles/*`, `/data/*` — sandboxed, path-traversal-safe
- OQE 2.0 six-tenet short form (T1–T6) added to `docs/OQE_DISCIPLINE.md`; Reviewer Log & Lesson Capture Protocol cross-referenced

**v0.3.0** — OQE Criteria Enforcement
- Objectives now require a minimum of 5 testable success criteria functioning as a test plan
- Criteria must be specific (independently verifiable), observable (not subjective), and traceable to evidence
- Vague criteria — "works correctly", "looks good", "covers the important stuff" — are explicitly rejected and flagged by Reviewer
- Job board tracks OQE criteria per job for full traceability; `job-board.py` supports `--criteria` flag
- Reviewer agent validates criteria count and testability on every completed job (6-gate review)
- Evidence now maps 1:1 to criteria — every criterion needs STRONG or MODERATE evidence before closing
- New Completion Gate phase: restate each criterion with evidence citation before declaring done

**v0.2.0** — Workspace Governance + Extended Roster
- Workspace governance doc with 9 coordination standards and boundary enforcement
- Push denial escalation protocol (5-step mandatory response)
- Job board `alternatives_considered` field now required on close
- Validate command added to job board CLI
- Hero 60-second commercial spot and GIF previews in README
- Team mode, distinct persona screenshots

**v0.1.0** — Initial Release
- 9 default personas: Dispatch, Architect, Engineer, Reviewer, Researcher, Launcher-Engineer, Voice-Technician, Persona-Author, Commercial-Producer
- Cyberpunk character-select launcher at `/launcher` with portraits, music, danger mode, and team deploy
- Dashboard server with briefing, state, mobile, and audio feed routes
- OQE discipline (Objective → Qualitative → Evidence) framework for all work
- Job board CLI with create / assign / submit / review / close workflow
- Kokoro TTS with per-session voice isolation, atomic queueing, persona callsigns
- Audio feed auto-play browser page for operator mode (hands-free agent monitoring)
- Cross-platform persona launcher (Windows PowerShell + Linux/macOS bash)
- `dispatch-agent.py add/remove` for dynamic roster management

---

## Why MultiDeck

- **Character-select for AI agents is a better UX than config files.** The cyberpunk launcher is not decoration. It is the interface. Click an operative, see their stats, deploy them. Intuitive, memorable, and fast.

- **Your agents have voices.** Kokoro TTS gives each operative a distinct synthesized voice. Dispatch sounds different from Engineer sounds different from Researcher. They announce themselves by callsign. You learn who is talking without looking at a screen.

- **You can listen to your agents work from another room.** The audio feed auto-plays every TTS update in a browser tab. Open it on your phone over Tailscale. Go make coffee. Your deck keeps running and you hear it.

- **Work gets tracked and reviewed automatically.** Per-project job boards with priority, assignment, submission, and a Reviewer quality gate. No work closes without passing review. One fix attempt, then escalate. No infinite loops.

- **Runs on a Steam Deck.** Add MultiDeck to your library as a Non-Steam Game. Browser-terminal transport means there is no terminal emulator to fight with in Gaming Mode. Gamepad navigates the launcher, A/B/X/Y answer questions, L1 holds push-to-talk for voice input. Local Whisper transcription means no cloud, no API cost, no waiting.

---

## Screenshots

Click any thumbnail for the full-resolution image.

### Launcher flow

Boot to deployment in twelve seconds. Studio splash, title gate, menu, project pick, mode pick, character select, dossier, team deploy.

<table>
  <tr>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-boot.png"><img src="docs/screenshots/thumbs/launcher-boot.png" alt="Boot sequence"></a>
      <br><sub><b>Boot.</b> Scanlines. Synth. Vibe locked.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-title.png"><img src="docs/screenshots/thumbs/launcher-title.png" alt="Title gate"></a>
      <br><sub><b>Title gate.</b> Press start.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-menu.png"><img src="docs/screenshots/thumbs/launcher-menu.png" alt="Main menu"></a>
      <br><sub><b>Menu.</b> Seven ways in.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-projects.png"><img src="docs/screenshots/thumbs/launcher-projects.png" alt="Target node"></a>
      <br><sub><b>Target node.</b> Pick the deck.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-new-project.png"><img src="docs/screenshots/thumbs/launcher-new-project.png" alt="Spin up node"></a>
      <br><sub><b>Spin up node.</b> New project. Zero friction.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-mode-select.png"><img src="docs/screenshots/thumbs/launcher-mode-select.png" alt="Mode select"></a>
      <br><sub><b>Choose your mode.</b> Local. Co-op. Versus.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-select.png"><img src="docs/screenshots/thumbs/launcher-select.png" alt="Character select"></a>
      <br><sub><b>The deck.</b> Twelve operatives. One launcher.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-persona-detail.png"><img src="docs/screenshots/thumbs/launcher-persona-detail.png" alt="Persona dossier"></a>
      <br><sub><b>Dossier.</b> Know your runner.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-team-mode.png"><img src="docs/screenshots/thumbs/launcher-team-mode.png" alt="Team presets"></a>
      <br><sub><b>Team presets.</b> Squad up.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="docs/screenshots/launcher-jacking-in.png"><img src="docs/screenshots/thumbs/launcher-jacking-in.png" alt="Jacking in"></a>
      <br><sub><b>Jacking in.</b> Cyber on.</sub>
    </td>
    <td align="center" width="33%">&nbsp;</td>
    <td align="center" width="33%">&nbsp;</td>
  </tr>
</table>

The menu options:

| Option | What it does |
|---|---|
| **CONTINUE** | Resume your last session. Restores the project and operative you had selected. |
| **LOAD** | Pick a different project from your workspace. Each project shows only the operatives scoped to it. |
| **NEW GAME** | Create a new project entry. Name it, point it at a directory, and start fresh. |
| **TEAMS** | Launch a preset team of operatives in parallel. Full Roster, Build Team, or Investigation squad. |
| **MUSIC** | Browse and switch between the eleven cyberpunk BGM tracks. |
| **OPTIONS** | Access dashboard routes — main ops view, briefing, job board, audio feed. |
| **QUIT** | Shutdown sequence. Scanlines out. |

### Operator tools

The dashboard, the audio feed, the browser terminal, the persona builder. Where work actually happens.

<table>
  <tr>
    <td align="center" width="50%">
      <a href="docs/screenshots/dashboard-main.png"><img src="docs/screenshots/thumbs/dashboard-main.png" alt="Operations dashboard"></a>
      <br><sub><b>Operations dashboard.</b> Actions, schedule, escalations. JSON-backed, live.</sub>
    </td>
    <td align="center" width="50%">
      <a href="docs/screenshots/audio-feed.png"><img src="docs/screenshots/thumbs/audio-feed.png" alt="Audio feed"></a>
      <br><sub><b>Audio feed.</b> Leave this tab open. Every report plays automatically.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <a href="docs/screenshots/browser-terminal.png"><img src="docs/screenshots/thumbs/browser-terminal.png" alt="Browser terminal"></a>
      <br><sub><b>Browser terminal.</b> BROWSER transport runs Claude inside the launcher. Matrix rain composites all active persona colors.</sub>
    </td>
    <td align="center" width="50%">
      <a href="docs/screenshots/persona-builder.png"><img src="docs/screenshots/thumbs/persona-builder.png" alt="Persona Builder"></a>
      <br><sub><b>Persona Builder.</b> Interactive form to author a new operative. Identity, color, voice, scope, working directory.</sub>
    </td>
  </tr>
</table>

### Job board views

One job board, six view modes. Switch via the segmented bar in the top-right.

<table>
  <tr>
    <td align="center" width="33%">
      <a href="docs/screenshots/job-board.png"><img src="docs/screenshots/thumbs/job-board.png" alt="Board view"></a>
      <br><sub><b>Board.</b> Kanban columns by status. Click for detail drawer.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/job-board-radar.png"><img src="docs/screenshots/thumbs/job-board-radar.png" alt="Dispatch Radar"></a>
      <br><sub><b>Dispatch Radar.</b> Agent workload, cross-project assignment.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/job-board-cluster.png"><img src="docs/screenshots/thumbs/job-board-cluster.png" alt="Constellation"></a>
      <br><sub><b>Constellation.</b> Cluster by tags, project, operative.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="docs/screenshots/job-board-reviewer-log.png"><img src="docs/screenshots/thumbs/job-board-reviewer-log.png" alt="Reviewer Log"></a>
      <br><sub><b>Reviewer Log.</b> Lesson browser, six tenets, ratification.</sub>
    </td>
    <td align="center" width="33%">
      <a href="docs/screenshots/job-board-pattern-detector.png"><img src="docs/screenshots/thumbs/job-board-pattern-detector.png" alt="Pattern Detector"></a>
      <br><sub><b>Pattern Detector.</b> Tenet-break trends, phase chart, worktype × tenet matrix.</sub>
    </td>
    <td align="center" width="33%">
      <!-- Sixth view (Meeting Room) is dynamic; see /jobs?view=meeting-room live. -->
      &nbsp;
    </td>
  </tr>
</table>

### Loops

Short animated captures of the launcher and job board in motion. Headless puppeteer renders at 1600x900, downscaled to 800px for GIF; no audio.

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/media/boot-sequence.gif" alt="Boot sequence loop">
      <br><sub><b>Boot sequence.</b> Studio splash, title flicker, PRESS START, menu reveal. ~12s.</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/media/character-select-flow.gif" alt="Character select walkthrough">
      <br><sub><b>Character select walkthrough.</b> Menu → LOAD → project → mode → 12-persona grid. ~12s.</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/media/menu-flythrough.gif" alt="Menu flythrough">
      <br><sub><b>Menu flythrough.</b> Selection arrow walks all seven menu items. ~8s.</sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/media/job-board-views.gif" alt="Job board view modes">
      <br><sub><b>Job board view modes.</b> Board, Radar, Constellation, Reviewer Log, Pattern Detector, Meeting Room. Same data, six lenses. ~16s.</sub>
    </td>
  </tr>
</table>

---

## Requirements

- **Claude Code CLI** — [claude.ai/code](https://claude.ai/code). MultiDeck orchestrates Claude Code sessions. A CLI membership gives you unlimited agent runs at zero marginal cost.
- **Python 3.10+** — Required for Kokoro TTS hooks, job board CLI, and agent management scripts.
- **Node.js 18+** — Required for the dashboard server.
- **Windows Terminal** (Windows), any terminal emulator (Linux/macOS), or **Chromium** in the distrobox container (Steam Deck). The launcher opens color-coded tabs per operative, or hosts the session in-browser via `BROWSER` transport.
- **Tailscale** (recommended) — [tailscale.com](https://tailscale.com). Tailscale creates a private mesh network between your devices. With it, you can open the audio feed (`/audio-feed`), the launcher (`/launcher`), or the job board (`/jobs`) on your phone from anywhere, not just your local network. This is what enables "operator mode," where you walk away from the desk and listen to your agents work from another room or another building. Without Tailscale, the dashboard is only accessible on localhost or your LAN.
- **ffplay** (optional) — Part of FFmpeg. Required for Kokoro TTS audio playback. Install FFmpeg and ensure `ffplay` is on your PATH.
- **Steam Deck** (optional, for the Deck install path) — SteamOS 3 (Holo). `scripts/install-steamdeck.sh` bootstraps distrobox + podman, an Arch toolbox container, nodejs/npm/tmux/ffmpeg/chromium, the Claude Code CLI, the Kokoro venv, and a `whisper.cpp` build for local STT. See [STEAMDECK_SETUP.md](docs/STEAMDECK_SETUP.md).

---

## Deploy

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File scripts/init-dispatch-framework.ps1
```

### Linux / macOS

```bash
bash scripts/init-dispatch-framework.sh
```

The init script sets up your environment, creates runtime directories, and installs the Kokoro TTS venv.

### Steam Deck

In Desktop Mode, open Konsole and run:

```bash
git clone https://github.com/cmc3bear/claude-multideck-persona-launcher.git ~/multideck
cd ~/multideck
chmod +x scripts/install-steamdeck.sh scripts/steamdeck-launcher.sh
./scripts/install-steamdeck.sh
```

That one script installs distrobox + podman (one-time with `steamos-readonly disable`), creates an Arch toolbox container, installs nodejs / npm / tmux / ffmpeg / chromium / python / git, the Claude Code CLI, the Kokoro venv, builds `whisper.cpp` for local mic-to-text, generates `~/.local/share/applications/multideck.desktop`, and wires the `AskUserQuestion` PreToolUse hook into `~/.claude/settings.json`. Then add the `.desktop` file as a Non-Steam Game and launch from Gaming Mode. Full walkthrough in [STEAMDECK_SETUP.md](docs/STEAMDECK_SETUP.md).

### Launch an operative

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts/launch-persona.ps1 dispatch

# Linux / macOS
bash scripts/launch-persona.sh dispatch
```

A new terminal tab opens with the persona color, the persona markdown loaded into Claude Code, and the Kokoro voice set. You are now talking to that operative.

### Start the dashboard

```bash
node dashboard/server.cjs
```

Visit `http://localhost:3046`. Key routes:

| Route | What it serves |
|---|---|
| `/` | Main ops dashboard (actions, schedule, escalations) |
| `/launcher` | Cyberpunk character-select launcher, browser terminal, gamepad nav, MIC + glyph modal |
| `/terminal/ws` | WebSocket upgrade for browser-terminal pty sessions (`BROWSER` transport) |
| `/jobs` | Visual job board dashboard (multi-view, live state) |
| `/jobs-classic` | Legacy server-rendered job board (backward compat) |
| `/briefing` | Morning briefing view |
| `/audio-feed` | Auto-play Kokoro TTS feed |
| `/state.json` | Live state bundle (job-boards + lessons + meetings + briefing keys) |
| `/api/kokoro/stats` | Kokoro queue depth and drop counters |
| `/stt/transcribe` | POST audio body, get back `{text}` (whisper.cpp local STT, v0.7+) |
| `/events/questions` | SSE channel that pushes AskUserQuestion payloads to the glyph modal (v0.7+) |
| `/questions/:sessionId/answer` | POST the operator's answers back to the PreToolUse bridge (v0.7+) |

---

## The Deck

MultiDeck ships with twelve operatives out of the box: nine canonical agents plus three project-scoped examples. Each one has a callsign, a terminal tab color, a Kokoro voice, and a defined scope of work.

| Callsign | Voice | Role |
|---|---|---|
| **Dispatch** | af_sky | Workspace coordinator. Routes jobs, runs briefings, manages the board. |
| **Architect** | bm_daniel | Structure and documentation. System design, dependency maps, standards. |
| **Engineer** | am_eric | Code implementation, testing, debugging. Writes the code that ships. |
| **Reviewer** | bm_lewis | Quality gate. Reviews every completed job. One fix loop, then pass or escalate. |
| **Researcher** | bf_emma | Investigation and source grading. Finds answers, cites evidence, rates confidence. |
| **Launcher-Engineer** | am_michael | Launcher UI, dashboard routes, persona spawning, Windows Terminal integration. |
| **Voice-Technician** | af_nova | Kokoro TTS hooks, voice config, audio pipeline, voice quality. |
| **Persona-Author** | af_heart | Persona design, agent markdown authoring, roster management. |
| **Commercial-Producer** | bm_fable | Demo video production. Script, audio, video, review gate, final. |
| **Dungeon-Master** | dm | Example project persona. D&D 5e DM with server-authoritative dice. Project-scoped to `dnd-campaign`. |
| **NPC** | npc | Example project persona. In-character NPC spawned with identity and secret. |
| **Frasier** | frasier | Example project persona. CBT-style wellness chat. Therapeutic frame, no diagnosis. |

The three example personas illustrate project-scoped use cases. Fork them, swap them for your own, or delete them. Operatives are defined in `personas/personas.json`. Each entry maps a callsign to a color, voice, working directory, and agent markdown file that defines behavior and scope.

### Adding your own operatives

```bash
python scripts/dispatch-agent.py add
```

Interactive prompts walk you through callsign, display name, color, voice selection, and scope. The script updates the persona registry, generates the agent markdown from a template, creates a launch shortcut, and syncs the voice map. No manual JSON editing required.

---

## Comms

### Kokoro TTS

Every operative speaks through Kokoro, a local neural TTS engine. No cloud API. No per-character billing. Voices run on your machine.

The `hooks/kokoro-speak.py` worker handles playback with an atomic mkdir mutex so parallel Claude Code sessions never overlap audio. Each operative prepends its callsign before speaking, so you always know who is talking.

Available voices span American and British, male and female. Seventeen voices ship by default. Custom voice tensors (`.pt` files) are supported for anyone who wants to train their own.

### Audio feed

The dashboard serves an auto-play audio feed at `/audio-feed`. It polls for new TTS MP3s every four seconds and plays them in queue order. Leave the tab open on any device with a browser. Your operatives report in. You listen.

This is the core of what MultiDeck calls "operator mode." A laptop or phone with the audio feed tab open becomes a passive monitoring station. You hear your deck work without watching it.

### Background music

Eleven cyberpunk BGM tracks ship with the launcher. The title screen and character select play ambient music automatically. Toggle with the MUSIC button in the corner.

### Voice in (v0.7)

Press the `[ ◉ MIC ]` button in the terminal header, or hold L1 on a connected gamepad, and speak. `whisper.cpp` running locally inside the container transcribes via the `POST /stt/transcribe` route and injects the text into the active xterm.js session as if typed. No cloud, no API key, no per-second charge. The Steam Deck install pins `v1.7.4` of whisper.cpp with the `base.en` model; bigger models are a config swap if you have the disk.

### Gamepad input (v0.7)

The launcher polls `navigator.getGamepads()` at 60 Hz and dispatches `multideck:gamepad:*` `CustomEvent`s. Standard mapping: dpad and left stick emit `nav`, A/B/X/Y emit `option` with index 0–3, L1 latches push-to-talk, R1 confirms multi-select. The launcher and every modal are navigable without touching the keyboard. The same code path runs on a desktop with any USB or Bluetooth gamepad plugged in.

### AskUserQuestion glyph modal (v0.7)

When Claude calls its `AskUserQuestion` tool, a PreToolUse hook (`hooks/dashboard-question-bridge.py`) intercepts before Claude renders its CLI prompt. The hook writes the question payload to `state/pending-questions/<session>.json`. The dashboard's `GET /events/questions` SSE channel pushes it to a glyph-mapped modal (A/B/X/Y → option 0/1/2/3 with green/red/blue/yellow glyphs). Multi-question payloads walk one at a time; multiSelect questions confirm with R1. On answer, the hook returns `permissionDecision=allow` with the operator's selection so Claude proceeds as if it asked normally. On 60-second timeout the hook returns `deny` with a graceful message. Desktop fallback uses mouse and keyboard.

---

## The Board

The job board is a JSON-backed work queue with file-locked concurrent access.

```bash
# Create a job and assign it
python scripts/job-board.py create "Implement auth middleware" --assigned-to engineer --priority P1

# List active jobs
python scripts/job-board.py list --status in_progress --agent engineer

# Submit completed work for review
python scripts/job-board.py submit 1 --output /path/to/artifact.py

# Review: pass or flag for rework
python scripts/job-board.py review 1 --pass --note "Clean implementation, tests pass"
python scripts/job-board.py review 1 --flag --note "Missing error handling on line 42"
```

Every job flows through the Reviewer gate before closing. The Reviewer gets one fix loop. If the issue persists after one rework, it escalates. No infinite revision cycles.

Jobs are scoped per-project. Multiple projects can run their own boards without collision.

---

## Job Board Dashboard

The job board has a dedicated visual dashboard at `/jobs`. It is a single-page app served by the dashboard server and wired live to `/state.json`.

```
http://localhost:3046/jobs
```

### View modes

| View | What it shows |
|---|---|
| **Board** | Kanban-style columns by status. Click any ticket to open its detail drawer. |
| **Dispatch Radar** | Agent workload and cross-project assignment overview. |
| **Constellation** | Cluster view grouping jobs by tags, project, and operative. |
| **Reviewer Log** | Structured lesson browser. Tenet-frequency rail, lesson list, full lesson detail. |
| **Pattern Detector** | Cross-job trend analysis: tenet-break heatmap, phase distribution, tag frequency, open-job coverage gaps. |
| **Meeting Room** | Create and browse structured agent round-tables (triage, retrospective, standup, review, planning, ratification). |

Switch views from the left rail, the segmented button bar, or the TWEAKS panel.

### Live vs. mock data

The dashboard ships with sample fixture data so it renders something useful out of the box. When you are ready to see real state:

1. Start the dashboard server: `node dashboard/server.cjs`
2. Open `/jobs` in a browser.
3. Click the data-source pill in the top bar (shows `MOCK`) to toggle to `LIVE`.

The mode persists in `localStorage` under the key `mdk-data-mode`. In live mode the dashboard polls `/state.json` every 15 seconds (configurable in TWEAKS). If the fetch fails, the dashboard holds the last good snapshot and shows an error indicator — it never silently substitutes mock data.

### Multi-board discovery

`/state.json` automatically picks up every `state/job-board*.json` file as a separate board. The project key is derived from the filename stem (`job-board-multideck.json` → `multideck`, `job-board.json` → `workspace`). No configuration required; add a new board file and the dashboard finds it on the next poll.

### Job detail drawer

Clicking any ticket opens a side drawer with:

- Full job description, result, blocker, and alternatives considered
- **Prior Lessons panel** — the top-5 ratified lessons matched to this specific job by the deterministic scorer (tag overlap, worktype, transitive tags, universal lessons, same-project bonus). Click a matched lesson to jump to its Reviewer Log entry.
- Timeline of all state transitions and review history
- START MEETING shortcut to open a linked meeting in the Meeting Room view

### Toolbar controls

| Control | Function |
|---|---|
| Search (`/` to focus) | Filter by subject, tag, or job ID |
| Priority chips (P0–P3) | Multi-select priority filter |
| SHOW CLOSED toggle | Include or exclude closed jobs |
| Data-source pill | Toggle LIVE / MOCK; shows last-fetch age |
| Refresh button (↻) | Force an immediate `/state.json` fetch |
| TWEAKS panel | Density, accent color, scanlines, poll interval, endpoint |

---

## Lessons System (OQE 2.0)

The Reviewer Log view is the front end for the OQE 2.0 self-improvement loop. Every operationally significant mistake becomes a structured lesson that is matched against future jobs.

### Lesson schema

Lessons live in `state/lessons.json`. The schema is validated by `dashboard/scripts/lessons-validate.js` against the rules in `docs/REVIEWER_LOG.md §2`. Required fields:

| Field | Requirement |
|---|---|
| `job_id` | Must match `/^[A-Z]+-[A-Z]+-\d{4}$/` |
| `tenets_broken` | At least 1 entry, each with `tenet` number and `how` (10+ chars) |
| `root_cause` | 20+ characters, no instance-specific language ("this bug", "this ticket") |
| `applies_to` | 20+ characters, abstracted to a class of situation |
| `applies_to_tags` | At least 1 tag |
| `mitigations` | At least 3, each 15+ characters (one complete sentence) |

The editor in the Reviewer Log view validates on every save attempt. A broken lesson will not save until all schema errors are resolved.

### Lesson lifecycle

1. **Draft** — authored in the Reviewer Log editor, stored in `state/lessons.json`
2. **Ratified** — reviewed by Dispatch (or a meeting vote) per `docs/REVIEWER_LOG.md §5`
3. Only ratified lessons appear in Pattern Detector analytics

### Lesson matcher

The deterministic scorer (`dashboard/data/lessons.js`) ranks lessons against any job using a fixed formula:

```
score = tag_overlap × 3 + transitive × 1 + worktype × 2 + universal × 0.5 + same_project × 0.5
```

The top 5 results (minimum score 1) appear in the job drawer's Prior Lessons panel. All score components are inspectable in the browser console via `window.debugMatcher(jobId)`.

### Initializing state files

`dashboard/state-templates/` contains blank templates for every state file the server reads. Copy them to `state/` to bootstrap a fresh installation:

```bash
cp dashboard/state-templates/lessons.json.template state/lessons.json
cp dashboard/state-templates/meetings.json.template state/meetings.json
# Repeat for other templates as needed
```

The templates ship with empty arrays and correct schema headers. The server reads them without error even when empty.

---

## OQE Protocol

Every operative follows OQE discipline on every task. Three layers, no exceptions.

**Objective** -- one sentence on what the task accomplishes, plus the criteria it will be judged against.

**Qualitative** -- confidence assessment. HIGH, MODERATE, or LOW. What assumptions are being made. What alternatives were considered. Why this approach.

**Evidence** -- what was actually observed. File paths, line numbers, error messages, test results, source URLs. Each piece tagged STRONG (direct observation), MODERATE (inferred), or LIMITED (single-source, unverified).

The Reviewer checks for OQE framing on every job. No OQE, no pass.

Full methodology in [docs/OQE_DISCIPLINE.md](docs/OQE_DISCIPLINE.md).

---

## Build Your Own Deck

MultiDeck is designed to be forked.

1. **Clone the repo.**
2. **Run the init script** to set up directories, install Kokoro, and configure your environment.
3. **Add your own operatives** with `dispatch-agent.py add`. Give them callsigns, voices, scopes, colors.
4. **Drop portraits** into `dashboard/launcher-assets/` if you want custom character art on the select screen.
5. **Add BGM tracks** to the launcher assets for your own soundtrack.
6. **Set environment variables** to point at your projects directory, customize the port, or change the state directory.

Key environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `DISPATCH_PORT` | Dashboard HTTP port | `3046` |
| `DISPATCH_ROOT` | Framework root directory | auto-detected |
| `DISPATCH_STATE_DIR` | Runtime state JSON directory | `./state` |
| `DISPATCH_PERSONAS_JSON` | Path to personas registry | `$DISPATCH_ROOT/personas/personas.json` |
| `DISPATCH_TTS_OUTPUT` | Kokoro MP3 output directory | `./tts-output` |
| `DISPATCH_PROJECTS_DIR` | Projects directory to scan | unset |
| `DISPATCH_LAUNCHER_ASSETS` | Portraits, intros, music | `./dashboard/launcher-assets` |
| `DISPATCH_TEAM_PRESETS` | Team preset definitions | `./dashboard/team-presets.json` |
| `DISPATCH_WORKSPACE_ROOT` | Workspace root for state context | `$DISPATCH_ROOT` |
| `DISPATCH_LAUNCHER_TRANSPORT` | Persona spawn transport: `wt`, `tmux`, `sh`, or `BROWSER`. Auto-detected from host. | auto-detect |
| `DISPATCH_KOKORO_VENV` | Linux/WSL Kokoro venv path (tmux transport) | `~/.dispatch-kokoro-venv` |
| `DISPATCH_TMUX_SESSION` | tmux session name for tiled persona panes | `multideck` |
| `DISPATCH_CLAUDE_BIN` | Override `claude` binary path | `claude` |
| `DISPATCH_WHISPER_BIN` | whisper.cpp CLI binary (v0.7 push-to-talk) | `~/.dispatch-whisper/build/bin/whisper-cli` |
| `DISPATCH_WHISPER_MODEL` | whisper.cpp model file | `~/.dispatch-whisper/models/ggml-base.en.bin` |
| `DISPATCH_OPENCODE_MODEL` | Ollama model used by OpenCode runtime | `ollama/qwen3-coder:30b-32k` |
| `DISPATCH_OPENCODE_AGENTS_DIR` | Output directory for converted OpenCode agent files | `~/.config/opencode/agents` |
| `DISPATCH_DM_VOICE_PT` | Path to a custom Kokoro `.pt` voice tensor for the `dm` voice key | unset (standard voice used) |
| `MULTIDECK_BOX` | distrobox container name (Steam Deck install) | `multideck-box` |

The job board dashboard reads additional state files from `DISPATCH_STATE_DIR` automatically:

| File | Purpose |
|---|---|
| `state/job-board.json` | Default workspace job board |
| `state/job-board-<name>.json` | Per-project board (discovered automatically) |
| `state/lessons.json` | Operational lessons (OQE 2.0) |
| `state/meetings.json` | Meeting records |

Everything coordinates via filesystem. No database. No message broker. JSON state files with atomic writes and mkdir-based file locks. Add as many operatives as you want. They will not step on each other.

---

## Further Reading

| Doc | What it covers |
|---|---|
| [WORKSPACE_GOVERNANCE.md](docs/WORKSPACE_GOVERNANCE.md) | Governance standards: coordination rules, OQE, job fields, review workflow, boundary enforcement |
| [REVIEWER_LOG.md](docs/REVIEWER_LOG.md) | OQE 2.0 lesson schema, ratification protocol, six tenets, matcher scoring formula |
| [QUICKSTART.md](docs/QUICKSTART.md) | Five-minute install guide |
| [PERSONA_SYSTEM.md](docs/PERSONA_SYSTEM.md) | How personas work: callsigns, colors, voices, scopes |
| [OQE_DISCIPLINE.md](docs/OQE_DISCIPLINE.md) | The full OQE methodology |
| [KOKORO_SETUP.md](docs/KOKORO_SETUP.md) | Kokoro TTS installation and configuration |
| [WSL_SETUP.md](docs/WSL_SETUP.md) | Install Claude Code in WSL Ubuntu as a tmux persona transport |
| [STEAMDECK_SETUP.md](docs/STEAMDECK_SETUP.md) | Run MultiDeck on a Steam Deck via distrobox, with a Non-Steam Game shortcut |
| [VOICE_RULES.md](docs/VOICE_RULES.md) | TTS-safe writing conventions |
| [DASHBOARD_GUIDE.md](docs/DASHBOARD_GUIDE.md) | Dashboard routes, configuration, and static asset paths |
| [CLAUDE_DISPATCH_INTEGRATION.md](docs/CLAUDE_DISPATCH_INTEGRATION.md) | Voice queueing, callsigns, and audio feed |
| [JOB_BOARD.md](docs/JOB_BOARD.md) | Job board usage and schema |
| [REVIEW_WORKFLOW.md](docs/REVIEW_WORKFLOW.md) | The Reviewer gate process |
| [ADD_AGENT_GUIDE.md](docs/ADD_AGENT_GUIDE.md) | Walkthrough of dispatch-agent.py add/remove |
| [AGENT_TEAMS_GUIDE.md](docs/AGENT_TEAMS_GUIDE.md) | Claude Code agent teams integration |
| [COMMERCIAL_PRODUCTION.md](docs/COMMERCIAL_PRODUCTION.md) | Commercial and demo video production workflow |

---

## License

MIT. See [LICENSE](LICENSE).

## Contributing

Extensions, custom operatives, and new integrations welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
