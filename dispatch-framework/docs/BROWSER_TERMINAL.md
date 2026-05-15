# Browser Terminal — In-Browser Agent Interface

The browser terminal is a fourth transport option in the MultiDeck launcher that opens a live Claude agent session directly inside the browser — no separate window, no tmux, no terminal emulator required. It is the default option for remote access scenarios (Tailscale, mobile, laptop).

---

## Transport Selection

In the launcher character select screen, the transport row shows four options:

| Transport | Requires | Best for |
|-----------|----------|----------|
| `WT` | Windows Terminal | Local desktop, persistent windows |
| `TMUX` | tmux session | WSL / Linux, multiplexed layout |
| `SH` | bash | Simple fallback |
| `BROWSER` | Nothing extra | Remote access, multi-agent, cyberpunk |

Select **BROWSER**, choose a persona, and click **LAUNCH**. The terminal panel slides up from the bottom of the launcher page.

---

## Terminal Panel

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ● // OPERATIVE TERMINAL //  [DISPATCH]  [ENGINEER ×]  LIVE      │
│                                        [ + NEW ] [ − MIN ]      │
├──────────────────────────────────────────────┬──────────────────┤
│                                              │                  │
│   xterm.js terminal (agent session)          │  Matrix Rain     │
│   — colored in persona accent                │  (660px panel)   │
│   — full PTY via WSL script wrapper          │                  │
│                                              │                  │
└──────────────────────────────────────────────┴──────────────────┘
```

### Tab Bar

Each active session appears as a tab in the header:

- **Status dot** — `○` connecting · `●` live (persona color) · `■` dead (red)
- **Callsign** — persona name
- **×** — close this session only; process is killed, tab removed

Click any tab to bring that session to the foreground. The global status badge and header dot update to reflect the active tab.

### Buttons

| Button | Action |
|--------|--------|
| `[ + NEW ]` | Minimizes panel, returns to character select to pick another persona |
| `[ − MIN ]` | Hides panel; sessions stay alive; restore tab appears at bottom-right |
| `[ × ]` on tab | Kills that session; panel closes automatically when last tab is gone |

### Restore Tab

When minimized, a `[ ◈ TERMINAL ACTIVE ]` tab appears at the bottom-right of the page. With multiple sessions it reads `[ ◈ N TERMINALS ACTIVE ]`. Click it to restore the panel.

---

## Multi-Session Management

Up to as many sessions as you want can run simultaneously. Each session is fully independent:

- Own WebSocket connection to `/terminal/ws`
- Own xterm.js Terminal instance
- Own PTY process on the server
- Own persona color scheme in the terminal
- Own watermark tile in the matrix rain

**Starting additional sessions:**
1. Click `[ + NEW ]` (panel minimizes, panel re-opens after launch)
2. Or: keep panel open and click LAUNCH again with BROWSER transport from outside the panel

**Switching sessions:** click the tab. The matrix rain color palette updates to include all active persona colors.

**Closing a session:** click `×` on the tab. If it is the last session, the panel closes and matrix rain stops.

---

## Matrix Rain Panel

The 660px-wide panel to the right of the terminal displays a live matrix character stream with per-session personalization.

### Color Composite

Colors are derived from **all active sessions**, not just the foreground tab. Each column in the rain picks randomly from the pool of active persona accent colors. When a new session is added its color joins the pool; when one closes it is removed. Columns pick a new color from the pool each time they reset (loop back to top).

### Portrait Watermarks

Each session's persona portrait is drawn onto the canvas as a tile:

- Session 0 → tile position 0 (top-left)
- Session 1 → tile position 1 (next cell)
- Session N → tile position N

All other tile positions are blank. Images appear at ~28% equilibrium opacity beneath the falling characters. Adding a new agent adds a new portrait tile.

Tile size: 128×128px. Grid fills left-to-right, top-to-bottom.

### Density Scaling

Column width shrinks as `⌊14 / √n⌋` where n = number of active sessions:

| Sessions | Cell width | Columns (660px panel) |
|----------|------------|----------------------|
| 1 | 14px | 47 |
| 2 | 10px | 66 |
| 3 | 8px | 82 |
| 4 | 7px | 94 |

Ghost phrase spawn rate also scales with session count.

### Ghost Phrases

Every ~9 seconds a phrase materializes in the rain at a random position, rendered in the active persona color with a glow. Phrases include classic lines (*FOLLOW THE WHITE RABBIT*, *THERE IS NO SPOON*), cyberpunk references (*NEUROMANCER*, *GHOST IN THE SHELL*, *BLADE RUNNER 2049*), and operator memes (*SUDO MAKE ME A SANDWICH*, *NaN NaN NaN BATMAN*, *WORKS ON MY MACHINE*).

---

## Technical Architecture

```
Browser
  └─ launcher.html
       ├─ POST /launcher/launch  { transport: "browser", persona, prompt, dangerous }
       │       → { session_id, ws_path: "/terminal/ws?session=<id>" }
       │
       └─ WebSocket /terminal/ws?session=<id>
               ↓
           server.cjs
               ├─ pendingSessions map (30s TTL)
               └─ spawn: wsl.exe -d Ubuntu -- bash -lc
                           "script -q /dev/null -c 'claude [--dangerously-skip-permissions] [prompt]'"
                                   ↕  stdio bridge
                           ws messages: { type: "data"|"ready"|"exit"|"error"|"input" }
