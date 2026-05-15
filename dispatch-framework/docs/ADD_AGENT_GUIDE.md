# How to Add an Agent to MultiDeck

This guide walks you through adding a new agent to your MultiDeck roster.

---

## Quick Path (Recommended)

### Step 1: Run dispatch-agent.py

```bash
python scripts/dispatch-agent.py add \
  --callsign "DataScientist" \
  --color "#10B981" \
  --voice "bf_emma" \
  --scope "machine-learning"
```

This:
- Adds entry to `personas/personas.json`
- Generates `personas/DATASCIENTIST_AGENT.md` from template
- Prints confirmation

### Step 2: Customize the Persona File

Edit `personas/DATASCIENTIST_AGENT.md`:

1. Fill in **Identity** section (role, scope, working directory)
2. Expand **What I Am** with your agent's specific responsibilities
3. Define **My Lane** (in-scope / out-of-scope table)
4. List **Core Functions** (what the agent does)
5. Add **MCP Tools** if applicable (research integrations, databases, etc.)

### Step 3: Configure Voice

```bash
python hooks/set-voice.py datascientist bf_emma
```

(Already set by dispatch-agent.py, but you can change it here)

### Step 4: Load in Claude Code

In a Claude Code session:

```
Load the DataScientist persona
```

Claude reads `personas/DATASCIENTIST_AGENT.md` and adopts the identity.

---

## Manual Path (If Script Doesn't Work)

### Step 1: Edit personas.json

Open `personas/personas.json` and add a new entry:

```json
"datascientist": {
  "callsign": "DataScientist",
  "color_hex": "#10B981",
  "tab_color": "#064E3B",
  "voice_key": "bf_emma",
  "cwd": "${DISPATCH_USER_ROOT}/projects/data",
  "agent_file": "personas/DATASCIENTIST_AGENT.md",
  "description": "Machine learning model development and data analysis",
  "scope": "machine-learning"
}
```

**Required fields:**
- `callsign` — Short name for announcements
- `color_hex` — UI color (6-digit hex)
- `tab_color` — Darker shade for terminal tabs
- `voice_key` — Kokoro voice identifier
- `cwd` — Working directory (use `${DISPATCH_USER_ROOT}` placeholder)
- `agent_file` — Path to persona markdown
- `description` — 1-line summary
- `scope` — Category or domain

### Step 2: Create Persona File

Create `personas/DATASCIENTIST_AGENT.md`:

Use `templates/AGENT_TEMPLATE.md` as a scaffold. Copy it:

```bash
cp templates/AGENT_TEMPLATE.md personas/DATASCIENTIST_AGENT.md
```

Then edit to fill in:

```markdown
# Persona: DataScientist

## Identity
- **Callsign:** DataScientist
- **Role:** Machine Learning and data analysis
- **Scope:** Model development, data pipelines, analysis
- **Voice:** Kokoro bf_emma (authoritative, measured)
- **Working Directory:** ${DISPATCH_USER_ROOT}/projects/data

## What I Am

I am the machine learning specialist. I develop models, analyze datasets, and build data pipelines.
...

## What I Am NOT

- I do NOT deploy to production (that's DevOps)
- I do NOT own data infrastructure (storage, warehousing)
- ...

## My Lane

| In Scope | Out of Scope |
|----------|-------------|
| Model training and evaluation | Production deployment |
| Data exploration and analysis | Data engineering (ETL) |
| ...

## Core Functions

### 1. Model Development
...

### 2. Data Analysis
...

...

## MCP Tools

I use these integrations:
- WebSearch (literature review)
- Jupyter notebooks (analysis)
- ...

## Governing Documents

- **OQE Discipline:** Every model and analysis follows Objective → Qualitative → Evidence (see docs/OQE_DISCIPLINE.md)
- **Voice Rules:** All spoken output follows TTS conventions (see docs/VOICE_RULES.md)
- **Job Board:** Work flows through the job board with O-Frames (see docs/JOB_BOARD.md)

...
```

### Step 3: Register Voice

```bash
python hooks/set-voice.py datascientist bf_emma
```

---

## Persona File Sections (Full Reference)

### Identity

```markdown
## Identity

**Callsign:** [Short name]
**Role:** [What this agent does]
**Scope:** [Domain or category]
**Voice:** Kokoro [voice_key] — [description]
**Voice activation:** `python hooks/set-voice.py [callsign] [voice_key]`
**Working Directory:** `${DISPATCH_USER_ROOT}/...`
```

### What I Am

Describe the agent's purpose in 2-3 paragraphs. What makes this agent valuable? What problems do they solve?

### What I Am NOT

Be explicit about out-of-scope. This prevents scope creep and boundary violations.

Example:
```markdown
- I am NOT responsible for data warehousing (that's infrastructure)
- I am NOT responsible for production deployment (that's DevOps)
- I am NOT an analyst (I'm ML-focused, not BI)
```

### My Lane

A table showing in-scope and out-of-scope work:

```markdown
| In Scope | Out of Scope |
|----------|-------------|
| Training classification models | Deploying to production |
| Hyperparameter tuning | Building data pipelines |
| Feature engineering | Owning data storage |
```

### Core Functions

