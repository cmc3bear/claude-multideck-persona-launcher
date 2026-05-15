# Changelog

All notable changes to MultiDeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.7] - 2026-05-15

Integration release. Merges origin/main feature work (correction tracking pipeline, Internal Affairs persona, gamepad rebinding, gamepad tutorial, Steam Deck screenshots) with local-only operational infrastructure (dispatch-framework/ subdirectory migration, coordination server stack, now-playing widget, mobile-responsive dashboard, voice subsystem hardening).

### Added

- **dispatch-framework/ subdirectory layout.** All framework internals (personas, hooks, scripts, dashboard, docs, templates, examples, commercials, persona-wizard, data, state, styles) moved under `dispatch-framework/`. Top-level reserved for README, LICENSE, CHANGELOG, CLAUDE.md, CONTRIBUTING, install scripts, and Steamworks packaging. Documented in CLAUDE.md.
- **Coordination server stack** (`dispatch-framework/coordination/`). Pure-stdlib Python HTTP server on port 3047 with REST + SSE routes for inter-agent coordination: `/todo/complete`, `/todo/add`, `/resource/claim`, `/resource/release`, `/announce`, `/lesson`, `/state.json`, `/events`. Hook clients for announce, complete, resource, lesson. Dashboard UI at `/`. Persistent state in `coord-state.json` (gitignored runtime).
- **Now-playing widget** (`dispatch-framework/dashboard/widget.html` + `audio-feed-page.cjs`). Browser-embeddable widget showing the currently-playing Kokoro TTS clip with skip/pause/back controls. Backed by `kokoro_queue.py` signal files.
- **Mobile-responsive dashboard.** `shell.css`, `lessons.css`, `patterns.css` 768px breakpoints: nav rail collapses to bottom tab strip, single-column layout, 44px touch targets on all interactive elements, heatmap matrices scroll horizontally on narrow viewports.
- **Voice subsystem hardening.** Priority queue (`kokoro_queue.py`) with P0 lane, spillover queue, retry-on-failure, and atomic-mkdir drainer mutex. UUID-priority session keying in `set-voice.py` prevents parallel-session voice config clobbering. Callsign prepending in `kokoro-speak.py` and `kokoro-generate-mp3.py` announces every voice with its persona name before synthesis.
- **Internal lessons-learned playbooks** (`dispatch-framework/lessons-learned/`). Regression-troubleshooting and video-production checklists captured from real incidents.

### Changed

- **`hook-announce.py` UTF-8 stdio fix.** Adds `sys.stdout.reconfigure(encoding='utf-8')` and same for stderr so the Unicode arrow in `[announce] <from> → <to>: <text>` doesn't crash under Windows' default cp1252 codec when callers don't set PYTHONIOENCODING.
- **`personas.json` roster** — full roster minus `test1` (pipeline-validation persona removed per operator intent; matching VOICE_MAP cleanup in `set-voice.py`, `kokoro-generate-mp3.py`, `kokoro-summary.py`).
- **`.gitignore`** — narrowed coordination/ pattern from generic to specific (only `coord-state.json` runtime ignored, server code itself tracked). Added runtime ignores for `tts-output/`, `state/*.bak-*`, `state/backups/`, `state/migrations/`, `server.log`, `dispatch-agent.log`, stray PowerShell `$logFile` artifacts.

### Migration notes

- Local main had drifted 14 commits ahead and 61 commits behind origin/main. The reset-and-replay strategy was: hard-reset local main to origin/main, then bring back local-only operational features (coordination/, hooks/, mobile CSS, now-playing widget, lessons-learned/) as a single coherent integration commit. The 13 individual local commits are preserved on the `wip/pre-reset-main` branch for archaeology.
- Version went from local-claimed v0.7.4 (never tagged on origin) to v0.7.7 to reflect actual feature count since v0.7.3: 4 origin features (correction tracking + Internal Affairs, gamepad bindings, gamepad tutorial, screenshots) plus the local integration commit.

## [0.7.3-prerelease] - 2026-05-13

Previously documented under [Unreleased] before the v0.7.7 integration. Content rolled forward as-is:

### Added

