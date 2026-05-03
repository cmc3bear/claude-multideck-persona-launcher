# Changelog

All notable changes to MultiDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.5.0] - 2026-05-02

### Added

- **OpenCode runtime support** — personas can now run on a local Ollama model instead of Claude Code. New launcher mode button `[ LOCAL ]` sets runtime to `opencode`. The HUD shows the active runtime in color: gold for Claude, cyan for OpenCode, purple for VS.
- **`scripts/launch-persona-opencode.ps1`** — Windows Terminal launcher that spawns a persona under OpenCode with a configurable Ollama model (default: `ollama/qwen3-coder:30b-32k`). Honors `DISPATCH_OPENCODE_MODEL` env var and `-Model` param. `wt`-transport only for v1.
- **`scripts/convert-personas-to-opencode.py`** — converts the MultiDeck persona registry (`personas/personas.json` + persona markdown files) to OpenCode agent definition files at `~/.config/opencode/agents/<key>.md`. Re-run after editing personas to regenerate. Respects `DISPATCH_OPENCODE_AGENTS_DIR` and `DISPATCH_OPENCODE_MODEL` env vars.
- **VS mode comparator** (`scripts/vs-comparator.py`) — pairs two completed jobs (one Claude, one OpenCode) that ran the same spec and produces a per-criterion OQE scorecard in `state/vs-scoreboard.json`. Structural scoring (criteria coverage + evidence presence) in v1; `--judge` flag for a runtime-rendered written verdict. `auto` subcommand pairs all unscored `vs_pair_id` entries automatically.
- **`/launcher/models` endpoint** — reads registered Ollama models from `~/.config/opencode/opencode.json` and surfaces them in the launcher model dropdown. Model selection applies to LOCAL and VS runtime modes.
- **Three new example personas** — Dungeon-Master (D&D 5e DM with server-authoritative dice and scene API), NPC-Agent (in-character NPC spawned with identity + secret via initial prompt), and Frasier (CBT-style wellness chat). Ship as template personas illustrating project-scoped and therapist use cases.
- **`DISPATCH_DM_VOICE_PT`** env var — points the `dm` custom voice key to a Kokoro `.pt` tensor file. When unset the `dm` key falls back to a standard Kokoro voice; no hardcoded paths in the distributed hooks.
- **WSL dual-write** for `set-voice.py` — when running inside WSL, voice configs are written to both the WSL hooks directory and the Windows-side `~/.claude/hooks` so the Windows Kokoro runtime picks up per-session voice without cross-OS path issues.

### Changed

- `CUSTOM_VOICES` in `hooks/kokoro-speak.py`, `hooks/kokoro-generate-mp3.py`, and `hooks/set-voice.py` now use `DISPATCH_DM_VOICE_PT` env var instead of a hardcoded file path. Existing deployments with a custom DM voice tensor: set `DISPATCH_DM_VOICE_PT=/path/to/dm-voice.pt` before launch.
- `personas/personas.json` DM and NPC `cwd` entries use `${DISPATCH_USER_ROOT}/dnd-campaign` (templated) instead of an absolute path. Update to your actual campaign directory in your local fork.
- `scripts/vs-comparator.py` `--judge` flag now requires an explicit `--allow-dangerous` flag to pass `--dangerously-skip-permissions` to the judge subprocess. Without it the judge runs with normal permission prompts.

---

## [0.4.0] - 2026-04-21

### Added

- **Visual job board** at `/jobs` — six view modes: Board, Dispatch Radar, Constellation, Reviewer Log, Pattern Detector, Meeting Room. Legacy server-rendered view preserved at `/jobs-classic`.
- **Lessons system (OQE 2.0)** — structured lesson capture with schema validation per `docs/REVIEWER_LOG.md §2`. Top-5 lesson matcher surfaces prior lessons on every open job's detail drawer.
- **Pattern Detector view** — cross-job tenet-break trends, worktype heatmap, phase distribution, and coverage gap analysis.
- **Meeting Room** — create and browse structured agent round-tables linked to jobs.
- **Modular JS/CSS architecture** under `dashboard/scripts/` and `dashboard/styles/`.
- **State templates** for clean initialization of lessons, meetings, and all runtime state files in `dashboard/state-templates/`.
- **`/state.json` multi-board bundle** — `job-boards` map + `lessons` + `meetings` + legacy briefing keys. Per-project boards discovered automatically from `state/job-board-<name>.json`.
- **OQE 2.0 six-tenet short form** (T1–T6) added to `docs/OQE_DISCIPLINE.md`; Reviewer Log and Lesson Capture Protocol cross-referenced.
- **Topology B operator guide** at `docs/TMUX_TOPOLOGY.md` — keybinds, attach/detach workflow, empirical pane-count threshold, troubleshooting.
- **`scripts/install-wsl-kokoro-venv.sh`** — reproducible WSL Kokoro venv installer with pinned versions, idempotent, supports `--verify` and `--force`.
- **Persistent transport preference** in the launcher UI via `localStorage`. `availability_reason` field on `GET /launcher/transports` distinguishes five availability states.
- **ATTACH/DETACH HELP modal** in the launcher (tmux transport only).
- **WSL Ubuntu transport precondition** — Claude Code CLI in WSL Ubuntu calling Windows-side Kokoro hooks via WSL Interop. Includes `docs/WSL_SETUP.md`, `scripts/wsl/wsl-binfmt.service`, and WSL hook bridge scripts.

