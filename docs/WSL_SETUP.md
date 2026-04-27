<!--
oqe_version: 2.0
spec_source: state/oqe-version.json
governs: WSL Ubuntu install of Claude Code as transport substrate for tmux persona spawning (precondition for MULTI-FEAT-0055)
last_updated_by: Launcher-Engineer MULTI-INFRA-0056 pass 2026-04-26
-->

# WSL Setup — Claude Code as a tmux Persona Transport

This guide installs Claude Code CLI inside WSL Ubuntu so MultiDeck personas can spawn into tmux panes (real fork, native multiplexer) while keeping all existing Kokoro TTS and voice-config plumbing on the Windows side. Hooks at `C:/Users/<user>/.claude/hooks/` stay canonical; WSL Claude calls into them via interop.

This is the precondition for MULTI-FEAT-0055 (WSL tmux persona transport). Without this, tmux panes cannot run the persona activation sequence.

## Architecture

```
WSL Ubuntu (cmc3b@WSL)              Windows
─────────────────────────           ─────────────────────────
claude (native installer)
   │
   ├─ Stop hook ─────► wsl-stop-hook.sh
   │                       │
   │                       │ exec via WSL Interop binfmt
   │                       ▼
   │            kokoro-venv/Scripts/python.exe
   │                       │
   │                       ▼
   │              speak-kokoro.py (reads stdin JSON)
   │                       │
   │                       ▼
   │              kokoro-speak.py (TTS synthesis)
   │                       │
   │                       ├─► temp WAV → ffplay (audible)
   │                       └─► ffmpeg → MP3 →  ┌──────────────────────────┐
   │                                            │ dispatch-framework/      │
   │                                            │   tts-output/<ts>-       │
   │                                            │     <persona>.mp3        │
   │                                            └──────────────────────────┘
   │                                                       │
   │                                                       ▼
   │                                            dashboard/server.cjs
   │                                                /audio-feed/list
   │                                                /audio-feed/mp3/<file>
```

The bridge is a 4-line bash script (`scripts/wsl/wsl-stop-hook.sh`) that sets `DISPATCH_ROOT` and `WSLENV`, then `exec`s the Windows kokoro-venv Python on `speak-kokoro.py`. There is no duplicate Kokoro install in WSL.

## Prerequisites

| Requirement | Why | Verify |
|---|---|---|
| Windows 11 with WSL2 | Real fork/exec + tmux | `wsl --version` shows `WSL version: 2.x.x` |
| Ubuntu 24.04 inside WSL | Default supported distro | `wsl -d Ubuntu -- cat /etc/os-release` shows `noble` |
| Kokoro venv on Windows | TTS engine | `C:\Users\<user>\.claude\hooks\kokoro-venv\Scripts\python.exe -c "from kokoro import KPipeline"` succeeds |
| Claude Code Windows hook config | Source of truth for hook scripts | `C:/Users/<user>/.claude/settings.json` references `kokoro-venv/Scripts/python.exe` |
| ffmpeg on Windows PATH | WAV→MP3 for audio feed | `where ffmpeg` (cmd) or `Get-Command ffmpeg` (PS) returns a path |

## Step 1 — Create a non-root WSL user

WSL ships with a default user that may be `root`. Running Claude Code as root is supported but file ownership of voice-config files becomes UID 0, which causes friction when other tools later read them. Create a normal user that mirrors the Windows username and matches UID 1000.

```bash
wsl -d Ubuntu -- bash -c '
  useradd -m -s /bin/bash -u 1000 cmc3b
  usermod -aG sudo cmc3b
  echo "cmc3b ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/cmc3b
  chmod 440 /etc/sudoers.d/cmc3b
'
```

Set the user as the default WSL login by editing `/etc/wsl.conf` inside WSL:

```ini
[boot]
systemd=true

[user]
default=cmc3b
```

Apply with `wsl --shutdown` then re-enter WSL. Verify:

```bash
wsl -d Ubuntu -- bash -c 'id'
# uid=1000(cmc3b) gid=1001(cmc3b) groups=1001(cmc3b),27(sudo)
```

## Step 2 — Re-enable WSL Interop under systemd (CRITICAL)

When `systemd=true` is set in `/etc/wsl.conf`, Ubuntu disables `systemd-binfmt.service` via a drop-in (`/usr/lib/systemd/system/systemd-binfmt.service.d/wsl.conf`) that adds `ConditionVirtualization=!wsl`. Result: `/proc/sys/fs/binfmt_misc/WSLInterop` is **not registered**, and **no Windows .exe can be executed from WSL bash** — including `cmd.exe`, `powershell.exe`, and any venv Python under `/mnt/c/`.

This is silent — no error appears at boot. The first symptom is `cannot execute binary file: Exec format error` when something tries to call a .exe.

Install a tiny one-shot systemd unit that registers WSLInterop on boot. The unit is at `scripts/wsl/wsl-binfmt.service`:

```bash
wsl -d Ubuntu -- sudo bash -c '
  cp /mnt/f/03-INFRASTRUCTURE/dispatch-framework/scripts/wsl/wsl-binfmt.service /etc/systemd/system/wsl-binfmt.service
  chmod 644 /etc/systemd/system/wsl-binfmt.service
  systemctl daemon-reload
  systemctl enable wsl-binfmt.service
  systemctl start wsl-binfmt.service
'
wsl --shutdown
wsl -d Ubuntu -- ls /proc/sys/fs/binfmt_misc/
# expect: WSLInterop  register  status
```

Verify Windows .exe interop works after cold restart:

```bash
wsl -d Ubuntu -- /mnt/c/Users/cmc3b/.claude/hooks/kokoro-venv/Scripts/python.exe -c "from kokoro import KPipeline; print('OK')"
# OK
```

Without this step, every step that follows will fail.

## Step 3 — Install Claude Code in WSL (native installer)

Anthropic's native installer drops a self-contained binary in `~/.local/bin/`. No Node, no npm, no nvm.

```bash
wsl -d Ubuntu -- bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
```

The installer writes to `~/.local/bin/claude` and adds a PATH export to `~/.bashrc`. Note: the heredoc/expansion escaping is fragile when the install command runs over wsl→bash→bash boundaries — verify the literal `$HOME` and `$PATH` are NOT expanded in `~/.bashrc`:

```bash
wsl -d Ubuntu -- tail -2 ~/.bashrc
# Should literally read: export PATH="$HOME/.local/bin:$PATH"
# NOT a hardcoded fully-expanded path string.
```

If it baked in an expanded PATH (a sign that escapes leaked through), fix it by hand:

```bash
wsl -d Ubuntu -- bash -c '
  sed -i "\\|^export PATH=\"/home/.*\\.local/bin:|d" ~/.bashrc
  cat >> ~/.bashrc << "EOF"

# Native-installer Claude Code on PATH
export PATH="$HOME/.local/bin:$PATH"
EOF
'
```

Verify across a cold restart:

```bash
wsl --shutdown
wsl -d Ubuntu -- bash -lc 'which claude; claude --version'
# /home/cmc3b/.local/bin/claude
# 2.x.y (Claude Code)
```

### Make claude reachable from non-login shells

`~/.local/bin` is on PATH for **interactive login** shells (sourced from `~/.bashrc`), but `wsl <command>` runs `<command>` in a non-login shell where neither `~/.bashrc` nor `~/.profile` is read. Without a fix, `wsl claude --version` returns `command not found` even though `wsl bash -lc 'claude --version'` works fine.

The fix: symlink the binary into `/usr/local/bin`, which is on the default PATH for every shell type:

```bash
wsl -d Ubuntu -- sudo ln -sf /home/cmc3b/.local/bin/claude /usr/local/bin/claude
```

Verify the literal non-login form now resolves:

```bash
wsl --shutdown
wsl -d Ubuntu -- claude --version
# 2.x.y (Claude Code)
```

This matters for tmux spawning later — `wsl -d Ubuntu -- tmux send-keys ... 'claude --dangerously-skip-permissions'` runs in a non-login shell, so the symlink is what makes the spawn succeed.

## Step 4 — Authenticate

Authentication is interactive (browser OAuth flow). Run it once from a real terminal — not via `wsl -d Ubuntu --` which doesn't provide a TTY:

```bash
# In a Windows Terminal tab:
wsl -d Ubuntu
$ claude
# Follow the OAuth prompts. Credentials persist to ~/.claude/.credentials.json (mode 600).
```

Verify persistence across a cold restart:

```bash
wsl --shutdown
wsl -d Ubuntu -- bash -lc 'claude --version'
# still authenticated
```

### CWD when launching WSL Claude

`wsl -d Ubuntu` (no `--cd` flag) inherits the caller's Windows working directory and translates it to `/mnt/<drive>/<path>`. Launching from Windows Terminal at `C:\Users\<user>` puts WSL Claude in `/mnt/c/Users/<user>` — not in the dispatch-framework workspace. To guarantee the workspace as CWD regardless of caller, use the `--cd` flag:

```bash
wsl -d Ubuntu --cd /mnt/f/03-INFRASTRUCTURE/dispatch-framework -- claude
```

For tmux-based persona spawning (MULTI-FEAT-0055), `scripts/launch-persona-tmux.sh` should use `--cd` resolved from the persona's `cwd` field in `personas/personas.json` (e.g., `${DISPATCH_ROOT}` → `/mnt/f/03-INFRASTRUCTURE/dispatch-framework`).

## Step 5 — Install the WSL hook bridges

Bridges forward Claude Code Stop and PostToolUse events to the Windows kokoro-venv. They live at `scripts/wsl/wsl-stop-hook.sh` and `scripts/wsl/wsl-tool-hook.sh` in this repo.

```bash
wsl -d Ubuntu -- bash -c '
  mkdir -p ~/.claude/hooks
  cp /mnt/f/03-INFRASTRUCTURE/dispatch-framework/scripts/wsl/wsl-stop-hook.sh ~/.claude/hooks/
  cp /mnt/f/03-INFRASTRUCTURE/dispatch-framework/scripts/wsl/wsl-tool-hook.sh ~/.claude/hooks/
  cp /mnt/f/03-INFRASTRUCTURE/dispatch-framework/scripts/wsl/wsl-claude-settings.json ~/.claude/settings.json
  chmod 755 ~/.claude/hooks/wsl-*.sh
  chmod 644 ~/.claude/settings.json
'
```

The bridges set two env vars and forward them through `WSLENV` so the spawned Windows process inherits them:

| Var | Value | Purpose |
|---|---|---|
| `DISPATCH_ROOT` | `F:\03-INFRASTRUCTURE\dispatch-framework` | Directs `kokoro-speak.py` to write MP3 to this repo's `tts-output/` (otherwise defaults to legacy `dispatch/` path) |
| `CLAUDE_CODE_SSE_PORT` | (set by Claude Code session) | Voice-config isolation — each session reads its own `voice-config-${PORT}.json` |

If your Windows username is not `cmc3b` or your repo path is not `F:\03-INFRASTRUCTURE\dispatch-framework`, edit `wsl-stop-hook.sh` and `wsl-tool-hook.sh` to match before copying.

## Step 6 — Verify the end-to-end audio feed