List 3-5 main responsibilities with 1-2 sentences on each.

```markdown
### 1. Model Training
Build, train, and evaluate classification and regression models. Use scikit-learn, TensorFlow, PyTorch.

### 2. Hyperparameter Tuning
Optimize model performance through grid search, random search, and Bayesian optimization.

### 3. Data Exploration
Analyze datasets, identify patterns, generate insights for business and product teams.
```

### MCP Tools

What integrations does this agent use?

```markdown
| Tool | Purpose |
|------|---------|
| WebSearch | Literature review on ML techniques |
| Jupyter | Notebooks for exploration and analysis |
| [Other] | [Usage] |
```

### Governing Documents

Always reference:

```markdown
- **OQE Discipline:** [Link to docs/OQE_DISCIPLINE.md] — How I frame decisions
- **Voice Rules:** [Link to docs/VOICE_RULES.md] — How I speak clearly
- **Job Board:** [Link to docs/JOB_BOARD.md] — How work flows to me
```

### Voice Output Rules

```markdown
## Voice Output Rules

All my announcements follow TTS-safe conventions:
- No em dashes (use commas instead)
- Numbers spelled out (four, not 4)
- No code blocks (describe logic instead)
- Commas for pauses, not dashes

Example: "DataScientist calling. Model trained with 92 percent accuracy. Hyperparameters optimized via grid search."
```

---

## Color Palette Tips

Choose colors that:
- Stand out visually (not too similar to existing agents)
- Are accessible (sufficient contrast with white and black backgrounds)
- Feel appropriate for the role (e.g., analytical blue, creative purple, investigative green)

**Example palette:**
```
Dispatch: #00FFCC (cyan) — coordination
Architect: #FFB700 (amber) — structure
Engineer: #0088FF (blue) — code
Reviewer: #EF4444 (red) — quality
Researcher: #A855F7 (purple) — investigation
DataScientist: #10B981 (green) — analysis
```

Use online tools like [Color Picker](https://htmlcolorcodes.com/) to find hex codes.

---

## Voice Key Selection

Common Kokoro voices:

| Key | Gender | Style | Use Case |
|-----|--------|-------|----------|
| `af_sky` | Generic | Clear, neutral | Dispatch, general coordination |
| `am_eric` | Male | Energetic, friendly | Engineering, development |
| `bf_emma` | Female | Authoritative, measured | Research, analysis, review |
| `bm_lewis` | Male | Stern, deliberate | Quality gates, serious roles |
| `am_adam` | Male | Warm, approachable | Support, mentoring |

For custom voice selection, see `docs/KOKORO_SETUP.md` for full catalog and audio samples.

---

## Testing Your Agent

After creating the persona:

### 1. Verify It Loads

In Claude Code:

```
Load the DataScientist persona
```

Should output:
```
Persona loaded: DataScientist
Callsign: DataScientist
Voice: bf_emma
Working directory: [expanded path]
```

### 2. Test Voice

```bash
python scripts/test-voice.py \
  --agent "datascientist" \
  --message "DataScientist calling. This is a voice test."
```

Listen to the audio. Does it sound natural?

### 3. Create Test Job

Post a test job to the job board:

```bash
python scripts/job-board.py create \
  --agent "datascientist" \
  --summary "Test job for DataScientist agent" \
  --priority "P2"
```

Verify the agent can see and work on it.

---

## Removing an Agent

To remove an agent from the roster:

```bash
python scripts/dispatch-agent.py remove --callsign "DataScientist"
```

Or manually:

1. Open `personas/personas.json`
2. Delete the `"datascientist": { ... }` entry
3. Optionally delete `personas/DATASCIENTIST_AGENT.md`
4. Jobs assigned to the agent can be reassigned or closed

---

## Common Mistakes

### Mistake 1: Unclear Scope

**Bad scope:**
```
"scope": "general"
```

**Good scope:**
```
"scope": "machine-learning"
```

Be specific so jobs route to the right agent.

### Mistake 2: Overlapping Lanes

**Problem:** Two agents claim the same work
```
DataScientist claims: "Model training"
Engineer claims: "Model training"
```

**Solution:** Define clear boundaries
```
DataScientist: Model research, training, evaluation
Engineer: Model deployment, integration, optimization
```

### Mistake 3: Missing Voice Rules

All persona files must reference `docs/VOICE_RULES.md`. If they don't, voice output may have TTS issues.

### Mistake 4: Wrong Working Directory

Using absolute paths:
```
"cwd": "D:\\Users\\username\\projects\\ml"  // Bad
```

Using environment variables:
```
"cwd": "${DISPATCH_USER_ROOT}/projects/ml"  // Good
```

Absolute paths break on different machines. Use placeholders.

---

## Extending Your Agent

Over time, you may want to:
- Add more MCP tools
- Expand core functions
- Refine scope boundaries
- Change voice

All these are OK — just edit the persona file and update `personas.json` as needed.

---

## Further Reading

- `docs/PERSONA_SYSTEM.md` — Full persona system reference
- `docs/VOICE_RULES.md` — TTS guidelines
- `templates/AGENT_TEMPLATE.md` — Persona file scaffold
- `templates/persona-entry.json` — personas.json entry template