### Changed

- **`DISPATCH_LAUNCHER_TRANSPORT` default is now auto-detected** — picks `tmux` when WSL Ubuntu, tmux, and the claude binary are all present; otherwise `wt` on Windows or `sh` on Linux/macOS. Set `DISPATCH_LAUNCHER_TRANSPORT=wt` to force the legacy flow.

---

## [0.3.0] - 2026-04-18

### Added

- **OQE criteria enforcement** — objectives require a minimum of 5 testable, independently verifiable success criteria. Vague criteria ("works correctly", "looks good") are explicitly rejected and flagged by Reviewer.
- **1:1 evidence mapping** — every criterion needs STRONG or MODERATE evidence before a job can close.
- **Completion Gate phase** — restate each criterion with evidence citation before declaring done.
- **`job-board.py --criteria` flag** — track OQE criteria per job for full traceability.

---

## [0.2.0] - 2026-04-16

### Added

- **Workspace governance** (`docs/WORKSPACE_GOVERNANCE.md`) — 9 coordination standards, project boundary enforcement, push denial escalation protocol.
- **`alternatives_considered` field** now required on job close.
- **Validate command** added to `job-board.py`.
- **Hero 60-second commercial spot** and GIF previews in README.
- **Team mode** and distinct persona screenshots in the launcher.

---

## [0.1.2] - 2026-04-15

### Added

- **Requirements section** in README with explicit prerequisites (Claude Code CLI, Python 3.10+, Node.js 18+, Tailscale, ffplay)
- **Coordination Standards** section in Dispatch persona — mandatory operating rules for coordinator agents (automation-first, Reviewer gate before operator interaction, OQE on everything)
- Added `af_nova` to voice-audition.py preview list (used by Voice-Technician)
- Added `DISPATCH_PERSONAS_JSON` and `DISPATCH_WORKSPACE_ROOT` to README env var table

### Fixed

- Corrected persona count from "five" to "nine" across README, CLAUDE.md, PERSONA_SYSTEM.md, team-presets.json
- Replaced all "JACK IN" button references with "DEPLOY" to match actual launcher UI
- Restyled main dashboard to match cyberpunk dark theme (consistent with launcher and audio feed)
- Synchronized VOICE_MAPs across set-voice.py, kokoro-generate-mp3.py, and kokoro-summary.py
- Fixed CLAUDE.md voice guidance to correctly identify VOICE_MAP files
- Fixed PERSONA_SYSTEM.md to use correct `DISPATCH_ROOT` env var
- Fixed set-voice.py docstring to list all 9 personas instead of 5
- Added .gitignore coverage for session state markdown files and draft personas
- Removed unreferenced screenshot files

---

## [0.1.1] - 2026-04-15

### Added

- **Four MultiDeck-specific personas** — Launcher-Engineer, Voice-Technician, Persona-Author, Commercial-Producer added to the default roster (total: 9 operatives)
- **commercials/ directory** — Working directory for Commercial-Producer persona

### Fixed

- Documentation accuracy: persona colors, scopes, schema version, and file paths corrected across all docs

---

## [0.1.0] - 2026-04-15

### Added

- **Persona system** — Framework for defining Claude agents with callsigns, voice keys, working directories, and operational scopes
- **Default agent roster** — Nine framework agents: five core (Dispatch, Architect, Engineer, Reviewer, Researcher) plus four MultiDeck-specific (Launcher-Engineer, Voice-Technician, Persona-Author, Commercial-Producer)
- **Job board** — JSON-based work queue with status tracking and completion gates
- **OQE discipline** — Objective → Qualitative → Evidence framework for systematic decision-making
- **Kokoro voice integration** — Per-session voice isolation, atomic queueing via filesystem mutex, persona callsign announcements
- **Dashboard** — HTTP server with multiple views (desktop, mobile, briefing, audio-feed, launcher)
- **Add/remove agent workflow** — Scripts for dynamic agent roster management
- **Comprehensive documentation** — 10+ guides covering setup, persona system, voice rules, review workflows, and best practices
- **Templates** — Agent scaffold and persona.json entry template for custom agent creation
- **Agent Teams compatibility** — Guidance for using MultiDeck with Claude Code's Agent Teams flag
- **.gitignore** — Proper exclusion of runtime state, voice configs, and generated content

### Initial Release

Framework distribution skeleton for multi-persona Claude Code coordination.

---

## Planned Features (Roadmap)

- Discord bot integration with slash commands
- Workflow templates (e.g., commercial production script → review → Reviewer → publication)
- Agent dependency graphs (job A blocks job B until complete)
- Advanced audio feed with voice activity detection and speaker identification
- Mobile app (beyond browser-based views)
- Cross-workspace coordination (multiple Claude Code instances)
- Persistent job history and analytics
