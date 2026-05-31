# Codex Runtime Migration

## Status

Codex is the active default runtime for MultiDeck persona launch.

Source of truth:

- `dashboard/server.cjs`: `DEFAULT_RUNTIME = 'codex'`
- `dashboard/launcher.html`: mode card `data-mode="codex"`
- `scripts/launch-persona.ps1`: Windows Terminal Codex launcher
- `scripts/launch-persona-tmux.sh`: WSL tmux Codex launcher
- `scripts/launch-persona.sh`: native Linux/macOS Codex launcher

## Runtime Matrix

| Runtime | Status | WT | tmux | Browser | Model control | Dangerous mode |
|---|---|---:|---:|---:|---|---|
| Codex | Default | Yes | Yes, via WSL Ubuntu | Yes | `~/.codex/config.toml` or Codex CLI flags | UI checkbox maps to `--dangerously-bypass-approvals-and-sandbox` |
| OpenCode | Legacy local comparator | Yes | No | No | Launcher model picker | Existing OpenCode agent permissions |
| Claude | Legacy docs/install surface | Not active in launcher mode picker | Not active | Not active | Claude Code defaults | Legacy `--dangerously-skip-permissions` references remain in docs/installers |

## Transport Notes

WT transport:

- Server path: `dashboard/server.cjs`
- Script path: `scripts/launch-persona.ps1`
- Launches `codex --cd <cwd> <prompt>`
- Adds `--dangerously-bypass-approvals-and-sandbox` when dangerous mode is checked

tmux transport:

- Server path: `dashboard/server.cjs`
- Script path: `scripts/launch-persona-tmux.sh`
- Requires WSL Ubuntu, `tmux`, and `codex` visible inside WSL
- Uses `DISPATCH_CODEX_BIN` override, default `codex`

Browser transport:

- Server path: `dashboard/server.cjs`
- WebSocket path: `/terminal/ws`
- Spawns Codex in a pseudo-TTY using `script -q -c`
- Dangerous mode checkbox maps to Codex dangerous bypass flag

## Dangerous Mode

The launcher checkbox `dangerous-mode` is sent to `/launcher/launch` and `/launcher/launch-team`.

Codex mapping:

```text
checked   -> --dangerously-bypass-approvals-and-sandbox
unchecked -> no dangerous bypass flag
```

Verification targets:

- `dashboard/scripts/launcher-select.js` sends `dangerous`
- `dashboard/server.cjs` passes `dangerous` through WT, tmux, and browser paths
- `scripts/launch-persona.ps1` accepts `-Dangerous`
- `scripts/launch-persona-tmux.sh` accepts `--dangerous` and `--safe`

## Known Legacy Surfaces

These are not migrated in the initial Codex flip:

- `docs/WSL_SETUP.md`
- `docs/STEAMDECK_SETUP.md`
- `docs/INSTALL.md`
- `docs/DEPLOYMENT.md`
- installer scripts under `scripts/install-*.sh`
- WSL Claude hook templates under `scripts/wsl/`
- generated `.desktop` shortcuts under `dashboard/launcher-assets/shortcuts/`
- `scripts/vs-comparator.py`, still named around Claude versus OpenCode
- `personas/personas.json` `deploy_string` fields, still worded for Claude

Treat those as follow-up migration work. Do not infer they describe the active launcher runtime.

## Verification Commands

```powershell
node --check dashboard/server.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\health-check.ps1 -Port 3046
powershell -NoProfile -ExecutionPolicy Bypass -Command "$script = Get-Content -Raw 'scripts\launch-persona.ps1'; [void][scriptblock]::Create($script)"
bash -n scripts/launch-persona.sh
bash -n scripts/launch-persona-tmux.sh
```

Live endpoint checks:

```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:3046/launcher).Content
Invoke-RestMethod http://localhost:3046/launcher/transports
```

Expected launcher markers:

```text
data-mode="codex"
data-runtime="codex"
dangerous-mode
```
