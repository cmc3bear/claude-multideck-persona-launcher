# Dashboard Guide: Routes, State, and Extension

The MultiDeck dashboard is a web application that provides real-time visibility into agent workload, job board status, and briefings.

---

## Routes Overview

All routes are hosted on `http://localhost:3045`:

| Route | Purpose | Audience | Refresh |
|-------|---------|----------|---------|
| `/` | Main dashboard — job board, agents, calendar | Desktop users | Real-time (SSE) |
| `/mobile` | Mobile-optimized view (responsive) | Phone/tablet users | Real-time (SSE) |
| `/briefing` | Morning briefing — agenda, jobs, weather | Everyone | 5 min polling |
| `/audio-feed` | Listen to agent announcements (SSE stream) | Operators in the loop | Real-time (SSE) |
| `/launcher` | Agent launcher menu | Desktop users | Static |
| `/state.json` | Raw state dump for debugging | Developers | Real-time |

---

## Main Dashboard (/)

**Display:**
- **Job Board** — Pending, active, in-review jobs with quick-stats
- **Agent Roster** — All agents with color, status, current job
- **Calendar** — Next 24 hours of events
- **Actions Needed** — P0/P1 items requiring user decision
- **Project Summary** — Pending/P0/P1 counts per project

**Interactions:**
- Click agent → see agent details, current job, history
- Click job → see full job details, submission, feedback
- Click action → see details, acknowledge/dismiss
- Drag job → reassign to different agent (if Dispatch)

**Auto-refresh:** Every 5 seconds via SSE connection to `/api/job-board-stream`

---

## Mobile Dashboard (/mobile)

**Condensed version of /:**
- **Next Actions** — Top 3 items (P0/P1)
- **Agent Status** — Name, current job, time spent
- **Quick Links** — Create job, check briefing, listen to audio

**Design:**
- Single column (optimized for phone)
- Tap-to-expand for details
- Minimal text, high signal
- Battery-efficient (polling instead of constant SSE)

**Use case:** Check status while away from desktop

---

## Briefing (/briefing)

**Morning briefing view** (auto-load at 9 AM):

**Sections:**
1. **Good Morning** — Weather, time, key stats
2. **Today's Agenda** — Next 24 hours of calendar events
3. **Active Jobs** — What's in progress, who's working on it, ETA
4. **Action Items** — Decisions needed from you
5. **Project Pulse** — 1-minute status per active project
6. **Weather & Environment** — Local conditions, travel time to key locations

**Auto-refresh:** Every 5 minutes

**Customization:** Edit `state/briefing-config.json` to add sections, change order, hide items

---

## Audio Feed (/audio-feed)

**Listen to agent announcements as they happen:**

**Display:**
- **Live Transcript** — Real-time scrolling list of announcements
- **Audio Player** — Current/queued announcements
- **Agent Status** — Which agent is speaking now
- **Transcript Sidebar** — History of last 20 announcements

**Interactions:**
- Mute all / unmute
- Skip to next announcement
- Rewind last announcement
- Download transcript (text)

**Connection:** SSE stream from `/api/tts-stream`

**Use case:** Work while passively listening to agent progress. Hear "Reviewer calling: Job approved" and know to check dashboard.

---

## Launcher (/launcher)

**Agent launch menu** — Quick spawn agents:

**Display:**
- **Available Agents** — All agents from personas.json
- **Launch Button** — Start agent in new Claude Code tab
- **Recent Agents** — Last 5 launched
- **Search** — Find agent by name or scope

**Interaction:**
- Click "Launch Architect" → Opens Claude Code session, loads personas/ARCHITECT_AGENT.md
- Click "Launch + New Tab" → Opens in new Claude Code tab

**Use case:** Quickly spin up an agent without manually loading a persona file

---

## State Debugging (/state.json)

**Raw JSON dump of entire application state:**

```json
{
  "meta": {
    "last_updated": "2026-04-15T16:45:30Z",
    "uptime_seconds": 7234
  },
  "job_board": { ... },
  "personas": { ... },
  "briefing": { ... },
  "calendar": { ... },
  "actions": { ... }
}
```

Use for:
- Debugging state corruption
- Exporting data for analysis
- Validating schema

Access: `curl http://localhost:3045/state.json | jq .`

---

## State File Schema

The dashboard reads from `state/` directory:

