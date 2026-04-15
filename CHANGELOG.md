# Changelog

All notable changes to MultiDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-15

### Added

- **Persona system** — Framework for defining Claude agents with callsigns, voice keys, working directories, and operational scopes
- **Default agent roster** — Five core framework agents (Dispatch, Architect, Engineer, Reviewer, Researcher) with complete persona specs
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
