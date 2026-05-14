# MultiDeck on Steam Deck

Run MultiDeck natively on a Steam Deck. Claude Code, the dashboard, and Kokoro TTS all live inside a distrobox Arch container in your `$HOME`, so SteamOS's read-only root is never touched and the install survives OS updates.

This is the "operator station" deployment, the deck stands alone, no Windows PC required.

---

## OQE frame

**Objective.** A Steam Deck owner can clone the multideck repo, run one script, add it as a Non-Steam Game, and launch a full multideck deployment from Gaming Mode. The launcher runs in Chromium kiosk mode and supports voice input (Whisper) plus full gamepad navigation, including a glyph-button modal that intercepts Claude's AskUserQuestion prompts and routes them to the operator's controller.

**Qualitative.** Confidence MODERATE. Distrobox + Arch on SteamOS is a well-trodden path for dev tooling on the deck. Kokoro torch CPU inference on the Zen 2 cores is slower than a 4090 host (acceptable for single-utterance persona responses, slow for long summaries). Local Whisper transcription is sub-second for short utterances on the `base.en` model, several seconds for long ones. The gamepad + glyph-modal path depends on a PreToolUse Claude Code hook that has not been load-bearing on a Deck in production yet, hence MODERATE not STRONG until real-use evidence is filed.

**Evidence.** This document, the install script at `scripts/install-steamdeck.sh`, the launcher at `scripts/steamdeck-launcher.sh`, the PreToolUse hook at `hooks/dashboard-question-bridge.py`, the SSE + answer routes in `dashboard/server.cjs`, and the gamepad/STT/modal client modules under `dashboard/scripts/`. Upstream packages from `quay.io/toolbx/arch-toolbox` plus PyPI pinned versions match the operational venv described in the broader framework. `whisper.cpp` is pinned to `v1.7.4`.

---

## Prerequisites

1. **Steam Deck in Desktop Mode.** Press STEAM → Power → Switch to Desktop.
2. **Sudo password set.** Open Konsole and run `passwd` if you have not done this yet. Pick something you will remember.
3. **Internet.** Wi-Fi connected.
4. **Free space.** About 10 GB on `/home`. The container is ~500 MB, runtime packages ~1 GB, the Kokoro venv with torch is ~3 to 5 GB.
5. **Anthropic API account or Claude Code subscription.** You will run `claude login` inside the container on first use.

---

## Install

In Konsole on the deck:

```bash
git clone https://github.com/cmc3bear/claude-multideck-persona-launcher.git ~/multideck
cd ~/multideck
chmod +x scripts/install-steamdeck.sh scripts/steamdeck-launcher.sh
./scripts/install-steamdeck.sh
```

The script will:

1. Prompt for your sudo password to install `distrobox` and `podman` via pacman (one-time, with `steamos-readonly disable` and re-enable around it).
2. Pull the Arch toolbox image and create a container named `multideck-box`.
3. Install nodejs, npm, tmux, ffmpeg, python, git, chromium, jq inside the container. Chromium is used (not Firefox) because the dashboard relies on Web Speech, MediaRecorder, and Gamepad APIs which are most mature in Chromium.
4. Install the Claude Code CLI globally in the container's user-scope npm prefix.
5. Run `npm install` for `dashboard/` so the `ws` package powers the browser-terminal WebSocket.
6. Create the Kokoro venv at `~/.dispatch-kokoro-venv` with the same pinned package versions used by the Windows and WSL deployments.
7. Build `whisper.cpp` at `~/.dispatch-whisper/` for local mic-to-text. Pinned to a tagged release; CPU-only on Zen 2 cores.
8. Wire the PreToolUse `dashboard-question-bridge.py` hook into `~/.claude/settings.json` so Claude's `AskUserQuestion` prompts route to the dashboard glyph modal instead of the native CLI UI.
9. Write `~/.config/multideck/env` with the framework environment variables, including `DISPATCH_WHISPER_BIN` and `DISPATCH_WHISPER_MODEL`.
10. Generate `~/.local/share/applications/multideck.desktop`.

