# Topology B — Operator Guide

How the tmux transport lays out personas, how to attach and detach, and where the limits are. This document covers the operator-facing UX of the tmux path; the underlying spawn mechanics live in `scripts/launch-persona-tmux.sh`.

Topology B was selected during MULTI-FEAT-0055 (see `state/feasibility-MULTI-FEAT-0055-tmux-transport.md` §6). One tmux session, one window, N tiled panes — one persona per pane. Refinements from MULTI-FEAT-0065 covered pane rebalance, detach/reattach UX, and pane-count limits.

---

## At a glance

- **Session name:** `multideck` (override with `DISPATCH_TMUX_SESSION`)
- **Layout:** `tiled` — tmux automatically arranges panes in an even grid
- **Per-pane identity:** callsign and accent color rendered in the top border
- **Detach:** `prefix d` (default prefix is `Ctrl-b`)
- **Reattach:** `tmux attach -t multideck` (from any WSL shell)
- **List sessions:** `tmux ls`
- **Kill the whole thing:** `tmux kill-session -t multideck`

---

## Spawning personas

A single persona:

```
scripts/launch-persona-tmux.sh launcher-engineer
scripts/launch-persona-tmux.sh dispatch "quick sanity check"
```

A persona without attaching (for the dashboard, which spawns and lets the operator decide when to attach):

```
scripts/launch-persona-tmux.sh engineer --no-attach
```

The first spawn into the `multideck` session creates the session. Every subsequent spawn joins the same session via `split-window` and re-runs `select-layout tiled` to redistribute pane sizes evenly. Existing pane PIDs are preserved across the rebalance — running personas keep working uninterrupted.

---

## Attaching and detaching

Operator workflow: leave at desk, attach from laptop.

1. At your desk, deploy a persona team. Personas spawn into the shared `multideck` session.
2. When you walk away: in any pane, press `prefix d` (default `Ctrl-b`, then `d`). The session continues running detached.
3. From a laptop on the same network, SSH into the WSL host and run `tmux attach -t multideck`. You're back in the same panes with full history.
4. To detach again: `prefix d`. To kill the session entirely: `tmux kill-session -t multideck` from outside, or `prefix &` from inside (confirms before killing the window).

**Why this is better than wt tabs:** a Windows Terminal tab dies when its window closes. tmux sessions outlive their attached client. You can close the laptop, reopen it three hours later, reattach, and the personas are still where you left them with all their conversation history intact.

---

## Common keybinds (default prefix `Ctrl-b`)

| Action | Keybind |
|---|---|
| Detach | `prefix d` |
| Switch to next pane | `prefix o` |
| Switch by direction | `prefix arrow` |
| Zoom one pane fullscreen | `prefix z` (toggle) |
| List panes | `prefix q` |
| Rename pane title | `prefix ,` |
| Kill current pane | `prefix x` (asks confirmation) |
| Kill window | `prefix &` |
| Scroll mode (mouse wheel works) | `prefix [` then arrow keys; `q` to exit |

If you change tmux's prefix in `~/.tmux.conf`, substitute accordingly.

---

## Pane count limits

`tiled` distributes panes in a roughly-square grid. Pane title readability degrades as panes shrink. Empirical measurements on a 240×60 character terminal (typical maximised Windows Terminal at 1920×1080) running `scripts/measure-pane-threshold.sh`, with the default `pane-border-format` carrying `callsign · cwd-tail` (≈37 chars including separator):

| N personas | Min pane width | Min pane height | Title legible? |
|---|---|---|---|
| 4 | 72 | 15 | yes |
| 5 | 72 | 9 | yes |
| 9 | 48 | 9 | yes |
| 12 | 48 | 6 | yes |
| 15 | 35 | 6 | **truncated** |
| 20 | 35 | 4 | truncated |
| 25 | 28 | 4 | truncated |

**Working threshold: 12 panes** on a 240-column terminal with the standard title format. Beyond 12, callsign+cwd truncates in the border. At 25 panes you also lose useful pane height (4 rows is too short for any conversation thread).

For team sizes above 12, run the dashboard `/launcher` on a second monitor as the navigation aid, or split into multiple windows (`prefix c` to create a new window) or multiple sessions (e.g., one per project), and switch between them with `prefix n` / `prefix p` (next/prev window) or `tmux switch-client -t <session>`.

For team sizes above 9, the operator typically runs the dashboard `/launcher` on a second monitor as the navigation aid, since title legibility in tmux drops.

If you need more than 9 personas live and want clear titles, split into multiple windows (`prefix c` to create a new window) or multiple sessions (e.g., one per project), and switch between them with `prefix n` / `prefix p` (next/prev window) or `tmux switch-client -t <session>`.

---

## Removing a persona without restarting the session

`scripts/dispatch-agent.py remove <persona>` removes the persona from the registry. As of MULTI-FEAT-0065, it also kills the matching tmux pane in the `multideck` session if present, then re-runs `select-layout tiled` so remaining panes redistribute. Other personas keep their PIDs.

If you only want to close one pane without removing the persona from the registry:

```
prefix x          # asks "kill-pane <pane_id>? (y/n)"
```

---

## Troubleshooting

**The session won't show after deploying.** Run `tmux ls` to see if `multideck` exists. If it does but you're not attached, `tmux attach -t multideck`. If it doesn't, check the dashboard logs — the WSL probe may have failed (see `availability_reason` on `GET /launcher/transports`).

**Panes are too small to read.** You're past the practical pane count threshold. Either reduce roster size, split across windows (`prefix c`), or zoom one pane (`prefix z`).

**The colors don't match the launcher card.** `pane-active-border-style` follows focus — only the active pane shows the bright accent. Inactive panes use the dim accent in the title, which is intentional.

**Reattaching from another shell shows no prefix on input.** You're probably attached as a second client and your terminal is too narrow. tmux squeezes to the smallest attached client. Disconnect the smaller client (`prefix d` from inside it) and the larger client gets full size.

**Detach key conflicts with another tool.** Rebind the prefix in `~/.tmux.conf`, e.g., `set -g prefix C-a` then `unbind C-b`. The MultiDeck launcher does not depend on the default prefix.

---

## Related docs

- `docs/PERSONA_SYSTEM.md` — how personas drive the launcher and color scheme
- `docs/AGENT_TEAMS_GUIDE.md` — multi-persona team workflows
- `docs/CLAUDE_DISPATCH_INTEGRATION.md` — voice/audio behavior across panes
- `state/feasibility-MULTI-FEAT-0055-tmux-transport.md` — original design rationale
- `scripts/launch-persona-tmux.sh` — the spawn script implementing topology B

---

*Document spec: docs/OQE_DISCIPLINE.md §11 linkable_citations_only — every operator-facing claim cites a script, doc, or empirical evidence row.*