- **Correction tracking pipeline.** Workspace-wide system that watches every Claude Code session for mistake-acknowledgement language and pipes detected events through a validation → interview → resolution flow. Components: (1) a global `Stop` hook (`~/.claude/hooks/correction-detector.py`, installed outside this repo) that regex-scans the assistant's just-completed response for HIGH/MEDIUM confidence acknowledgement phrases and appends to `F:\corrections\corrections.jsonl`; (2) a new **Internal Affairs** persona (`personas/INTERNAL_AFFAIRS_AGENT.md`, color `#64748B`, slate) that walks the operator through pending entries to validate, categorize (knowledge/attention/process/tool-misuse/context-stale/instruction-conflict), and assign severity; (3) `scripts/interview-agent.py` — hourly cron that asks the originating persona "what have you actually changed since" for each operator-validated entry, parses STATUS/EVIDENCE/NOTES output, appends to `fix_attempts[]`, auto-closes on STRONG evidence; (4) `scripts/correction-cron-install.ps1` — Windows Scheduled Task installer with `-Backend claude-code|local` switch (local uses Ollama, default uses Claude Code with grep/read tool access). Trigger semantics are agent-acknowledgement-driven, not user-pushback-driven — the agent owning the mistake is the truth signal. Full docs at `docs/CORRECTION_TRACKING.md`.
- **Gamepad rebinding for Steam Deck handheld use.** The Web Gamepad input layer in `dashboard/scripts/launcher-gamepad.js` now emits three new high-level events: `multideck:gamepad:mic` on X press (toggles STT, supersedes the old L1-hold push-to-talk), `multideck:gamepad:tab-next` on R1 and `multideck:gamepad:tab-prev` on L1 (cycles through active terminal sessions like a tab strip), and `multideck:gamepad:voice-answer` on L2 (modal-context voice answer; see below). Standard mapping per Web Gamepad API spec; binding rationale and event table documented at the top of `launcher-gamepad.js`. X retains its `option { index: 2 }` emission for glyph-modal option picks; the STT mic listener checks `#question-modal` visibility and bails when the modal is open, so X-as-option-2 still works inside a question.
- **L2 voice-answer in glyph modal.** Inside the glyph picker, pressing L2 captures one mic burst via `MultideckSTT.captureOnce()`, transcribes via the existing `/stt/transcribe` route, and submits the result as the answer to the current question. Useful for open-ended prompts where none of A/B/X/Y is the right pick, or when the operator can speak the answer faster than they can read. Tag in the modal header flips to `LISTENING` while capture is active. Auto-cuts at 6 seconds to keep the operator unblocked.
- **Glyph response audit log.** The `/questions/:sessionId/answer` POST handler now appends a one-line JSONL record (`{ts, sessionId, answers}`) to `state/glyph-responses.jsonl` alongside writing the per-session `<sessionId>.answer.json` file. Operator can `tail -f` the log to review every glyph-modal answer chronologically. Log append failures don't fail the answer write.
- **First-run gamepad walkthrough popup** (`dashboard/scripts/launcher-tutorial.js`). Intentionally low-tech coachmark in the bottom-center of the launcher: bordered cyberpunk frame, pulsing glyph indicator, single line per step. Walks through X=mic, R1=tab-next, L1=tab-prev, plus advisory cards for A/B/X/Y in glyph modal and L2 voice-answer. Each step advances by actually pressing the indicated button, so the operator learns by doing on the real binding (pressing X starts the real mic, R1 cycles real terminals, etc.). Skip with B or Y at any time. Fires once per `localStorage` key `multideck.tutorial.v1.seen`. Re-trigger anytime via the new `[ ? ]` button in the terminal header, by appending `?tutorial=1` to the launcher URL, or by clearing the localStorage key. Bump the key version in `launcher-tutorial.js` when bindings change to re-trigger for returning operators.

### Changed