Re-run anytime, the script is idempotent. Pass `--verify` to fail loudly on drift, `--force` to rebuild the Kokoro venv, `--overlay path/to/overlay.zip` to layer personal content over the clean clone.

---

## First-time Claude Code auth

Inside the container:

```bash
distrobox enter multideck-box
claude login
exit
```

This caches your credentials at `~/.claude/` (which is shared between host and container because distrobox bind-mounts your home directory).

---

## Steam shortcuts

The installer generates **two** `.desktop` entries. Add either or both as Non-Steam Games.

### Option A — Kiosk launcher (`multideck.desktop`)

The cyberpunk character-select launcher in Chromium kiosk mode. What v0.7's Gaming Mode experience was designed around.

1. Desktop Mode → Steam → Games → Add a Non-Steam Game to My Library.
2. Browse to `~/.local/share/applications/multideck.desktop` (`.local` is hidden by default — you may need to type the path).
3. Confirm. Steam picks up the name "MultiDeck" and the icon.

### Option B — Windowed dashboard (`multideck-dashboard.desktop`)

Opens the dashboard in a normal Chromium window (no kiosk chrome stripped), pointed at `/`. Pairs with the **audio daemon** (below) so MP3 playback continues even when the dashboard window isn't focused or you switch into a real Steam game.

Same flow as Option A, but browse to `~/.local/share/applications/multideck-dashboard.desktop`.

### Audio daemon

`install-steamdeck.sh` also installs a systemd user service (`multideck-audio.service`) that runs `multideck-audio-daemon.sh` in the background. The daemon polls `/audio-feed/list` every 4 seconds and plays new MP3s via `ffplay` + PipeWire. It runs whether or not any dashboard window is open, and it auto-starts on every login.

Check it:
```bash
systemctl --user status multideck-audio
journalctl --user -u multideck-audio -f
```

Logs at `~/.cache/multideck/audio-daemon.log`. Files-seen list at `~/.cache/multideck/audio-seen.txt`.

After adding both shortcuts, switch back to Gaming Mode and both appear in your Non-Steam library.

---

## Personal content overlay

The public repo does not include your personal personas, your pinned project list, or your voice tensors. If you want those on the deck:

1. On your dev machine, zip the personal files preserving their relative paths inside the multideck root, for example:
   ```
   multideck-overlay.zip
   ├── personas/personas.json
   ├── state/projects-pinned.json
   └── hooks/voices/dm-voice.pt   (if you use a custom DM voice tensor)
   ```
2. Move the zip to the deck. USB drive, scp, Tailscale Drop, or syncthing all work. Park it at `~/Downloads/multideck-overlay.zip`.
3. Re-run the installer with the overlay flag:
   ```bash
   ./scripts/install-steamdeck.sh --overlay ~/Downloads/multideck-overlay.zip
   ```
   The script extracts the zip over the clone.

Treat the overlay as private. Do not commit it back to the public repo.

---

## Troubleshooting

### Voice input not transcribing

Press X (or click the mic button) to start recording, then press again to stop and transcribe. If nothing lands in the terminal, check in order:

1. **Mic permission.** Chromium kiosk runs with `--use-fake-ui-for-media-stream` so it auto-grants the request, but the OS-level mic mute toggle on the Deck overrides this. Press the Steam button → quick settings → Mic to confirm input is not muted.

2. **Whisper installed.** From inside the container, run `ls "$DISPATCH_WHISPER_BIN" "$DISPATCH_WHISPER_MODEL"` — both should resolve. If not, re-run `scripts/install-steamdeck.sh` (it is idempotent; `--force` rebuilds whisper from scratch).

3. **Dashboard log.** `tail -n 50 ~/.cache/multideck/dashboard.log` — STT errors print there with the failing ffmpeg or whisper stderr tail.

4. **Direct test.** `curl -X POST --data-binary @sample.webm -H 'Content-Type: audio/webm' http://localhost:3046/stt/transcribe` should return `{"text":"..."}`.

