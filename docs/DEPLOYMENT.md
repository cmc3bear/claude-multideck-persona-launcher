# MultiDeck Deployment Architecture

This doc covers how MultiDeck is packaged and distributed. If you just want to install it, read `docs/INSTALL.md` instead.

---

## Distribution targets

MultiDeck supports three distribution channels, in priority order:

| Channel | Format | Audience | Status |
|---|---|---|---|
| **Steamworks depot** | Native Linux tarball, no extra runtime | Steam Deck owners, Steam Store buyers | Phase 2 (in progress) |
| **Standalone installer** | `install-multideck.sh` + git clone | Devs, advanced users, CI | Phase 1 (shipped) |
| **Flathub Flatpak** | `org.multideck.MultiDeck` | Linux desktop users outside Steam | Phase 3 (planned) |

The three channels share one source tree and one underlying install pipeline. The differences are wrapping format, not behavior.

### Why Steamworks instead of Flatpak for Steam Store

Steam Store does not accept Flatpaks. Steamworks distributes via depots that get extracted into the user's Steam library, then launched inside Steam's own runtime container (Steam Linux Runtime 3.0 "sniper"). That container is Valve's equivalent of Flatpak's sandbox. Trying to ship a Flatpak through Steam means double-containerization, which Valve does not support.

Flatpak remains the right path for Flathub (the Linux app store), which is a separate distribution channel.

---

## Source layout (after deployment refactor)

```
multideck/
  dashboard/                    Node HTTP server, launcher HTML, audio feed
    server.cjs                  Main server (now includes audio child-process manager)
    launcher.html               Cyberpunk launcher UI
    audio-feed-page.cjs         Browser-side audio feed renderer
  personas/                     Persona registry + agent markdown
  hooks/                        Kokoro TTS hooks, voice config
  scripts/
    install-multideck.sh        Universal installer (calls platform-specific subscript)
    install-steamdeck.sh        Steam Deck SteamOS install (uses distrobox)
    install-linux-generic.sh    Generic Linux install (assumes writable /usr)
    install-pkexec-helper.sh    Privileged step invoked once via polkit
    steamdeck-launcher.sh       Launches dashboard + Chromium kiosk
    steamdeck-dashboard.sh      Launches dashboard windowed (alt shortcut)
  packaging/
    steamworks/                 Phase 2: tarball builder + depot manifest
      build-tarball.sh
      depot.vdf.template
      app_build.vdf.template
      README.md
    flatpak/                    Phase 3: Flathub manifest
      org.multideck.MultiDeck.yml
      README.md
  docs/
    INSTALL.md                  User-facing install guide
    DEPLOYMENT.md               This doc
    UPGRADE.md                  How to upgrade an existing install
    TROUBLESHOOTING.md          Common failures and recovery
    STEAMDECK_SETUP.md          Steam Deck-specific notes (legacy, being absorbed)
```

---

## Install pipeline (shared across channels)

Every channel runs the same 9 steps under the hood. The wrapping format determines where files land, but the steps are identical:

1. **Pre-flight checks.** Disk space (10 GB), internet reachable, OS version supported, user not running as root, sudo password set.
2. **Container engine** (Steam Deck only). Install distrobox + podman via pacman if missing. Wraps `steamos-readonly disable/enable` around the pacman call.
3. **Runtime container** (Steam Deck only). Create Arch toolbox container `multideck-box` with bind-mounted `$HOME`.
4. **Runtime packages.** Node 22, Python 3.12, ffmpeg, jq, git, curl, chromium (or Chrome flatpak).
5. **Claude Code CLI.** `npm install -g @anthropic-ai/claude-code` to user-scope npm prefix, symlink to `/usr/local/bin/claude`.
6. **Kokoro TTS venv.** Python venv at `$XDG_DATA_HOME/multideck/kokoro-venv/` with pinned versions (kokoro 0.9.4, torch 2.11.0 CPU, soundfile 0.13.1, numpy 2.4.4, misaki 0.9.4, espeakng-loader 0.2.4).
7. **whisper.cpp.** Clone v1.7.4, build CPU-only, download `ggml-base.en.bin`. Output: `$XDG_DATA_HOME/multideck/whisper/build/bin/whisper-cli`.
8. **Claude Code hook.** Wire the `dashboard-question-bridge.py` PreToolUse hook into `~/.claude/settings.json` so AskUserQuestion routes through the launcher's glyph modal.
9. **Environment file + desktop entries.** Write `~/.config/multideck/env`, generate `.desktop` files for launcher + dashboard. On Steam Deck, also create `~/.local/share/applications/multideck-*.desktop` so Steam's "Add a Non-Steam Game" can find them.

