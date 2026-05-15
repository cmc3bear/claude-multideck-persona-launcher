# Persona System: Callsigns, Colors, Voices, and Scope

The **persona system** is how you define, register, and activate Claude agents in MultiDeck. Each persona is an agent with a distinct identity, operational scope, voice, and working directory.

---

## Core Concepts

### Callsign

Every agent has a **callsign** — a short, memorable name. Examples: Dispatch, Architect, Engineer, Reviewer, Researcher.

Callsigns are:
- Used in voice announcements: "Dispatch calling"
- Used in job board assignments: Assign to "Architect"
- Used as directory names and variable keys: `set-voice.py architect`
- Not necessarily unique across frameworks (you can have multiple "Engineer" agents on different projects)

### Color

Each agent has a **hex color** (#RRGGBB) and a darker **tab color** for visual identification.

- Main color: Used in dashboards, UI elements
- Tab color: Used in Claude Code tab background (darker shade)

Example:
```json
"architect": {
  "color_hex": "#FFB700",      // Amber
  "tab_color": "#3B2900"       // Dark amber
}
```

### Voice Key

The **voice key** identifies which Kokoro voice the agent uses when speaking.

Common voice keys (see `docs/KOKORO_SETUP.md` for full catalog):
- `af_sky` — Female, neutral, clear (Dispatch default)
- `am_eric` — Male, energetic, friendly (Engineer default)
- `bf_emma` — Female, authoritative, measured (Researcher default)
- `bm_lewis` — Male, stern, deliberate (Reviewer default)

Voice configuration is stored per-session in `voice-config-${CLAUDE_CODE_SSE_PORT}.json` to avoid interference between parallel Claude Code tabs.

### Working Directory (cwd)

Each agent has a **working directory** — the path where they operate.

For framework defaults, use environment variables:
```json
"cwd": "${DISPATCH_USER_ROOT}/your/project/path"
```

At runtime, the dispatcher expands:
- `${DISPATCH_ROOT}` → absolute path to dispatch-framework/
- `${DISPATCH_USER_ROOT}` → user's home or workspace root

This keeps personas portable across machines.

### Agent File

The **agent_file** is the markdown persona spec. Example:
```json
"agent_file": "personas/ARCHITECT_AGENT.md"
```

This file defines the agent's charter, functions, and operational boundaries.

### Scope

The **scope** field categorizes the agent:
- `workspace` — Workspace-level coordination (e.g., Dispatch)
- `project:name` — Project-specific agent
- `agent-category` — Functional scope (e.g., code-implementation, research, review)

---

## personas.json Schema

The master registry is `personas/personas.json`. Here's the structure:

```json
{
  "meta": {
    "version": 2,
    "description": "Agent registry for MultiDeck",
    "last_updated": "2026-04-15"
  },
  "personas": {
    "dispatch": {
      "callsign": "Dispatch",
      "color_hex": "#00FFCC",
      "tab_color": "#003833",
      "voice_key": "dispatch",
      "cwd": "${DISPATCH_USER_ROOT}",
      "agent_file": "personas/DISPATCH_AGENT.md",
      "description": "Workspace-level ambient coordinator.",
      "scope": "workspace"
    },
    "architect": {
      "callsign": "Architect",
      "color_hex": "#FFB700",
      "tab_color": "#3B2900",
      "voice_key": "architect",
      "cwd": "${DISPATCH_USER_ROOT}/your/project",
      "agent_file": "personas/ARCHITECT_AGENT.md",
      "description": "Project structure, docs, PM, coordination.",
      "scope": "project-structure"
    }
    // ... more agents
  }
}
```

---

## Default Framework Roster

MultiDeck ships with nine operatives:

| Key | Callsign | Color | Voice | Scope |
|-----|----------|-------|-------|-------|
| `dispatch` | Dispatch | #00FFCC | af_sky | workspace |
| `architect` | Architect | #FFB700 | bm_daniel | project-structure |
| `engineer` | Engineer | #0088FF | am_eric | code-implementation |
| `reviewer` | Reviewer | #EF4444 | bm_lewis | quality-gate |
| `researcher` | Researcher | #A855F7 | bf_emma | investigation |
| `launcher-engineer` | Launcher-Engineer | #14B8A6 | am_michael | project:multideck |
| `voice-technician` | Voice-Technician | #8B5CF6 | af_nova | project:multideck |
| `persona-author` | Persona-Author | #D946EF | af_heart | project:multideck |
| `commercial-producer` | Commercial-Producer | #F43F5E | bm_fable | project:multideck |

---

## Persona File Structure

Each agent has a markdown file (e.g., `personas/ARCHITECT_AGENT.md`) with these sections:

```markdown
# Persona: [Agent Name]

## Identity
- Callsign
- Role
- Scope
- Voice
- Working directory

## What I Am
- High-level description
- Core functions
- Operating principles

## What I Am NOT
- Explicit out-of-scope items
- What other agents own

## My Lane
- In Scope / Out of Scope table

## Core Functions
- Detailed responsibilities
- How to interact

## MCP Tools
- Which integrations this agent uses

## Governing Documents
- References to OQE discipline
- References to voice rules
- Links to related docs
```

See `templates/AGENT_TEMPLATE.md` for the full scaffold.

---

## Adding a New Agent

### Quick Method: dispatch-agent.py

```bash
python scripts/dispatch-agent.py add \
  --callsign "MyAgent" \
  --color "#0088FF" \
  --voice "am_eric" \
  --scope "custom-scope"
```

This:
- Adds entry to `personas/personas.json`
- Generates `personas/MYAGENT_AGENT.md` from template
- Registers voice key in voice daemon

### Manual Method: Edit personas.json

1. Open `personas/personas.json`
2. Add a new entry to the `personas` object:
```json
"myagent": {
  "callsign": "MyAgent",
  "color_hex": "#HEX",
  "tab_color": "#DARKER_HEX",
  "voice_key": "voice_identifier",
  "cwd": "${DISPATCH_USER_ROOT}/path",
  "agent_file": "personas/MYAGENT_AGENT.md",
  "description": "Description of role",
  "scope": "scope-category"
}
```

3. Create the persona file (`personas/MYAGENT_AGENT.md`) using `templates/AGENT_TEMPLATE.md` as a scaffold

4. Verify voice key is registered:
```bash
python hooks/set-voice.py myagent voice_identifier
```

---

## Removing an Agent

### Quick Method: dispatch-agent.py

```bash
python scripts/dispatch-agent.py remove --callsign "MyAgent"
```

This removes the entry from `personas.json` and archives the persona file.

### Manual Method

1. Open `personas/personas.json`
2. Delete the agent entry
3. Optionally delete or archive `personas/MYAGENT_AGENT.md`

---

## Activating a Persona in Claude Code

In a Claude Code session:

```
Load the [Callsign] persona
```

Claude reads `personas/[CALLSIGN]_AGENT.md` and adopts that identity.

Or explicitly:
```
Load this persona: ${DISPATCH_ROOT}/personas/ARCHITECT_AGENT.md
```

---

## Voice Activation

When a persona loads, it activates its voice:

```bash
python hooks/set-voice.py [callsign] [voice_key]
```

This writes to `voice-config-${CLAUDE_CODE_SSE_PORT}.json` — a per-session file that doesn't interfere with other Claude Code tabs.

The voice daemon watches this file and applies the voice on next TTS output.

---

## Color Scheme Best Practices

**Don't:**
- Use white or very light colors (poor contrast on light backgrounds)
- Use black or very dark colors (poor contrast in terminals)
- Use colors too similar to existing agents (hard to distinguish)

**Do:**
- Use distinct hues (not just different brightnesses)
- Test tab color on both light and dark terminal backgrounds
- Use hex colors from a cohesive palette (e.g., all saturated, or all desaturated)

**Example palette (from defaults):**
- Dispatch: #00FFCC (cyan) — workspace level
- Architect: #FFB700 (amber) — structure & docs
- Engineer: #0088FF (blue) — code
- Reviewer: #EF4444 (red) — quality gate
- Researcher: #A855F7 (purple) — investigation

---

## Voice Key Naming Convention

Voice keys follow the pattern: `[gender]_[name]`

- Gender: `a` (generic), `m` (male-presenting), `f` (female-presenting)
- Name: `eric`, `sky`, `emma`, `lewis`, etc.

Examples:
- `af_sky` — Generic-gendered, Sky personality
- `am_eric` — Male-presenting, Eric personality
- `bf_emma` — Female-presenting, Emma personality

See `docs/KOKORO_SETUP.md` for the full catalog and voice samples.

---

## Working Directory Resolution

At runtime, the dispatcher expands environment variables in `cwd`:

```python
# Example expansion
cwd = "${DISPATCH_USER_ROOT}/projects/myapp"
# Becomes: /home/user/projects/myapp (or equivalent on your OS)
```

This allows personas to be portable across machines without hardcoded paths.

---

## Example: Custom Project Agent

Say you're working on a game development project and want a dedicated agent.

```bash
python scripts/dispatch-agent.py add \
  --callsign "GameMaster" \
  --color "#F59E0B" \
  --voice "bm_daniel" \
  --scope "game-development"
```

This creates:

**personas.json entry:**
```json
"gamemaster": {
  "callsign": "GameMaster",
  "color_hex": "#F59E0B",
  "tab_color": "#451A03",
  "voice_key": "bm_daniel",
  "cwd": "${DISPATCH_USER_ROOT}/projects/game",
  "agent_file": "personas/GAMEMASTER_AGENT.md",
  "description": "Game development lead. Level design, storytelling, mechanics.",
  "scope": "game-development"
}
```

**personas/GAMEMASTER_AGENT.md:**
Uses the template, customized for game development scope.

Now you can:
1. Load the GameMaster persona in Claude Code
2. Assign jobs to GameMaster on the job board
3. Hear GameMaster's voice on announcements
4. See GameMaster's tab in amber on your screen

---

## Persona System and OQE

Every persona file includes:
- **Reference to OQE discipline** — how this agent applies O-Q-E
- **Reference to voice rules** — TTS-safe writing conventions
- **Clear scope boundaries** — in-scope / out-of-scope table

This ensures consistency across all agents and enforces discipline at the persona level.

---

## Further Reading

- `docs/CLAUDE_DISPATCH_INTEGRATION.md` — Voice queueing and announcement protocols
- `docs/ADD_AGENT_GUIDE.md` — Step-by-step agent creation walkthrough
- `docs/VOICE_RULES.md` — TTS-safe writing for all agent communications
- `templates/AGENT_TEMPLATE.md` — Full persona scaffold