### Gamepad not responding in the launcher

Chromium needs at least one button press from a connected pad before the Gamepad API surfaces it to the page (browser security model). Mash A once after Gaming Mode opens the launcher, and subsequent navigation works.

If the pad is connected at the host level (Steam input is happy) but the launcher does not respond, open DevTools and check `navigator.getGamepads()` in the console. An empty array means Chromium has not picked up the device — disconnect and reconnect the controller from the Steam input pop-up.

### AskUserQuestion still shows the native CLI UI instead of the glyph modal

The PreToolUse hook is wired by the installer into `~/.claude/settings.json` inside the container. To verify:

```bash
distrobox enter multideck-box -- cat ~/.claude/settings.json | jq '.hooks.PreToolUse'
```

You should see a matcher entry for `AskUserQuestion` pointing at `python3 .../hooks/dashboard-question-bridge.py`. If not, re-run the installer.

Also confirm the dashboard is reachable: the hook writes a pending file to `$DISPATCH_STATE_DIR/pending-questions/`. Watch with `ls -la state/pending-questions/` while triggering a question. If the file appears but no modal opens, the browser SSE channel is the next thing to check (DevTools → Network → `/events/questions`).



### Audio does not play

The Kokoro hooks use `ffplay` for playback. Verify inside the container:

```bash
distrobox enter multideck-box
ffplay -version
echo "test" | ffplay -nodisp -autoexit -loglevel quiet -
```

If you hear nothing, check that PipeWire is forwarding from the container. The default distrobox setup shares the host's `/run/user/$UID/pulse` socket, which on SteamOS exposes the PipeWire-pulse shim. If that breaks, recreate the container with `--init-hooks "ln -sf /run/user/1000/pulse /tmp/pulse"`.

### Port 3046 already in use

Another process is on the port (rare on a stock deck but possible if you ran an earlier multideck version). Find it:

```bash
distrobox enter multideck-box -- ss -ltnp | grep 3046
```

Either kill that process or change the port:

```bash
sed -i 's/DISPATCH_PORT=.*/DISPATCH_PORT="3050"/' ~/.config/multideck/env
```

### Dashboard never comes up

Check the log:

```bash
tail -n 100 ~/.cache/multideck/dashboard.log
```

The most common cause is a missing dep inside the container. Re-run the installer to repair.

### Container is gone after a SteamOS update

SteamOS major updates wipe `/usr` and can take `distrobox` and `podman` with it (the container images and your `$HOME` are safe). Re-run `scripts/install-steamdeck.sh`, the script will only reinstall what is missing.

### Kokoro generation is painfully slow

Expected. Torch is CPU-only on the Zen 2 cores. Short persona responses (one to two sentences) are usable. Long-form `kokoro-summary.py` runs in real time or slower. If you need fast TTS on the deck, set up the dashboard in remote mode pointed at a host machine instead.

### "claude: command not found" inside the container

The npm global install puts `claude` in `~/.npm-global/bin`. Open a fresh shell in the container, or run:

```bash
distrobox enter multideck-box -- bash -lc 'export PATH=$HOME/.npm-global/bin:$PATH; claude --version'
```

The installer adds the PATH export to `~/.bashrc`, so new shells inside the box will pick it up.

---


## Browser terminal on the deck

The dashboard ships with a browser-terminal transport (`BROWSER` in the launcher). On the deck this gives you a full Claude session inside Firefox itself, no Konsole window needed. Pick `BROWSER` in the launcher, hit DEPLOY, and the session opens as a tab in the dashboard UI.

The installer wires this up automatically: `npm install` inside the container pulls the `ws` package that powers the WebSocket bridge, and the host pty is spawned via `bash -lc 'script -q /dev/null -c "claude ..."'` so xterm.js gets a real pseudo-TTY.

Tailscale users: the dashboard binds `0.0.0.0:3046`, so any device on your Tailscale network can open the launcher and run a browser terminal that executes on the deck. Phone, laptop, tablet, all work.