- **PTT removed.** The prior L1-hold push-to-talk semantics are gone. L1 is now `tab-prev`. Mic is X (toggle).
- **Terminal cycle-via-bumpers wiring.** `window.MultideckTerminal.cycleSession(dir)` cycles forward (+1) or back (-1) through `terminalSessions` keys with wraparound. R1/L1 listeners gate on (a) terminal panel must be open and not minimized, (b) glyph modal must not be visible, (c) at least 2 sessions exist; otherwise the press silently no-ops so it doesn't fight the modal A/B/X/Y picker or steal focus from a single session.
- **Mic button tooltip updated.** `[ ◉ MIC ]` button title changed from "Push-to-talk (L1 on gamepad)" to "Press X (gamepad) or click to toggle mic" to reflect the new binding.

## [0.7.3] - 2026-05-13

Driven by real handheld testing on a docked Steam Deck. Big Picture / Gaming Mode launch was failing several distinct ways; the kiosk Chromium crashed on missing display/auth env; touch targets and terminal font were unreadable at arm's length; the Kokoro TTS pipeline silently failed on Linux. Each ships as its own commit; together they make the Steam Deck path actually usable.

### Added

- **Deck-mode prompt constraint (10-line output cap).** When the launcher fires from the Steam Deck handheld kiosk, persona output now lands under a 10-line cap so it fits the visible reading area at the 28px xterm font. Wired via `scripts/steamdeck-launcher.sh` appending `?deck=1` to the kiosk URL, `dashboard/scripts/launcher-select.js` reading the URL param and posting `deckMode:true`, `dashboard/server.cjs` appending a `DECK_CONSTRAINT` suffix to the effective prompt. Applies to all runtimes (claude, opencode, vs) and stacks on top of the runtime-specific deploy_string.

### Changed

- **Steam Deck touch targets bumped for finger handheld use.** Prior 44px button min-height was about 1/3 too small in real-world handheld testing. In the `@media (max-width: 1280px) and (max-height: 800px)` block: mic/NEW/MIN buttons 56px min-height with 16px font (was 44px / 11px); tab close 40px wide (was 28px).
- **Terminal xterm font doubled on Deck (14px → 28px).** Set in JS, not CSS — xterm.js canvas renderer ignores CSS `font-size`, so the prior CSS-only approach caused cells to render at 28px while xterm still reported 80 cols to the PTY, making claude wrap mid-screen. Now `Terminal({ fontSize: window.matchMedia('(max-width: 1280px) and (max-height: 800px)').matches ? 28 : 14 })`.
- **Matrix rain panel halved (660px → 330px).** Recovers ~330px of horizontal real estate for the terminal panel.
- **Terminal panel full viewport height (62vh → 100vh).** Claude session now takes the whole screen when open.
- **Matrix rain watermarks capped at 4 portraits.** Above 4 the tiled portraits overlapped. `setImages()` keeps the most recent 4.

### Fixed

- **`steamdeck-launcher.sh` lifecycle and Big Picture compat.** Three bugs prevented launching from Big Picture / Gaming Mode: `trap stop_dashboard EXIT` killed the dashboard whenever the script ended; the script always spawned a fresh dashboard, colliding with the v0.7.1+ systemd-user service; Chromium was run via plain command instead of `exec`, so Steam saw "game ended" while a half-attached Chromium was still launching. Rewrite now probes for existing dashboard and reuses it; spawns with `setsid nohup` + `< /dev/null`; strips Steam's 32-bit `LD_PRELOAD` overlay; and `exec`s Chromium.
- **Steam-launched Chromium dying with "Missing X server or $DISPLAY".** Steam Big Picture / Gaming Mode launches non-Steam shortcuts with a stripped environment that often lacks `DISPLAY` and `XAUTHORITY`. Symptom was "launcher flashes for a second then nothing." Now both `steamdeck-launcher.sh` and `steamdeck-dashboard.sh` default `DISPLAY=:0` and autodetect `XAUTHORITY` from `/run/pressure-vessel/Xauthority` (Gaming Mode), `/run/user/$(id -u)/xauth_*` (Desktop Mode SDDM), or `~/.Xauthority`.
- **Gamescope `XAUTHORITY` not visible inside distrobox container.** Gaming Mode's auth file lives at `/run/pressure-vessel/Xauthority` inside the Steam Linux Runtime sandbox, which isn't bind-mounted into our `multideck-box`. The launcher now copies `XAUTHORITY` to `/tmp/multideck-xauth` and re-exports it before exec'ing the container chromium.
- **Bulletproof launcher logging.** Removed prior `set -euo pipefail` which caused silent exits before logging when an env var was unset. Every launcher invocation now records DISPLAY, XAUTHORITY, WAYLAND_DISPLAY, GAMESCOPE_WAYLAND_DISPLAY, XDG_RUNTIME_DIR, and argv to `~/.cache/multideck/launcher.log`.
- **STT 503 when `DISPATCH_WHISPER_REMOTE` is set but local whisper missing (v0.7.2 regression).** Route now gates local-file checks on `!remoteSet`. When the remote backend itself fails, returns 502 with the remote URL in the body instead of crashing `spawn(undefined)` on the whisper-cli fallback.
- **`kokoro-speak.py` failing on Linux with "creationflags is only supported on Windows platforms".** Three subprocess.run sites had hardcoded `CREATE_NO_WINDOW = 0x08000000` without the `os.name == 'nt'` guard that `kokoro_queue.py` uses correctly. Now guarded at all three sites (lines 46, 209, 262). Verified end-to-end on Steam Deck: pipeline generated MP3, autoplay picked it up, ffplay played through speakers.