```bash
# Set up a fake voice config for the test
wsl -d Ubuntu -- bash -c 'CLAUDE_CODE_SSE_PORT=test-wsl python3 /mnt/c/Users/cmc3b/.claude/hooks/set-voice.py dispatch'

# Trigger the Stop hook with a test payload
wsl -d Ubuntu -- bash -c '
  echo "{\"last_assistant_message\":\"WSL bridge end-to-end test.\"}" \
    | CLAUDE_CODE_SSE_PORT=test-wsl ~/.claude/hooks/wsl-stop-hook.sh
'

# Wait for the detached pythonw to synthesize + ffmpeg encode (~10-15s on first run, kokoro warm-up)
sleep 15

# Check that the MP3 landed
ls -la /mnt/f/03-INFRASTRUCTURE/dispatch-framework/tts-output/

# Confirm the dashboard serves it (assumes server is running on 3045)
curl -s http://localhost:3045/audio-feed/list | python -m json.tool | grep -A2 '"filename"' | head -10
```

If the MP3 appears in `tts-output/` and the audio-feed list contains it, the chain is working. Open `http://localhost:3045/audio-feed` in a browser tab to hear new entries auto-play.

## Caveats and known landmines

**UNC path latency on `/mnt/c`.** Reads and writes through WSL DrvFs to `/mnt/c/...` carry roughly a 500 ms penalty per `mkdir` mutex acquisition in `kokoro-speak.py`. This is equivalent to the PowerShell-only baseline, not worse. It's noticeable only when the kokoro queue depth exceeds 5 simultaneous requests.

**Path-translation gotcha when env vars precede a Windows .exe.** Invoking `VAR=val /mnt/c/.../python.exe /mnt/c/.../script.py` from WSL bash does **not** auto-translate `/mnt/c/...` arg paths to Windows form. Symptom: Python opens a path like `F:\mnt\c\...` (relative to WSL CWD on F:). The bridge scripts work around this by calling `wslpath -w` to convert paths to Windows form before passing as args.

**Hook command expansion.** Claude Code reads `~/.claude/settings.json` and runs the `command` string through a shell. Setting env vars inline in that string can fail through the same path-translation gotcha. Always route through a wrapper script (the `.sh` bridges) — keeps the settings.json simple and the env handling auditable.

**`kokoro-speak.py` `DISPATCH_ROOT` default is wrong for this repo.** The script's hardcoded fallback is `F:/03-INFRASTRUCTURE/dispatch` (legacy directory name). The bridge scripts override this via `DISPATCH_ROOT` env so MP3s land in `dispatch-framework/tts-output`. If you remove the env override, MP3s vanish into the legacy directory.

**WSL Interop register is transient.** The kernel-level `binfmt_misc` register entry resets on `wsl --shutdown`. The `wsl-binfmt.service` unit installed in Step 2 re-registers it on every boot. If you skip Step 2 and rely on a one-time manual `echo > /proc/sys/fs/binfmt_misc/register`, the next shutdown wipes it and the bridge silently fails.

**Two `tts-output` directories on this host.** `F:/03-INFRASTRUCTURE/dispatch/tts-output` is the legacy dispatch directory. `F:/03-INFRASTRUCTURE/dispatch-framework/tts-output` is the dispatch-framework (this repo) directory. The Windows-side Claude Code session writes to the former; the WSL bridge writes to the latter (via `DISPATCH_ROOT`). Confusion is easy. The audio-feed dashboard serves whichever one its `DISPATCH_ROOT` points at when launched.

**Quiet hours suppress audio.** `speak-kokoro.py` checks `is_quiet_hours()` (default 1:00–6:30 local time) and silently returns. If you test the bridge during quiet hours, no MP3 is produced. Move clock or edit `QUIET_START`/`QUIET_END` for testing.

## File reference

| Path | Role |
|---|---|
| `scripts/wsl/wsl-binfmt.service` | systemd unit to register WSLInterop on boot |
| `scripts/wsl/wsl-stop-hook.sh` | Stop hook bridge — forwards stdin to `speak-kokoro.py` |
| `scripts/wsl/wsl-tool-hook.sh` | PostToolUse hook bridge — forwards stdin to `speak-tool-status.py` |
| `scripts/wsl/wsl-claude-settings.json` | Template `~/.claude/settings.json` for WSL Claude |

Edit and re-copy if your Windows username, repo path, or hook directory differs from the defaults.