## Uninstall

```bash
distrobox stop multideck-box
distrobox rm multideck-box
rm -rf ~/.dispatch-kokoro-venv ~/.config/multideck ~/.cache/multideck
rm -f ~/.local/share/applications/multideck.desktop
rm -rf ~/multideck
```

Removing the Steam shortcut is done from Steam, right-click the entry → Remove from Library.

---

## What runs where

| Component | Location |
|---|---|
| MultiDeck source | `~/multideck/` (host filesystem, shared with container via distrobox home bind) |
| Container | `~/.local/share/containers/storage/` |
| Node, npm, claude, ffmpeg, python | Inside container only |
| Kokoro venv | `~/.dispatch-kokoro-venv/` (host, used by container) |
| Generated audio | `~/multideck/tts-output/` |
| Env config | `~/.config/multideck/env` |
| Launcher logs | `~/.cache/multideck/dashboard.log` |
| Steam shortcut target | `~/.local/share/applications/multideck.desktop` |

---

## Gaming Mode integration

The shipped `steamdeck-launcher.sh` opens Chromium in kiosk mode (`--kiosk --app=URL` with an isolated `--user-data-dir` under `~/.cache/multideck/chromium-profile`). From Gaming Mode that gives you a fullscreen launcher and persona terminals run inside the browser-terminal panel (xterm.js over WebSocket) without alt-tabbing.

For tighter Gaming Mode integration, edit `steamdeck-launcher.sh` and uncomment the `gamescope` line near the bottom. That wraps the whole session in gamescope so it behaves more like a native game.

## Controls

The launcher is fully controller-driven on Deck. Touch and mouse still work for the desktop case.

| Input | Action |
|---|---|
| **A** | Confirm highlighted choice / select option 1 |
| **B** | Cancel modal / back / select option 2 |
| **X** | Select option 3 (in modal) / toggle mic (outside modal) |
| **Y** | Select option 4 |
| **D-Pad** or **Left Stick** | Navigate options / focus next-prev tab |
| **L1** | Previous terminal session (cycle backwards through active tabs) |
| **R1** | Next terminal session / confirm multi-select question |
| **L2** | Voice-answer (inside glyph modal: record, transcribe, submit as answer) |
| **Steam button + R-trackpad** | OS-level mouse (fallback) |

When Claude calls `AskUserQuestion`, the PreToolUse hook intercepts the call, the dashboard renders a glyph-mapped modal, and Claude never displays its native CLI prompt. Pick with A/B/X/Y for direct selection, or D-Pad + A to highlight-and-confirm. Press L2 for an open-ended voice answer when none of the four glyphs fit. The 60-second operator-timeout reverts to a "proceed with best judgment" deny so Claude does not stall forever if the Deck is unattended.

## Voice input (STT)

Press **X** anywhere in the launcher (outside the glyph modal) to toggle the mic. Press once to start recording, press again to stop and transcribe; the result is injected into the active terminal as if you typed it, with a trailing newline. Audio is captured by the browser (`MediaRecorder` at `audio/webm;opus`), POSTed to `/stt/transcribe` on the dashboard, transcoded to 16 kHz mono WAV via ffmpeg, and fed through `whisper.cpp` with the `base.en` model (or the remote whisper-server when `DISPATCH_WHISPER_REMOTE` is set).

Inside the glyph modal, **L2** captures one mic burst (auto-cuts at 6 seconds) and submits the transcribed text as the answer to the current question, bypassing the A/B/X/Y glyph picker. Useful for open-ended prompts.

The mic button in the terminal header also works as click-to-toggle for users without a controller.

Model trade-offs: `base.en` is the default — around 150 MB, near-realtime on Zen 2 for short utterances. Swap to `small.en` for higher accuracy by setting `DISPATCH_WHISPER_MODEL_NAME=small.en` before re-running the installer with `--force`. `tiny.en` (around 75 MB) is faster but noticeably worse on technical terminology.