```

**PTY wrapping:** `script -q /dev/null -c '...'` allocates a Linux pseudo-TTY so claude receives proper terminal signals and does not print "no stdin data" warnings.

**Dangerous mode:** Check the `⚠ DANGEROUS` checkbox in the launcher before clicking LAUNCH. The flag is carried through the POST body → pending session → spawn command as `--dangerously-skip-permissions`.

**Session expiry:** If the browser never opens a WebSocket for a pending session, the server clears it after 30 seconds.

---

## Tailscale Remote Access

The browser terminal makes MultiDeck fully accessible from any device on your Tailscale network — laptop, phone, tablet — without port forwarding or VPN configuration beyond Tailscale itself.

### Setup

1. **Install Tailscale** on your dev machine (Windows host or WSL):
   - Windows: [tailscale.com/download](https://tailscale.com/download)
   - WSL: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`

2. **Install Tailscale** on each device you want to access from (iOS, Android, macOS, another Windows machine).

3. **Start the MultiDeck server** as normal on your dev machine:
   ```bash
   node dashboard/server.cjs
   # Listening on 0.0.0.0:3046 (all interfaces — Tailscale included)
   ```

4. **Find your Tailscale hostname** on the dev machine:
   ```bash
   tailscale status
   # Shows: 100.x.x.x   your-machine-name   ...
   ```
   Or use the MagicDNS hostname: `your-machine-name.tail<id>.ts.net`

5. **Open from any device:**
   ```
   http://your-machine-name:3046/launcher
   http://100.x.x.x:3046/launcher
   ```

### What works remotely

| Feature | Remote |
|---------|--------|
| Launcher (character select, boot screen) | ✓ |
| BROWSER transport terminal | ✓ (WebSocket over Tailscale) |
| Job board, briefing, audio feed | ✓ |
| Matrix rain, persona portraits | ✓ |
| Multi-session tabs | ✓ |
| `--dangerously-skip-permissions` | ✓ (checkbox in launcher) |
| WT / tmux / sh transports | ✗ (open on server machine only) |

The spawned `claude` process runs on the **host dev machine** with full access to the local filesystem and tools. You are operating your local agent from anywhere.

### Security Notes

- Tailscale uses WireGuard encryption; traffic between devices is end-to-end encrypted.
- Only devices authenticated to your Tailscale account can reach the server.
- Port 3046 is **not** exposed to the public internet — only to your Tailscale network.
- Do not set `--dangerously-skip-permissions` as a default in untrusted environments; it bypasses claude's permission gates.
- If sharing a Tailscale network with others (e.g. a team), consider binding the server to `127.0.0.1` and using Tailscale's access controls (ACLs) to restrict who can reach port 3046.

### Binding to a Specific Interface (optional)

By default the server listens on `0.0.0.0` (all interfaces). To restrict to Tailscale only, find your Tailscale IP and set it in `server.cjs`:

```javascript
// server.cjs — change the listen call
server.listen(PORT, '100.x.x.x');  // your Tailscale IP
```

---

## Troubleshooting

**Panel opens but terminal stays at CONNECTING**
- Pending session expired (> 30s between LAUNCH and panel open). Click LAUNCH again.
- Check the server is still running: `netstat -ano | findstr :3046`

**Terminal connects but shows no output**
- WSL may not be running. In PowerShell: `wsl --list --running`
- Claude may not be on PATH inside WSL: `wsl -d Ubuntu -- which claude`

**Matrix rain does not start**
- xterm.js CDN failed to load (no internet). The rain starts after the xterm library loads.
- Check browser console for script errors.

**Remote access: WebSocket fails to connect**
- Confirm Tailscale is connected on both devices: `tailscale status`
- Confirm the server is running and listening on `0.0.0.0` (not `127.0.0.1`).
- Check Tailscale ACLs if on a shared network.

**Portrait watermarks not appearing**
- Portrait file must exist at `dashboard/launcher-assets/portraits/<key>.png`
- The image loads asynchronously; allow 1-2 seconds after the panel opens.
