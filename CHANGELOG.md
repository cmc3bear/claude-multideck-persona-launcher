# Changelog

All notable changes to MultiDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-04-19

### Added

- **OQE 5-criteria minimum** — Every Objective must now include a minimum of 5 success criteria functioning as a test plan. Each criterion must be specific (independently verifiable), observable (not subjective), and traceable to a piece of evidence.
- **Bad-criteria rejection list** — Vague criteria ("works correctly", "looks good", "covers the important stuff", "documentation is clear", "looks professional") are explicitly rejected by name in `docs/OQE_DISCIPLINE.md` with a rewrite guide.
- **Completion Gate phase** — New mandatory OQE phase: restate each criterion with evidence citation, grade evidence strength, declare MET or NOT MET before closing any task.
- **1:1 evidence mapping rule** — Every criterion must have at least one STRONG or MODERATE evidence item. No criterion closes on LIMITED evidence alone.
- **`--criteria` flag for job-board.py** — `create` command now accepts repeated `--criteria "..."` flags to store OQE criteria in the job board entry. Criteria are displayed in `show` output and validated in `validate`.
- **Criteria count validation** — `job-board.py validate` now checks that all jobs have minimum 5 criteria, reports count deficit alongside other missing fields.
- **Reviewer 6-gate review** — Reviewer gate expanded from 5 to 6 gates. New checks: criteria count minimum, criteria testability (observable and specific), 1:1 evidence mapping, and Completion Gate presence.
- **"What's New" section in README** — Version history section near the top of README shows capability additions over time.

### Changed

- `docs/OQE_DISCIPLINE.md` — Objective section rewritten with 5-criteria minimum, test-plan framing, worked examples with 5 criteria, good vs bad criteria table, updated Qualitative (walk each criterion), Evidence (1:1 mapping), and new Completion Gate section. Review checklist expanded. Common mistakes expanded.
- `CLAUDE.md` — OQE discipline summary updated with 5-criteria minimum, Completion Gate, and evidence mapping rule.
- `templates/AGENT_TEMPLATE.md` — New OQE section added before Governing Documents with criteria requirements inherited by all new personas.
- `personas/REVIEWER_AGENT.md` — Five-gate review expanded to six gates with explicit criteria count check, vague-criteria rejection list, 1:1 evidence mapping check, and Completion Gate check. Review checklist updated accordingly.

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
