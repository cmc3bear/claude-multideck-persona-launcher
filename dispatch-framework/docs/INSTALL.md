# Installing MultiDeck

Pick your install path:

| Platform | Path | Time |
|---|---|---|
| Steam Deck (SteamOS 3) | [Steam Deck](#steam-deck-steamos-3) | 15-30 min |
| Generic Linux | [Generic Linux](#generic-linux) | 10-20 min |
| Windows | [Windows](#windows) | 10 min |
| WSL2 on Windows | [WSL2](#wsl2-on-windows) | 15 min |

---

## What gets installed

The installer creates four things:

1. **Application files** — `~/multideck/` (clone of the source tree)
2. **User state** — `~/.local/share/multideck/` (transcripts, voices, jobs, sessions)
3. **User config** — `~/.config/multideck/` (env vars, preferences)
4. **Bundled runtimes** — Node, Python venv with Kokoro TTS, whisper.cpp binary. Sizes: ~80 MB Node, ~3 GB Python+torch, ~150 MB whisper

On Steam Deck the runtimes live inside an Arch distrobox container so SteamOS updates do not break them. On generic Linux they install to the host system.

Removing the install removes everything in #1. Your state in #2 and #3 stays unless you ask to remove it too.

---

## Steam Deck (SteamOS 3)

**Prerequisites (one-time):**

1. Switch to Desktop Mode: hold the STEAM button, pick `Power` → `Switch to Desktop`.
2. Set a sudo password if you have not: open Konsole, run `passwd`, pick something memorable.
3. Confirm you have Wi-Fi or Ethernet.
4. Confirm at least 10 GB free on `/home`: open File Manager, click Properties on the home folder.

**Install:**

Open Konsole and run:

```bash
git clone https://github.com/cmc3bear/claude-multideck-persona-launcher.git ~/multideck
cd ~/multideck
chmod +x scripts/install-multideck.sh
./scripts/install-multideck.sh
```

You will see **one** graphical password prompt early in the install (pkexec asks for your sudo password to install distrobox + podman). After that it runs unattended for 10-25 minutes depending on download speed.

When it finishes, the installer prints a checklist of what to do next.

**Add to Steam:**

Back in Konsole (or via the Steam client):

```bash
steam steam://addnonsteamgame
```

In the dialog that opens, browse to `~/multideck/scripts/steamdeck-launcher.sh` and click Add. Rename the shortcut to `MultiDeck` in Steam, set the icon by right-clicking the entry and pointing it at `~/multideck/dashboard/launcher-assets/portraits/dispatch.png`.

Reboot into Gaming Mode. MultiDeck appears in your library.

**First-time Claude Code auth:**

Run the launcher once from Desktop Mode. When the terminal panel appears, click the operator card you want to spawn, then in the terminal that opens, run `claude login` and complete the browser auth.

---

## Generic Linux

Tested on Arch, Ubuntu 22.04+, Fedora 39+. Other distros likely work; file an issue if not.

**Prerequisites:**

- `git`, `curl`, `python3` (3.10+), Node 20+, ffmpeg, chromium or chrome, sudo access.
- 10 GB free disk space.
- An audio sink (PulseAudio or PipeWire).
- A microphone if you want voice input.

**Install:**

```bash
git clone https://github.com/cmc3bear/claude-multideck-persona-launcher.git ~/multideck
cd ~/multideck
chmod +x scripts/install-multideck.sh
./scripts/install-multideck.sh --target linux-generic
```

The `--target linux-generic` flag skips the distrobox-based path used on Steam Deck and installs directly to the host. You will see one pkexec prompt for the privileged package install step. Everything else is user-scope.

**Start the dashboard:**

```bash
~/multideck/scripts/start-dashboard.sh
```

Open `http://localhost:3046/launcher` in your browser.

---

## Windows

Windows is a development environment for MultiDeck, not a primary deployment target. To run:

**Prerequisites:**

- Windows 10/11 with PowerShell 7+
- Node 20+
- Python 3.10+ with venv
- ffmpeg in PATH (or installed via winget: `winget install Gyan.FFmpeg`)
- Optional: Windows Terminal (auto-installed on Win 11)

**Install:**

```powershell
git clone https://github.com/cmc3bear/claude-multideck-persona-launcher.git C:\multideck
cd C:\multideck
.\scripts\init-multideck.ps1
```

The init script bootstraps a Python venv at `C:\multideck\.kokoro-venv\` and installs npm deps. There is no Windows installer-package format yet; treat Windows as "git clone + run scripts manually."

**Start:**

```powershell
node dashboard\server.cjs
```

Open `http://localhost:3046/launcher`.

---

## WSL2 on Windows

Run inside an Ubuntu WSL2 distribution. Better gamepad and audio behavior than Windows-native.

```bash
wsl --install -d Ubuntu-22.04   # if you don't have one yet
wsl -d Ubuntu-22.04
git clone https://github.com/cmc3bear/claude-multideck-persona-launcher.git ~/multideck
cd ~/multideck
chmod +x scripts/install-multideck.sh
./scripts/install-multideck.sh --target wsl
```

The `--target wsl` flag uses the `tmux` transport for persona terminals (not Windows Terminal). You may need to install `wslg-vulkan-tools` for Chromium audio: `sudo apt install wslg-vulkan-tools`.

---

## Verifying the install

After install completes:

```bash
~/multideck/scripts/install-multideck.sh --verify
```

This runs a non-mutating health check covering:

- Distrobox container reachable (Steam Deck only)
- `claude`, `node`, `ffplay`, `chromium`, `whisper-cli` resolvable
- Kokoro venv version match
- whisper.cpp model present
- Dashboard HTTP server starts
- `/stt/transcribe` works end-to-end on a built-in test clip
- Audio output plays a test tone
- Mic input lists at least one source

Pass: prints `[ok] all checks passed`, exits 0.
Fail: prints what failed and how to fix it, exits 1.

---

## Upgrading

```bash
cd ~/multideck
git pull
./scripts/install-multideck.sh
```

The installer is idempotent. It only re-runs steps where something drifted (package versions changed, model file missing, hook config diverged from current source). Typical re-run on an up-to-date system finishes in under 60 seconds.

To force-rebuild the Kokoro venv (e.g., after a Python upgrade):

```bash
./scripts/install-multideck.sh --force
```

---

## Uninstalling

**Remove the application only (keep state):**

```bash
~/multideck/scripts/uninstall-multideck.sh
```

This removes the distrobox container (if used), the desktop entries, the `/usr/local/bin/claude` symlink, and finally `~/multideck/` itself. Leaves `~/.local/share/multideck/`, `~/.config/multideck/`, and `~/.claude/` alone.

**Remove everything including state:**

```bash
~/multideck/scripts/uninstall-multideck.sh --purge
```

Removes user state too. Does not touch `~/.claude/` (your Claude Code login).

---

## Troubleshooting

See `docs/TROUBLESHOOTING.md` for the catalog of known failure modes and recovery steps.

Quick triage:

| Symptom | First thing to try |
|---|---|
| Installer exits with `pkexec not found` | Install polkit: Steam Deck has it; other distros: `sudo pacman -S polkit` or `sudo apt install policykit-1` |
| Installer exits with `steamos-readonly disable failed` | Already disabled. Re-run; the installer handles this. |
| `claude: command not found` after install | Re-run installer; the symlink step may have been skipped. |
| Mic does not trigger STT | `~/multideck/scripts/install-multideck.sh --verify` and look for the `getUserMedia` line. Most often a Chromium permission prompt was dismissed. |
| No audio from agent responses | Check `~/.cache/multideck/audio-feed.log`. The Node server now manages audio internally; older installs had a separate daemon — `systemctl --user disable --now multideck-audio.service` to clean up. |
| Dashboard does not start | `tail -f ~/.cache/multideck/dashboard.log`. Most often port 3046 is already in use — check `ss -ltn \| grep 3046`. |

---

## Privacy notes

- The installer does not phone home. The only network calls during install are: GitHub (clone the repo), pacman/apt (system packages), PyPI (Python wheels), download.pytorch.org (CPU torch wheels), Hugging Face (Kokoro voices, downloaded on first TTS use).
- After install, the only outbound network calls during normal use are to Anthropic (Claude Code API) and whatever sites you ask Claude to fetch.
- TTS (Kokoro) runs 100% locally. STT (whisper.cpp) runs 100% locally. No audio leaves your machine.
- Transcripts are stored at `~/.local/share/multideck/transcripts/`.