State paths follow XDG: `$XDG_DATA_HOME/multideck/`, `$XDG_CONFIG_HOME/multideck/`, `$XDG_CACHE_HOME/multideck/`. The legacy hardcoded `~/.dispatch-*` paths are deprecated and aliased for backwards compat.

---

## Sudo elevation pattern (Steam Store quality)

Old installer: prompts for sudo multiple times via `sudo -v`. Annoying, breaks on systems without password sudo configured.

New installer: **one polkit prompt up front via pkexec**.

```
scripts/install-multideck.sh
  ├─ runs as user
  ├─ pre-flight checks
  ├─ if any privileged ops needed:
  │   pkexec /path/to/install-pkexec-helper.sh
  │   └─ runs as root, single graphical prompt
  │      - steamos-readonly disable
  │      - pacman -Sy ... distrobox podman fuse-overlayfs
  │      - steamos-readonly enable
  │      - chmod +s on claude symlink, if needed
  └─ everything else runs as user (container creation, npm, pip, etc.)
```

The privileged helper does exactly the work that needs root: package installs, readonly toggle, symlink to `/usr/local/bin`. Nothing else. The main installer is non-privileged and reads the helper's exit code.

This pattern matches what Steam itself does (one polkit prompt on first install for the udev rules), what Flatpak does (single prompt for system-wide installs), and what Steam Deck users expect.

---

## Audio feed: no separate daemon

**Old design:** standalone `multideck-audio-daemon.sh` polled `/audio-feed/list` and shelled out to `ffplay`. Installed as a systemd user service.

**Problems:**
- Systemd user services don't survive distrobox or Flatpak boundaries.
- `KillUserProcesses=yes` on SteamOS reaps it on SSH disconnect.
- Two processes to start/stop/monitor/troubleshoot.

**New design (phase 1):** the audio feed runs as a child process inside `dashboard/server.cjs`. The server already knows when MP3s are produced (it serves the feed list), so it spawns `ffplay -nodisp -autoexit` directly when a new file appears. One process tree, one log file, dies when the dashboard dies.

Disable with `DISPATCH_AUDIO_AUTOPLAY=0`. Override player with `DISPATCH_AUDIO_PLAYER=mpv` or similar.

---

## Update strategy

Per channel:

| Channel | Update mechanism |
|---|---|
| Standalone | `git pull && scripts/install-multideck.sh` (idempotent, only re-runs steps with drift) |
| Steamworks | Steam client auto-updates the depot. Launch script re-runs install pipeline in verify mode on every boot, fixes drift. |
| Flatpak | `flatpak update` |

Across all three, state in `$XDG_DATA_HOME/multideck/` is preserved. Only the install root is replaced.

---

## State separation (install root vs user state)

| Path | Owned by | Backed up | Survives uninstall |
|---|---|---|---|
| `<install-root>/` | The installer | No (re-fetch) | No |
| `$XDG_DATA_HOME/multideck/` | The user | Yes (transcripts, voices, jobs) | Yes |
| `$XDG_CONFIG_HOME/multideck/` | The user | Yes (env, preferences) | Yes |
| `$XDG_CACHE_HOME/multideck/` | The user | No (logs, profiles, audio-seen.txt) | Yes |
| `~/.claude/` | Claude Code | Yes (auth, settings) | Yes |

