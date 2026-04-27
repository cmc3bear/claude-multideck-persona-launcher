# Changelog

All notable changes to MultiDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **`DISPATCH_LAUNCHER_TRANSPORT` default is now auto-detected** (MULTI-FEAT-0063). When the env var is unset the dashboard picks `tmux` on hosts where WSL Ubuntu, tmux, and the claude binary are all present, otherwise `wt` on Windows or `sh` on Linux/macOS. Operators with full WSL setups now get the detach/reattach-capable tmux path without opt-in. **Rollback:** set `DISPATCH_LAUNCHER_TRANSPORT=wt` to force the legacy Windows Terminal flow even on a host that could run tmux. The env var override always wins. Builds on the WSL+tmux+claude probe shipped in MULTI-UI-0064.

### Added

- **Topology B operator guide** at `docs/TMUX_TOPOLOGY.md` — keybinds, attach/detach workflow, empirical pane-count threshold (N=12 readable on a 240×60 terminal with the standard title format), and troubleshooting (MULTI-FEAT-0065)
- **`scripts/install-wsl-kokoro-venv.sh`** — reproducible WSL Kokoro venv installer with pinned versions, idempotent, supports `--verify` (drift detection) and `--force` (rebuild). Closes the B-2 audio path portability gap from MULTI-FEAT-0055 (MULTI-OQE-0062)
- **`scripts/measure-mnt-f-throughput.py`** — TTS-cadence and stress-mode write throughput probe for `/mnt/f` vs an ext4 baseline. R2 risk from MULTI-FEAT-0055 feasibility resolved: 23.87 MB/s sustained, p95 4ms — ~500x headroom over realistic TTS workloads (MULTI-OQE-0062)
- **`scripts/measure-pane-threshold.sh`** — empirical pane-readability probe for tmux tiled layouts (MULTI-FEAT-0065)
- **Persistent transport preference** in the launcher UI via `localStorage`. Selection survives reload; help glyph next to the transport row explains tmux availability state on hover/click/focus (MULTI-UI-0064)
- **`availability_reason` field** on `GET /launcher/transports` distinguishing `available`, `wsl-not-detected`, `wsl-detected-tmux-missing`, `tmux-installed-but-no-claude`, and `platform-not-windows` (MULTI-UI-0064)
- **ATTACH/DETACH HELP modal** in the launcher, visible only when tmux is the selected transport, with the top keybinds and a pointer to `docs/TMUX_TOPOLOGY.md` (MULTI-FEAT-0065)
- **`scripts/test-mutex-cross-os.{py,sh}` skew correction** — `--barrier-ts` busy-wait gate eliminates cold-start asymmetry between WSL Linux Python and powershell-spawned Windows Python; 20-round atomicity verified, bias inverted vs the MULTI-FEAT-0055 baseline confirming launch-skew was the original asymmetry source (MULTI-OQE-0062)
- **`dispatch-agent.py remove`** now kills the matching tmux pane in the shared `multideck` session (when running) and rebalances the tiled layout so other persona PIDs are preserved (MULTI-FEAT-0065)

- **WSL Ubuntu transport precondition** for tmux persona spawning (MULTI-INFRA-0056, unblocks MULTI-FEAT-0055). Claude Code CLI now installs and runs inside WSL Ubuntu, calling Windows-side Kokoro hooks via WSL Interop. No duplicate Kokoro/torch install in WSL — bridges shell out to the existing Windows kokoro-venv. The current `scripts/launch-persona.ps1` (Windows Terminal tab spawning) remains the default transport; the planned `scripts/launch-persona-tmux.sh` will use this WSL install to drive `tmux new-window` for native multiplexed persona lanes.
- `docs/WSL_SETUP.md` — full install guide covering non-root user creation, native installer, the systemd-binfmt re-enable workaround, the WSL→Windows hook bridge, and end-to-end audio-feed verification
- `scripts/wsl/wsl-binfmt.service` — one-shot systemd unit that re-registers WSLInterop on boot (Ubuntu disables `systemd-binfmt.service` under `systemd=true`, which silently breaks Windows .exe execution from WSL bash)
- `scripts/wsl/wsl-stop-hook.sh` and `scripts/wsl/wsl-tool-hook.sh` — bash bridges that forward Claude Code Stop and PostToolUse events to `speak-kokoro.py` / `speak-tool-status.py` running under the Windows kokoro-venv. Sets `DISPATCH_ROOT` so MP3s land in dispatch-framework's `tts-output/` (not the legacy `dispatch/` default). Forwards `CLAUDE_CODE_SSE_PORT` through `WSLENV` so per-session voice-config isolation works across the boundary.
- `scripts/wsl/wsl-claude-settings.json` — template `~/.claude/settings.json` that wires the bridges into Claude Code

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
