# MultiDeck on Steam Deck

Run MultiDeck natively on a Steam Deck. Claude Code, the dashboard, and Kokoro TTS all live inside a distrobox Arch container in your `$HOME`, so SteamOS's read-only root is never touched and the install survives OS updates.

This is the "operator station" deployment, the deck stands alone, no Windows PC required.

---

## OQE frame

**Objective.** A Steam Deck owner can clone the multideck repo, run one script, add it as a Non-Steam Game, and launch a full multideck deployment from Gaming Mode.

**Qualitative.** Confidence MODERATE. Distrobox + Arch on SteamOS is a well-trodden path for dev tooling on the deck, but Kokoro torch CPU inference on the Zen 2 cores is slower than a 4090 host. Acceptable for single-utterance persona responses, slow for long summaries.

**Evidence.** This document, the install script at `scripts/install-steamdeck.sh`, the launcher at `scripts/steamdeck-launcher.sh`, and the upstream packages from `quay.io/toolbx/arch-toolbox` plus PyPI pinned versions match the operational venv from `state/feasibility-MULTI-FEAT-0055-tmux-transport.md §3(b)`.

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
3. Install nodejs, npm, tmux, ffmpeg, python, git, firefox, jq inside the container.
4. Install the Claude Code CLI globally in the container's user-scope npm prefix.
5. Create the Kokoro venv at `~/.dispatch-kokoro-venv` with the same pinned package versions used by the Windows and WSL deployments.
6. Write `~/.config/multideck/env` with the framework environment variables.
7. Generate `~/.local/share/applications/multideck.desktop`.

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

## Steam shortcut

From Desktop Mode:

1. Open Steam.
2. Top menu → Games → Add a Non-Steam Game to My Library.
3. Click Browse. Navigate to `~/.local/share/applications/multideck.desktop` (you may need to type the path into the file dialog since `.local` is hidden by default).
4. Confirm. Steam will pick up the name "MultiDeck" and the icon from the desktop entry.
5. Switch back to Gaming Mode. MultiDeck appears in your Non-Steam library.

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

The shipped `steamdeck-launcher.sh` opens Firefox in kiosk mode. From Gaming Mode that gives you a fullscreen launcher and persona terminals open as separate windows you alt-tab to.

For tighter Gaming Mode integration, edit `steamdeck-launcher.sh` and uncomment the `gamescope` line near the bottom. That wraps the whole session in gamescope so it behaves more like a native game.

Controller-friendly launcher navigation is not in this release. Track that as a separate job if you want it.