| File | Purpose | Updated By |
|------|---------|-----------|
| `job-board.json` | Job queue, statuses, results | `job-board.py`, agents |
| `personas.json` | Agent registry | `dispatch-agent.py` (symlink) |
| `briefing-config.json` | Briefing sections, order | User (manual) |
| `calendar.json` | Events, free blocks, suggestions | `gcal_*` tools (Dispatch) |
| `actions.json` | Action items, decisions needed | Dispatch, agents |
| `project-summary.json` | Per-project stats | Dispatcher (auto-update) |
| `state-meta.json` | Timestamps, cache info | Dashboard |

---

## API Endpoints

### Job Board

```
GET /api/job-board          # Full job board (JSON)
GET /api/job-board-stream   # SSE stream of changes
GET /api/jobs/{job_id}      # Single job details
POST /api/jobs              # Create new job
PATCH /api/jobs/{job_id}    # Update job
POST /api/jobs/{job_id}/submit   # Agent submits work
POST /api/jobs/{job_id}/review   # Reviewer decision
```

### Agents

```
GET /api/agents             # All agents (personas.json)
GET /api/agents/{callsign}  # Single agent details
GET /api/agents/{callsign}/jobs  # Jobs for agent
```

### Briefing

```
GET /api/briefing           # Briefing data
GET /api/briefing/config    # Briefing config
PATCH /api/briefing/config  # Update config
```

### Audio Feed

```
GET /api/tts-stream         # SSE stream of TTS messages
GET /api/tts-queue          # Current TTS queue (JSON)
POST /api/tts-announce      # Queue TTS message
```

### Calendar

```
GET /api/calendar           # Full calendar
GET /api/calendar/free-time # Free time slots
POST /api/calendar/event    # Create calendar event
```

### Actions

```
GET /api/actions            # All action items
GET /api/actions/priority   # Sorted by priority
PATCH /api/actions/{action_id}  # Mark done, dismiss
```

---

## Extending the Dashboard

### Adding a New Route

1. **Create HTML file:**
```html
<!-- dashboard/public/myroute.html -->
<html>
  <head><title>My Route</title></head>
  <body>
    <div id="app"></div>
    <script src="client.js"></script>
  </body>
</html>
```

2. **Register in server.cjs:**
```javascript
app.get("/myroute", (req, res) => {
  res.sendFile(__dirname + "/public/myroute.html");
});

app.get("/api/myroute-data", (req, res) => {
  const data = loadStateFile("job-board.json");
  res.json(data);
});
```

3. **Test:**
```
curl http://localhost:3045/myroute
```

### Adding an SSE Endpoint

For real-time updates:

```javascript
app.get("/api/myroute-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const watcher = watchStateFile("job-board.json", (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  req.on("close", () => watcher.close());
});
```

### Modifying Existing Routes

Edit the HTML or JavaScript in `dashboard/public/` and the server logic in `dashboard/server.cjs`.

Changes reload on next page load (no restart required).

---

## Performance Tuning

### Large Job Boards

If `state/job-board.json` grows beyond 5MB:

1. **Archive completed jobs:**
```bash
python scripts/archive-jobs.py --status "completed" --older-than 30
```

2. **Split state files:**
```
state/job-board.json          (active jobs only)
state/job-board-archive.json  (completed jobs)
```

### SSE Connection Limits

Each SSE connection holds a server thread. With many concurrent users:

1. **Increase server threads:**
```javascript
const http = require("http");
http.globalAgent.maxSockets = 1000;
```

2. **Use polling fallback:**
For browsers without SSE, poll `/api/job-board` every 5 seconds instead.

---

## Troubleshooting

**Dashboard won't load:**
- Check port 3045 in use: `netstat -an | grep 3045`
- Check server logs: `node dashboard/server.cjs` (run in foreground)

**Data not updating:**
- Check SSE connection: Open browser DevTools → Network → find `/api/*-stream`
- If not connected, check CORS headers
- Restart server: `pkill node` && `node dashboard/server.cjs`

**Agents not showing:**
- Verify `personas/personas.json` exists and has agents
- Restart server

**Jobs disappear:**
- Check if `state/job-board.json` is being archived
- Look in `state/job-board-archive.json`

---

## Further Reading

- `docs/JOB_BOARD.md` — Job data structure
- `docs/CLAUDE_DISPATCH_INTEGRATION.md` — Voice announcements and audio feed
- `docs/PERSONA_SYSTEM.md` — Agent registry
