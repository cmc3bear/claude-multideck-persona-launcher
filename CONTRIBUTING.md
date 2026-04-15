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

### Step 1: Create the HTML View

Add a new file in `dashboard/public/`:

```html
<!-- dashboard/public/myrout.html -->
<html>
  <head>
    <title>My Route</title>
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    <div id="app"></div>
    <script src="client.js"></script>
  </body>
</html>
```

### Step 2: Register the Route in server.cjs

Edit `dashboard/server.cjs`:

```javascript
app.get("/myroute", (req, res) => {
  res.sendFile(__dirname + "/public/myroute.html");
});

app.get("/api/myroute-data", (req, res) => {
  // Fetch state and return JSON
  const data = loadStateFile("job-board.json");
  res.json(data);
});
```

### Step 3: Add State Endpoints (if needed)

If your route needs live updates, add a Server-Sent Events endpoint:

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

Edit `hooks/hook-registry.json` (or equivalent):

```json
{
  "job-completed": "hooks/my-hook.py",
  "job-flagged": "hooks/my-hook.py"
}
```

### Step 3: Update the Job Board Watcher

Edit the watcher in `hooks/job-board-change.py` to fire your hook on state transitions.

## Modifying the State Schema

State files are JSON. Templates are in `state/*.template.json`.

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

- **Unit tests** — Add tests in `tests/` for new hooks and scripts
- **Integration tests** — Verify that dashboard routes load and state files update
- **Voice playback** — Test TTS output with `scripts/test-voice.py`
- **Manual testing** — Create a test job, assign to your new agent, verify completion flow

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