The installer never touches state directories except to create them. Uninstall removes the install root and optionally the cache; user state is opt-in to delete.

---

## Verification (post-install self-test)

`install-multideck.sh --verify` runs a non-mutating health check and exits nonzero on drift. The check covers:

- Distrobox container exists and is reachable
- `claude`, `node`, `ffplay`, `chromium`, `whisper-cli` resolvable
- Kokoro venv versions match pins
- whisper.cpp model file present and not corrupted
- Dashboard HTTP server responds on `$DISPATCH_PORT`
- `/audio-feed/list` endpoint returns 200
- `/stt/transcribe` accepts POST and runs whisper end-to-end on a built-in 1-second test clip
- Audio output works (plays a 1-second sine tone via ffplay)
- Mic input accessible (lists `pactl list short sources` for at least one source)
- `~/.claude/settings.json` has the AskUserQuestion hook wired

Pass/fail counts emitted as TAP output for CI. Steam launch script invokes `--verify --quiet` on every boot to self-repair drift.

---

## Steamworks depot specifics (phase 2)

The Steamworks build pipeline produces `multideck-linux-x64.tar.zst` containing:

```
multideck-<version>/
  bin/
    multideck            launcher entry point (calls scripts/steamdeck-launcher.sh)
    node                 bundled Node 22 (statically linked or with runtime deps from Steam Linux Runtime)
  app/                   the multideck source tree (read-only)
  data/                  pre-built Kokoro venv (CPU-only torch wheels, no GPU stuff)
  models/
    whisper-base.en.bin
  whisper-cli            prebuilt for Steam Runtime 3.0 sniper container
  ffplay                 prebuilt ffmpeg/ffplay for sniper
  README.txt             pointer to in-game help URL
```

Depot manifest (`depot.vdf`):
- `LocalPath`: `multideck-<version>/`
- `DepotPath`: `.`
- `recursive`: 1

App build (`app_build.vdf`):
- App ID: TBD when Steamworks account is set up
- Launch option: `bin/multideck`
- OSList: `linux`
- Linux runtime: Steam Linux Runtime 3.0 (sniper)

First-boot script runs `install-multideck.sh --verify --quiet --steamworks-mode` to self-check inside the Steam Runtime container. Differences from standalone install: no pacman calls, no distrobox (everything is bundled), no sudo (Steam Runtime never requires it for app files), reads/writes only to Steam's depot path + XDG data home.

---

## Flathub Flatpak specifics (phase 3)

Manifest: `packaging/flatpak/org.multideck.MultiDeck.yml`

Key choices (per `docs/DEPLOYMENT_RESEARCH.md`):
- Runtime: `org.freedesktop.Platform//24.08`
- SDK: `org.freedesktop.Sdk//24.08` with `org.freedesktop.Sdk.Extension.node22`
- Base app: `org.electronjs.Electron2.BaseApp//24.08` for the Chromium shell
- Permissions: `--socket=pulseaudio` (audio in/out), `--talk-name=org.freedesktop.portal.Desktop`, `--share=network`, `--filesystem=xdg-data/multideck:create`

The Chromium shell becomes a tiny Electron app (`packaging/flatpak/electron-shell/`) that loads `http://127.0.0.1:3046/` after the Node server inside the sandbox starts. No system Chromium dependency.

---

## Roadmap

- [x] Phase 0: working Steam Deck install via `install-steamdeck.sh`
- [ ] Phase 1: polish installer (pkexec, atomic, rollback, --verify self-test), fold audio daemon into Node, write user-facing docs
- [ ] Phase 2: Steamworks tarball builder, depot/app manifest templates, Steam Runtime 3.0 compat testing
- [ ] Phase 3: Flathub Flatpak manifest, Electron shell, submit to Flathub

Phase 1 lands as v0.7. Phase 2 lands when there's a Steamworks partner account to test against. Phase 3 lands when there's user demand outside Steam.
