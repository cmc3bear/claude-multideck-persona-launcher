# Contributing to MultiDeck

MultiDeck is designed to be extended. This guide covers the main patterns for adding agents, dashboards, hooks, and workflows.

## Adding a New Agent

### Step 1: Use the Agent Script

```bash
python scripts/dispatch-agent.py add \
  --callsign "MyAgent" \
  --color "#HEXCODE" \
  --voice "voice_key" \
  --scope "agent-scope-description"
```

This:
- Adds a new entry to `personas/personas.json`
- Generates `personas/MY_AGENT.md` from the agent template
- Registers the voice key in the voice daemon

### Step 2: Customize the Persona File

Edit `personas/MYAGENT_AGENT.md` to define:
- **Role and scope** — What this agent owns
- **Operational charter** — Explicit boundaries (in scope / out of scope)
- **Key functions** — Primary responsibilities
- **Communication style** — Tone, voice output conventions
- **MCP tools** — Which integrations this agent uses
- **Handoff protocol** — How results are passed to other agents

Always include:
- A reference to `docs/OQE_DISCIPLINE.md` — the agent must follow O-Q-E framing
- A reference to `docs/VOICE_RULES.md` — TTS-safe writing conventions
- Lane boundaries — make explicit what the agent does NOT do

### Step 3: Update personas.json Voice Key

If your agent uses a custom voice configuration, add it to the voice catalog:

```json
"myagent": {
  "callsign": "MyAgent",
  "color_hex": "#HEXCODE",
  "tab_color": "#DARKER_HEX",
  "voice_key": "voice_identifier",
  "cwd": "${DISPATCH_USER_ROOT}/your/path",
  "agent_file": "personas/MYAGENT_AGENT.md",
  "description": "Agent description and scope",
  "scope": "agent-category"
}
```

### Step 4: Register the Voice

```bash
python scripts/set-voice.py myagent voice_identifier
```

This writes the voice config to `voice-config-${CLAUDE_CODE_SSE_PORT}.json` (per-session isolation).

## Adding a New Dashboard Route

The dashboard server (`dashboard/server.cjs`) is a raw `http.createServer` handler — there is no Express or framework. Routes are matched by URL string comparison inside the request handler, and responses are built with helper functions.

### Architecture Overview

The server delegates requests to handler functions in priority order:

1. `handleLauncher(req, res, url)` — all `/launcher/*` routes
2. `handleAudioFeed(req, res, url)` — all `/audio-feed/*` routes
3. Core route matching — `/`, `/briefing`, `/state.json`

Each handler returns `true` if it handled the request, or `false` to pass through. HTML pages are rendered inline by functions like `renderMainDashboard()` and `renderBriefing()` (or imported renderers like `renderAudioFeedPage()` from `audio-feed-page.cjs`). JSON responses use the `sendJson(res, status, obj)` helper.

### Step 1: Write a Render Function

Create a function in `dashboard/server.cjs` that returns an HTML string:

```javascript
function renderMyRoute() {
  const state = loadState();
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>My Route</title></head>
<body>
  <h1>My Route</h1>
  <pre>${esc(JSON.stringify(state, null, 2))}</pre>
</body>
</html>`;
}
```

Use the `esc()` helper to escape any dynamic content inserted into HTML. Use `loadState()` to read all state JSON files from the state directory.

### Step 2: Register the Route in server.cjs

Add a URL match inside the `http.createServer` callback, after the existing handler calls:

```javascript
if (url === '/myroute' || url === '/myroute/') {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(renderMyRoute());
  return;
}
```

For JSON API endpoints, use the `sendJson` helper:

```javascript
if (url === '/api/myroute-data') {
  const state = loadState();
  sendJson(res, 200, { data: state['job-board'] });
  return;
}
```

### Step 3: Group into a Handler (for complex routes)

If your route has multiple sub-paths (like the launcher or audio feed), extract a handler function that follows the same pattern:

```javascript
function handleMyRoute(req, res, url) {
  if (url === '/myroute' || url === '/myroute/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderMyRoute());
    return true;
  }
  if (url === '/myroute/data') {
    sendJson(res, 200, { items: [] });
    return true;
  }
  return false;
}
```

Then wire it into the main request handler alongside the existing calls:

```javascript
if (handleMyRoute(req, res, url)) return;
```

## Adding a New Hook

Hooks are Python scripts that respond to job board changes or timer events.

### Step 1: Create the Hook Script

```python
# hooks/my-hook.py
import json
import sys
from pathlib import Path

def on_job_completed(job_id, job_data):
    """Called when a job transitions to 'completed'"""
    print(f"Job {job_id} completed: {job_data['summary']}")
    # Queue TTS announcement, update dashboard state, etc.

def on_job_flagged(job_id, feedback):
    """Called when Reviewer flags a job"""
    print(f"Job {job_id} needs fixes: {feedback}")
    # Create follow-up job, notify Dispatch, etc.

if __name__ == "__main__":
    event_type = sys.argv[1]  # "job-completed", "job-flagged", etc.
    payload = json.loads(sys.stdin.read())
    
    if event_type == "job-completed":
        on_job_completed(payload["job_id"], payload["job"])
    elif event_type == "job-flagged":
        on_job_flagged(payload["job_id"], payload["feedback"])
```

### Step 2: Register the Hook

Hook registration is not yet automated. To integrate your hook, call it from an existing workflow (e.g., from the job board CLI in `scripts/job-board.py`) or invoke it manually. A formal hook registry is a planned addition.

## Modifying the State Schema

State files are JSON. Templates are in `dashboard/state-templates/`.

### Step 1: Update the Template

Edit the relevant `.template.json` file to reflect your schema changes:

```json
{
  "schema_version": 2,
  "fields": {
    "job_id": "string",
    "status": "enum:pending|active|completed|flagged",
    "new_field": "your-type"
  }
}
```

### Step 2: Write a Migration Script

If you're changing an existing state file format, create a migration:

```python
# scripts/migrate-state-v1-to-v2.py
import json
from pathlib import Path

def migrate_job_board():
    board_path = Path("state/job-board.json")
    data = json.loads(board_path.read_text())
    
    # Transform data here
    for job in data["jobs"]:
        if "new_field" not in job:
            job["new_field"] = "default"
    
    board_path.write_text(json.dumps(data, indent=2))

if __name__ == "__main__":
    migrate_job_board()
    print("Migration complete")
```

### Step 3: Update Validation

Edit the job board code to validate against the new schema.

## Testing Your Changes

- **Voice playback** — Preview TTS output with `python hooks/voice-audition.py`
- **Dashboard routes** — Run `node dashboard/server.cjs` and verify routes load at `http://localhost:3045`
- **Manual testing** — Create a test job, assign to your new agent, verify completion flow
- **Automated tests** — A formal test suite is a planned addition

## Code Standards

- **Python** — PEP 8, type hints where possible
- **JavaScript** — Use async/await, avoid callbacks when possible
- **Markdown** — Follow [CommonMark](https://commonmark.org/) spec
- **JSON** — 2-space indent, no trailing commas

## Commit Conventions

- **feat:** New agent, dashboard route, or hook
- **docs:** Documentation updates
- **fix:** Bug fixes in state handling, voice queueing, etc.
- **refactor:** Restructure without changing behavior
- **test:** Add or update tests

Example: `feat: add Researcher agent with evidence-grading capability`

## Licensing

All contributions are licensed under the MIT License. By contributing, you agree that your work will be licensed under the same terms.

---

For questions, refer to the persona system docs or reach out through the framework's issue tracker.
