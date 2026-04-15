# MultiDeck — Claude Code Project Context

This is the MultiDeck framework — a forkable multi-agent coordination system built on top of Claude Code. Personas, a cyberpunk launcher, a dashboard, Kokoro TTS integration, and OQE-disciplined job board workflows.

When a Claude Code session opens this directory, this file provides the project-level context that every persona inherits.

---

## What is MultiDeck

MultiDeck is the public distribution of a persona-driven Claude Code orchestration framework. It ships with:

- **Five default personas** — Dispatch (workspace coordinator), Architect (structure + docs), Engineer (code), Reviewer (quality gates), Researcher (investigation). Each persona has its own voice, color, callsign, and OQE discipline. Personas spawn in dedicated terminal windows with distinct tab colors via the launcher system.

- **A cyberpunk character-select launcher** — `dashboard/launcher.html` renders a retro-themed UI where you click an operative card, optionally check dangerous mode, hit "JACK IN", and a new Windows Terminal tab opens with the persona pre-loaded.

- **A dashboard server** — `dashboard/server.cjs` serves the launcher plus dashboard routes (/, /briefing, /audio-feed, /state.json) and launcher API routes (/launcher/personas, /launcher/projects, /launcher/launch, /launcher/launch-team, /launcher/assets/*).

- **Kokoro TTS integration** — `hooks/kokoro-speak.py` plays generated audio with an atomic mkdir mutex so parallel Claude Code sessions don't overlap. Each persona prepends its callsign to spoken text so you learn which voice belongs to which role. `hooks/kokoro-generate-mp3.py` produces MP3s for programmatic use. `hooks/set-voice.py` writes per-session voice config via CLAUDE_CODE_SSE_PORT so each session has its own voice without clobbering others.

- **An auto-play audio feed** — `dashboard/audio-feed-page.cjs` renders a browser page that polls for new TTS MP3s and plays them automatically. Leave a tab open on `/audio-feed`, and every Dispatch audio response plays without you needing to click.

- **A job board system** — `scripts/job-board.py` is a CLI for creating jobs, assigning to agents, submitting for review, running the Reviewer gate, and closing with dependency tracking.

- **A reviewer process capability** — `scripts/reviewer-review.py` runs a sanitization and quality check on any job artifact. The review gate fires on every completed job with a one-loop fix window before escalation.

- **CLI tooling for adding/removing agents** — `scripts/dispatch-agent.py add` and `remove` manage the persona roster with interactive prompts, updates to `personas.json`, auto-generates launch shortcuts, and keeps `set-voice.py` VOICE_MAP in sync.

The framework is branded as **MultiDeck** for public distribution. Internal path is `dispatch-framework/`. Discipline is **OQE** (Objective, Qualitative, Evidence) — rebranded from the older "O-E-Q" for public consistency.

---

## Directory structure

```
dispatch-framework/
├── README.md                   Hero doc for new users
├── LICENSE                     MIT
├── CLAUDE.md                   This file — project context for Claude Code
├── CHANGELOG.md                Version history
├── CONTRIBUTING.md             How to extend the framework
├── .gitignore                  Runtime state, secrets, internal docs excluded
├── docs/
│   ├── QUICKSTART.md           5-minute install guide
│   ├── OQE_DISCIPLINE.md       Core methodology (Objective → Qualitative → Evidence)
│   ├── PERSONA_SYSTEM.md       How personas work: callsigns, colors, voices, scopes
│   ├── CLAUDE_DISPATCH_INTEGRATION.md   The voice queueing + callsign + audio-feed bundle
│   ├── KOKORO_SETUP.md         Full Kokoro install instructions
│   ├── VOICE_RULES.md          TTS-safe writing conventions
│   ├── DASHBOARD_GUIDE.md      Dashboard routes and configuration
│   ├── AGENT_TEAMS_GUIDE.md    Claude Code EXPERIMENTAL_AGENT_TEAMS integration
│   ├── ADD_AGENT_GUIDE.md      Walkthrough of dispatch-agent.py add/remove
│   ├── JOB_BOARD.md            Job board usage and schema
│   ├── REVIEW_WORKFLOW.md      The Reviewer gate process
│   └── COMMERCIAL_PRODUCTION.md Commercial/demo video production workflow
├── personas/
│   ├── personas.json           Registry — callsign, color, voice_key, cwd, agent_file per persona
│   ├── DISPATCH_AGENT.md       Workspace coordinator
│   ├── ARCHITECT_AGENT.md      Structure + docs
│   ├── ENGINEER_AGENT.md       Code implementation
│   ├── REVIEWER_AGENT.md       Quality gate
│   └── RESEARCHER_AGENT.md     Investigation + source grading
├── scripts/
│   ├── launch-persona.ps1      Windows launcher (Windows Terminal tab with color + title)
│   ├── launch-persona.sh       Linux/macOS launcher
│   ├── dispatch-agent.py       add/remove/list CLI for agent management
│   ├── job-board.py            Job board CLI
│   ├── reviewer-review.py      Reviewer gate runner
│   ├── init-dispatch-framework.ps1  Windows init script
│   └── init-dispatch-framework.sh   Linux/macOS init script
├── hooks/
│   ├── set-voice.py            Per-session Kokoro voice config writer
│   ├── kokoro-speak.py         TTS playback worker (with mkdir mutex + callsign prepend)
│   ├── kokoro-generate-mp3.py  Programmatic MP3 generator
│   ├── voice-audition.py       Voice preview tool
│   └── requirements.txt        Python deps: kokoro, soundfile, torch, numpy
├── dashboard/
│   ├── server.cjs              Dashboard HTTP server with launcher + audio feed routes
│   ├── audio-feed-page.cjs     Auto-play audio feed browser page renderer
│   ├── launcher.html           The MultiDeck launcher UI (cyberpunk character select)
│   ├── team-presets.json       Default team presets: Full Roster, Build Team, Investigation
│   ├── package.json            Node package metadata (no runtime deps)
│   ├── state-templates/        Empty schema-valid default state JSON files
│   └── launcher-assets/        Portraits, intros, music bed (gitkept placeholder)
├── templates/
│   ├── AGENT_TEMPLATE.md       Template for user-created personas
│   └── persona-entry.json      JSON template for adding a persona to personas.json
└── examples/
    └── README.md               Example use case walkthroughs
```

---

## Working on MultiDeck itself

When you are editing MultiDeck (as opposed to using it for another project), here are the touchpoints that matter most:

**Changing the launcher UI:** edit `dashboard/launcher.html`. It's a single-file HTML with inline CSS and JS. Fetches data from `/launcher/personas`, `/launcher/projects`, `/launcher/music`, `/launcher/team-presets`. Has hardcoded fallback STATS and GLYPHS for each persona — update those if you rename or add personas.

**Adding a dashboard route:** edit `dashboard/server.cjs`. Add a new condition in the request handler (alongside the existing `handleLauncher`, `handleAudioFeed`, and core route matches). Use the `sendJson(res, status, obj)` helper for JSON responses and `fs.createReadStream` for binary streaming.

**Changing voice behavior:** edit `hooks/kokoro-speak.py` (playback with mutex), `hooks/kokoro-generate-mp3.py` (one-shot MP3 generation), or `hooks/set-voice.py` (voice registry). Keep VOICE_MAP in sync across all three files. The mkdir mutex at `LOCK_DIR` is critical — never remove it or parallel sessions overlap.

**Adding a persona:** run `python scripts/dispatch-agent.py add` and follow the interactive prompts. It updates `personas.json`, generates the agent markdown from `templates/AGENT_TEMPLATE.md`, creates a launch shortcut, and updates `set-voice.py` VOICE_MAP. Don't edit `personas.json` by hand unless you're fixing a typo.

**Adding a doc:** new markdown file in `docs/`. Reference it from README.md's "Further reading" or from another doc that groups it. Follow the existing tone — technical but readable, code examples where relevant, no marketing fluff.

**Testing changes locally:** run `node dashboard/server.cjs`. The dashboard serves on port 3045 (configurable via `DISPATCH_PORT`). Visit `http://localhost:3045/launcher` to see the launcher, `/audio-feed` for the audio feed, `/` for the main dashboard.

**Pushing to the public repo:** the repo is `github.com/cmc3bear/claude-multideck-persona-launcher`. Commit with a conventional-commit-style message (`feat:`, `fix:`, `docs:`, `chore:`, etc.). Don't commit runtime state files (`state/*.json` except templates), `tts-output/*.mp3`, `voice-config-*.json`, or anything matching `.internal-*` — those are all in `.gitignore` already.

---

## OQE discipline (MANDATORY for all personas)

Every task that any persona handles follows **Objective → Qualitative → Evidence**:

1. **Objective** — one-sentence statement of what the task is trying to accomplish, plus success criteria the task will be judged against.

2. **Qualitative** — confidence assessment before and after. HIGH / MODERATE / LOW. What assumptions am I making? What alternatives did I consider? Why this approach over others?

3. **Evidence** — what was actually observed. Cite file paths, line numbers, error messages, test results, source URLs. Tag each piece of evidence STRONG (direct observation), MODERATE (inferred), or LIMITED (single-source or unverified).

Every deliverable must include an OQE frame in its completion report. The Reviewer checks for it on every job.

Full explanation in `docs/OQE_DISCIPLINE.md`.

---

## Voice output rules (MANDATORY for Kokoro TTS)

When any persona writes text that will be spoken aloud:

- No em dashes, en dashes, tildes, backticks, brackets, pipes, code blocks, tables, or URLs in spoken output
- Commas instead of dashes for pauses
- Say "home directory" not tilde
- Collapse file paths to top directory plus last part when speaking them
- Spell out numbers for TTS clarity
- Conversational tone, not documentation voice
- No special characters that read aloud as literal punctuation names

The TTS hook auto-strips markdown before synthesis, but well-written source text produces better audio. Full rules in `docs/VOICE_RULES.md`.

---

## Job board auto-advance rule

When personas complete work on the MultiDeck project, they **auto-advance** without asking permission unless a real decision gate is needed. Mechanical steps complete and move forward. Decisions escalate only for:

- Fundamental approach changes (different architecture, different vendor, different paradigm)
- External publication (GitHub push, npm publish, YouTube upload, public announcement)
- Cost-bearing operations (API calls with meaningful spend, compute time)
- Ambiguity that best judgment cannot resolve
- A prior assumption proven wrong such that the work needs redirecting

Otherwise the job flows through the Reviewer gate and closes. The Reviewer gate is one-loop-max — one fix attempt, then either PASS or FAIL-ESCALATE.

See `docs/JOB_BOARD.md` and `docs/REVIEW_WORKFLOW.md` for full protocol.

---

## Environment variables

MultiDeck reads configuration from environment variables to avoid hardcoded paths:

| Variable | Purpose | Default |
|---|---|---|
| `DISPATCH_PORT` | Dashboard HTTP port | `3045` |
| `DISPATCH_ROOT` | Framework root directory | `..` relative to dashboard/ |
| `DISPATCH_STATE_DIR` | Runtime state JSON directory | `$DISPATCH_ROOT/state` |
| `DISPATCH_PERSONAS_JSON` | Path to personas registry | `$DISPATCH_ROOT/personas/personas.json` |
| `DISPATCH_TTS_OUTPUT` | Kokoro MP3 output directory | `$DISPATCH_ROOT/tts-output` |
| `DISPATCH_LAUNCHER_ASSETS` | Portraits / intros / music | `$DISPATCH_ROOT/dashboard/launcher-assets` |
| `DISPATCH_TEAM_PRESETS` | Team preset JSON | `$DISPATCH_ROOT/dashboard/team-presets.json` |
| `DISPATCH_PROJECTS_DIR` | Active projects directory to scan | (unset = no project scan) |
| `DISPATCH_WORKSPACE_ROOT` | Workspace root for "WORKSPACE ROOT" target node | `$DISPATCH_ROOT` |
| `CLAUDE_CODE_SSE_PORT` | Set by Claude Code, used by hooks for per-session voice config | (set automatically) |

Set these before launching the dashboard, or accept the defaults.

---

## Claude Dispatch Integration (the named component)

Three features ship together as the "Claude Dispatch Integration" component. This is the differentiator vs vanilla Claude Code:

1. **Voice queueing** — multiple parallel Claude sessions don't overlap audio. The `kokoro-speak.py` hook uses an atomic mkdir mutex to serialize playback.

2. **Persona callsigns** — each voice opens with its callsign ("Dispatch.", "Architect.", "Engineer.", etc.) so you learn which voice belongs to which role. The callsign is stored in `personas.json` and prepended by `kokoro-speak.py` and `kokoro-generate-mp3.py` before synthesis.

3. **Audio feed auto-play** — `/audio-feed` in the dashboard is a browser page that polls for new Kokoro TTS MP3s and plays them automatically. Leave a tab open on your laptop, and every agent update plays without you needing to interact.

Together these create "operator mode" — a laptop browser tab hears agent work as it completes without requiring the operator's attention on the desktop machine.

Full doc at `docs/CLAUDE_DISPATCH_INTEGRATION.md`.

---

## Pre-push checklist for commits to the public repo

Before you commit and push:

- [ ] No author-specific handles, emails, or absolute paths in any new content
- [ ] No author's private project content (internal project names, proprietary data)
- [ ] No author-specific persona names in active code or docs (the 5 framework defaults are the only in-scope roster)
- [ ] Environment variables used instead of hardcoded paths
- [ ] OQE discipline applied to all writing (Objective → Qualitative → Evidence)
- [ ] Voice rules followed for any text that might be spoken
- [ ] Runtime state files not committed (check `.gitignore`)
- [ ] README "Further reading" section updated if you added docs
- [ ] CHANGELOG.md updated for user-visible changes

The `scripts/reviewer-review.py` script automates most of these checks. Run it before pushing.

---

## Where to find things fast

- Launcher UI bug? `dashboard/launcher.html`
- New API route? `dashboard/server.cjs` + wire into the request handler
- Voice issue? `hooks/kokoro-speak.py` or `hooks/set-voice.py`
- Persona roster change? `personas/personas.json` (single source of truth)
- Persona behavior change? `personas/<NAME>_AGENT.md`
- Doc question? Start with `README.md`, drill into `docs/`
- Job board issue? `scripts/job-board.py` + `docs/JOB_BOARD.md`
- Review gate issue? `scripts/reviewer-review.py` + `docs/REVIEW_WORKFLOW.md`

---

*This is the project context for Claude Code. All personas inherit it. Read it first when spawning a new session on this codebase.*