### Operator setup note (Deck)

Misaki (Kokoro's grapheme-to-phoneme engine) auto-downloads `en_core_web_sm` at first run via `spacy.cli.download` → `uv pip install`. If the Kokoro venv was created with `uv venv` (no pip installed) AND uv doesn't recognize it as uv-managed, the auto-install fails. `install-steamdeck.sh` will be updated in a follow-up to pre-install this. Manual workaround:
```bash
uv pip install --python "$DISPATCH_KOKORO_VENV/bin/python" \
  https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
```

## [0.7.2] - 2026-05-13

### Added

- **Remote STT backend (`DISPATCH_WHISPER_REMOTE`)** — set this env var to a `whisper-server` URL on another machine (typically a GPU desktop on the same Tailscale network) and the deck dashboard forwards every `/stt/transcribe` request there instead of running whisper locally. Lets the deck run as a thin client for STT while using a 4090 (or any GPU box) for the actual transcription. Falls back to local warm `whisper-server` when unset. New `/stt/status` field `mode` reports `remote` / `local-warm` / `local-fallback`. Documented in `docs/REMOTE_STT.md` with Windows and Linux server setup.
- **STT dictionary biasing (`~/.config/multideck/dictionary.txt`)** — one term per line; the dashboard reads it on each `/stt/transcribe` call and passes it as whisper's `prompt` parameter so the model biases decoding toward your acronyms, project names, and proper nouns. Soft bias (not hard), capped at whisper's ~224-token prompt limit. Template at `templates/dictionary.txt`. Loaded state visible in `/stt/status` (`dictionaryLoaded`, `dictionaryTerms`).

## [0.7.1] - 2026-05-13

### Added

- **Warm `whisper-server` for STT (`dashboard/server.cjs`)** — `whisper.cpp` ships a long-running HTTP server binary alongside `whisper-cli`. The dashboard now lazy-spawns it on first `/stt/transcribe` request, keeps the 150 MB `base.en` model resident in RAM, and routes subsequent transcriptions over local HTTP at `POST /inference`. Eliminates the per-request model mmap penalty that made `base.en` run roughly one second per word on Steam Deck (Zen 2) when other processes evicted model pages between calls. Measured on deck: 16.5 s cold drops to 1.07 s warm for a 1.5 s input, 15x speedup. Falls back to `whisper-cli` if the server binary is missing. Disable with `DISPATCH_WHISPER_WARM=0`. Override port with `DISPATCH_WHISPER_PORT` (default 8780). Diagnostic at `GET /stt/status`. Readiness is detected by TCP port-probe since `whisper-server` binds silently.
- **Terminal width sync** — `dashboard/scripts/launcher-terminal.js` now passes the live xterm `cols` and `rows` as query params on the `/terminal/ws` WebSocket connection, and `dashboard/server.cjs` sets `COLUMNS` and `LINES` env vars plus runs `stty cols rows` inside the PTY before exec'ing `claude`. Long lines now wrap to the visible width of the launcher's terminal panel instead of running off the right edge.
- **Bundled Node 22 in Steamworks tarball** — `packaging/steamworks/build-tarball.sh` now downloads pinned Node 22.11.0 Linux x64 from nodejs.org/dist and stages `bin/node` inside the depot. The `bin/multideck` entry script prefers the bundled Node over system Node so depot-installed users never depend on host Node availability. Skip with `--skip-node` for faster dev builds.

## [0.7.0] - 2026-05-13

### Added

- **`scripts/install-linux-generic.sh`** — non-SteamOS Linux installer (phase 1.5). Mirrors `install-steamdeck.sh` structure but installs runtimes directly to the host instead of into a distrobox container. Pulls Claude Code into `~/.npm-global`, builds Kokoro venv at `${XDG_DATA_HOME}/multideck/kokoro-venv/`, builds whisper.cpp at `${XDG_DATA_HOME}/multideck/whisper/`, wires the AskUserQuestion hook, writes XDG-pathed env file and desktop entry. Tested on Arch + Ubuntu 22.04. Invoked via `install-multideck.sh --target linux-generic`.
- **`packaging/steamworks/`** — phase 2 Steamworks depot scaffolding. `build-tarball.sh` produces a self-contained `multideck-<version>-linux-x64.tar.zst` with bundled whisper-cli, Kokoro venv (CPU torch), and `bin/multideck` entry point that runs first-launch verify then spawns the dashboard + chromium app-mode. `depot.vdf.template` + `app_build.vdf.template` for steamcmd upload. `stage-steamworks-build.sh` extracts a built tarball into the layout steamcmd expects and validates .vdf files have been populated. `README.md` documents the publish path; phase 2.5 closes it once a Steamworks Partner account exists.
- **`scripts/install-multideck.sh`** — universal installer wrapping the per-target install scripts. Auto-detects SteamOS / generic Linux / WSL. Single `pkexec` graphical prompt up front for the privileged setup step (replacing the prior pattern of multiple `sudo -v` calls scattered across the install). Built-in `--verify` self-test, `--quiet` mode for CI/Steam Runtime, `--uninstall` flow (with `--purge` for state). Progress UI shows per-step `[N/12]` counters. Rollback journal at `${XDG_STATE_HOME}/multideck/install-journal` for post-mortem on failed installs.
- **`scripts/install-pkexec-helper.sh`** — privileged helper invoked exactly once via pkexec by `install-multideck.sh`. Does only the work that genuinely needs root (steamos-readonly toggle, distrobox+podman pacman install, generic Linux apt/dnf/pacman runtime packages). Never returns to the user shell with elevated privileges. Single audit point for everything the installer touches as root.
- **`docs/DEPLOYMENT.md`** — deployment architecture covering all three distribution channels (Steamworks depot, standalone installer, Flathub Flatpak), the install pipeline shared across them, the sudo elevation pattern, state separation, update strategy, and verify/self-test contract. Foundation for the v0.7 Steam Store-quality install.
- **`docs/INSTALL.md`** — user-facing install guide. Steam Deck, generic Linux, Windows, and WSL paths each with prerequisites, install command, verify step, troubleshooting quick triage table, and privacy notes. Targets readers who just bought MultiDeck and want it running in 20 minutes.

### Changed

- **Audio autoplay now lives inside the dashboard server.** The standalone `scripts/multideck-audio-daemon.sh` + `scripts/multideck-audio.service` systemd user unit (added in the prior unreleased section) have been removed. `dashboard/server.cjs` now spawns `ffplay` as a child process when new MP3s land in `TTS_OUTPUT_DIR`, polled every 2 s. One process tree, one log file, shared lifecycle with the server. Disable with `DISPATCH_AUDIO_AUTOPLAY=0`. Override player with `DISPATCH_AUDIO_PLAYER=mpv`. Diagnostic endpoint at `GET /audio-feed/status`. Rationale: systemd-user services do not survive distrobox or Flatpak boundaries, get reaped by `KillUserProcesses=yes` on SteamOS, and added a second process to monitor for no real benefit.
- **`install-steamdeck.sh` removes the legacy audio service** if present from a pre-v0.7 install (`cleanup_legacy_audio_daemon` step replaces `ensure_audio_daemon`). Existing installs auto-migrate on next re-run.

### Removed

- **`scripts/multideck-audio-daemon.sh`** and **`scripts/multideck-audio.service`** — superseded by the in-server autoplay manager (see `dashboard/server.cjs:startAudioAutoplay`). The previous unreleased entries that added these files are rolled into the v0.7 audio architecture.

### Fixed (carried from prior unreleased)

- **Browser-terminal spawn on Linux** — `dashboard/server.cjs` was using BSD `script` syntax (`script -q /dev/null -c '...'`) which fails on util-linux with "unexpected number of arguments". Patched both spawn branches to use the util-linux form (`script -q -c '...' /dev/null`).
- **`claude` not found in non-interactive shells** on the Steam Deck install. Fixed by symlinking `$HOME/.npm-global/bin/claude` into `/usr/local/bin/claude` inside the container during `ensure_claude_code`.

### Added (carried from prior unreleased)

- **Windowed dashboard shortcut (`scripts/steamdeck-dashboard.sh` + `multideck-dashboard.desktop`)** — second Non-Steam Game entry that opens the dashboard in Chromium app-mode (NOT kiosk) pointed at `/`. `install-steamdeck.sh` `write_desktop_entry` now writes both `.desktop` files.
- **`docs/STEAMDECK_SETUP.md`** documents the two-shortcut model.

- **Steam Deck support** — `scripts/install-steamdeck.sh` and `scripts/steamdeck-launcher.sh` install MultiDeck into a distrobox Arch container so SteamOS's read-only root is never touched. The launcher script opens the dashboard in Chromium kiosk mode (`--kiosk --app=URL` with isolated `--user-data-dir`, `--use-fake-ui-for-media-stream` for STT mic, `--disable-pinch` and `--overscroll-history-navigation=0` for touchscreen), suitable for adding to Steam as a Non-Steam Game shortcut. Pinned Kokoro versions match `install-wsl-kokoro-venv.sh`. Idempotent; supports `--force`, `--verify`, and `--overlay <zip>` for layering personal personas/state over the clean clone.
- **`docs/STEAMDECK_SETUP.md`** — install walkthrough, Steam shortcut setup, personal-content overlay protocol, troubleshooting for audio routing, port conflicts, post-SteamOS-update container recovery, a Gaming Mode integration note, a Controls table mapping gamepad input to launcher actions, and a Voice Input (STT) section.
- **Local STT via whisper.cpp** — `install-steamdeck.sh` builds `whisper.cpp` (pinned `v1.7.4`) inside the distrobox container with the `base.en` model and writes `DISPATCH_WHISPER_BIN` + `DISPATCH_WHISPER_MODEL` into the env file. New `POST /stt/transcribe` route on the dashboard accepts a raw audio body (typically `audio/webm;opus` from `MediaRecorder`), transcodes via ffmpeg, and runs whisper.cpp to return `{text}`.
- **Push-to-talk mic in the terminal panel** — `dashboard/scripts/launcher-stt.js` plus the new `[ ◉ MIC ]` button in the terminal header. Click to toggle, or hold gamepad L1 for push-to-talk. Transcribed text is injected into the active xterm.js session as if typed.
- **Web Gamepad API input layer** — `dashboard/scripts/launcher-gamepad.js` polls `navigator.getGamepads()` at 60 Hz and dispatches high-level `multideck:gamepad:*` `CustomEvent`s (`nav`, `accept`, `cancel`, `option`, `shoulder`, `ptt-down`, `ptt-up`). Standard mapping; dpad and left stick both emit `nav`; A/B/X/Y emit `option` with index 0–3. PTT latches L1.
- **AskUserQuestion → glyph modal bridge** — a PreToolUse Claude Code hook at `hooks/dashboard-question-bridge.py` intercepts `AskUserQuestion` tool calls. It writes the question payload to `$DISPATCH_STATE_DIR/pending-questions/<session_id>.json`, polls 200 ms for the answer file (60 s timeout), and returns `permissionDecision=allow` with the operator's answers so Claude never renders its native CLI prompt. On timeout it returns `deny` with a graceful message. The dashboard's new `GET /events/questions` SSE channel notifies any subscribed browser tab; the new `POST /questions/:sessionId/answer` route closes the loop. `dashboard/scripts/launcher-question-modal.js` renders a glyph-mapped modal (A/B/X/Y → option 0/1/2/3 with green/red/blue/yellow glyphs) that walks multi-question payloads, supports multiSelect via R1 confirm, and falls back gracefully to mouse/keyboard for desktop.
- **Steam Deck CSS pass** — new `@media (max-width: 1280px) and (max-height: 800px)` block in `dashboard/styles/launcher.css` bumps touch targets to ≥44 px, enlarges the terminal font to 16 px for arm's-length reading, and tunes modal padding for the 7" panel.
- **Installer auto-wires the hook** — `ensure_claude_hook` step in `install-steamdeck.sh` idempotently merges a PreToolUse matcher for `AskUserQuestion` into `~/.claude/settings.json` so the bridge runs out-of-the-box after install.

---

## [0.6.0] - 2026-05-11

### Added

- **Browser transport** (`BROWSER`) — fourth launcher transport opens a live Claude session inside the browser. No terminal emulator required. WebSocket bridges browser xterm.js to a host pseudo-TTY spawned via `bash -lc 'script -q /dev/null -c "claude ..."'` on Linux or `wsl.exe -d Ubuntu` on Windows. `dashboard/server.cjs` adds the `WebSocketServer` and the `/terminal/ws` upgrade handler; `dashboard/package.json` declares the `ws` runtime dependency.
- **Multi-session tab management** — spawn arbitrary number of agents, each gets a tab in the terminal panel header with an independent close. `[ + NEW ]` returns to character select while keeping all sessions alive. `[ − MIN ]` hides the panel; a restore tab shows `[ ◈ N TERMINALS ACTIVE ]`.
- **Matrix rain panel** — animated character stream beside each terminal, composites all active persona accent colors, persona portraits tile as watermarks. Density scales with session count.
- **Terminal color theming** — xterm foreground, cursor, and ANSI color slots set to the persona's accent color at session init. The "SECURE CHANNEL ESTABLISHED" banner uses ANSI true-color (`\x1b[38;2;R;G;Bm`).
- **Persona Builder** (`persona-wizard/`) — interactive CLI plus dashboard UI for authoring new personas. `persona-wizard/scripts/persona-wizard.py` walks through callsign, color, voice, scope, and writes the agent markdown and personas.json entry.
- **Dashboard route consolidation** — live job board, terminal persistence across reloads, audio products routing, builder.html surface. `dashboard/server.cjs` is the single entry point for all routes; `dashboard/builder.html` provides the persona builder UI in-browser.
- **`docs/BROWSER_TERMINAL.md`** — transport overview, multi-session tab semantics, matrix rain density formula, Tailscale remote access setup.
- **Modular launcher** — `dashboard/launcher.html` split into seven JS modules under `dashboard/scripts/` and `dashboard/styles/launcher.css`. Load order preserves all cross-module function calls (globals, no ES module circular-dep risk).
- **`deploy_string` / `local_deploy_string` / `vs_deploy_string`** fields on every persona in `personas/personas.json` — per-runtime activation prompts that the launcher sends to the spawned session.

### Fixed

- Radar view crash when a job has `null` `assigned_to`.
- `dashboard/scripts/meeting.js` attendees field must be an array, guards every call site with `Array.isArray`.
- `DISPATCH_STATE_DIR` is now trimmed to strip trailing whitespace from the env var value.
- `dashboard/scripts/app.js` syntax error in job board view; `dashboard/data/live.js` normalize fallthrough on incomplete records.

### Changed

- Dashboard server listens on `0.0.0.0:3046` (configurable via `DISPATCH_PORT`) so any device on your Tailscale network can open the launcher. The spawned `claude` process always runs on the host where the dashboard runs.

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
