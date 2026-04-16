# Agent Teams Guide: Using MultiDeck with Claude Code Experimental Features

Claude Code supports **Agent Teams** — an experimental feature that lets you spawn multiple Claude instances in parallel with shared context.

MultiDeck is designed to work alongside Agent Teams. This guide covers how to use both together.

---

## What Are Agent Teams?

Agent Teams (enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true`) allow you to:

1. Define a team of Claude agents
2. Give each agent a specialized role
3. Let them work in parallel
4. Share context across the team

Claude Code Agent Teams are **orthogonal** to MultiDeck. You can:
- Use MultiDeck without Agent Teams (basic mode)
- Use Agent Teams without MultiDeck (standalone)
- Use both together (recommended for complex projects)

---

## MultiDeck + Agent Teams: The Synergy

**MultiDeck** provides:
- Persona definitions (callsigns, voices, scopes)
- Job board (work queue)
- Review gates (quality)
- Voice announcements (coordination)

**Claude Code Agent Teams** provide:
- Rapid agent spawning
- Shared context windows
- Native Claude Code integration

**Together:**
- You define personas in MultiDeck (`personas.json`)
- Claude Code Agent Teams instantiate them quickly
- Agents coordinate through the job board
- Voices announce progress in real-time

---

## Setup

### Step 1: Enable Agent Teams

In your `.claude-code-config.json` or shell environment:

```json
{
  "experimental": {
    "agent_teams": true
  }
}
```

Or:

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true
claude-code
```

### Step 2: Define Team in Claude Code

In your Claude Code session:

```
Create a team with these agents:
- Architect (callsign, reads personas/ARCHITECT_AGENT.md)
- Engineer (callsign, reads personas/ENGINEER_AGENT.md)
- Reviewer (callsign, reads personas/REVIEWER_AGENT.md)
```

Claude Code reads the persona files and instantiates the agents.

### Step 3: Route Work via Job Board

Post jobs to `state/job-board.json`:

```json
{
  "job_id": "JOB-0050",
  "assigned_to": "architect",
  "objective": "Design API schema"
}
```

Team agents watch the job board and pick up work assigned to them.

---

## Agent Team Workflow

### Scenario: Parallel Development

You want to work on three tasks in parallel:
1. Architect designs the schema
2. Engineer implements endpoints
3. Researcher gathers API benchmarks

With Agent Teams:

```
Claude Code spawns 3 sub-instances
Architect instance loads personas/ARCHITECT_AGENT.md
Engineer instance loads personas/ENGINEER_AGENT.md
Researcher instance loads personas/RESEARCHER_AGENT.md

Each reads their assigned jobs from job board
Architect: "Design API schema" (JOB-0050)
Engineer: "Implement CRUD endpoints" (JOB-0051)
Researcher: "Benchmark similar APIs" (JOB-0052)

All work in parallel, sharing job board state
When tasks complete, agents submit results
Reviewer audits all three

Jobs transition: active → review → approved → completed
Voices announce progress as each job completes
```

### Coordinating Across Teams

If job JOB-0051 (Engineer) **depends on** JOB-0050 (Architect):

```json
{
  "job_id": "JOB-0051",
  "assigned_to": "engineer",
  "dependencies": ["JOB-0050"],
  "blocked": true
}
```

Job board system:
- Marks JOB-0051 as blocked
- Engineer sees it's blocked, moves to next job
- When JOB-0050 completes, JOB-0051 auto-unblocks
- Engineer picks it up

---

## Configuration

### team.json Schema

If your Agent Team setup requires a config file:

```json
{
  "team": {
    "name": "MultiDeck Team",
    "agents": [
      {
        "callsign": "Architect",
        "persona_file": "personas/ARCHITECT_AGENT.md",
        "voice_key": "af_sky"
      },
      {
        "callsign": "Engineer",
        "persona_file": "personas/ENGINEER_AGENT.md",
        "voice_key": "am_eric"
      },
      {
        "callsign": "Reviewer",
        "persona_file": "personas/REVIEWER_AGENT.md",
        "voice_key": "bm_lewis"
      }
    ],
    "job_board": "state/job-board.json",
    "shared_context": [
      "docs/OQE_DISCIPLINE.md",
      "docs/VOICE_RULES.md"
    ]
  }
}
```

Pass this to Claude Code when spawning teams:

```bash
claude-code --team-config team.json
```

---

## Inter-Agent Communication

### Via Job Board

Agents communicate by:
1. Reading assigned jobs
2. Submitting results
3. Responding to feedback

Example: Reviewer flags Engineer's work

```
Reviewer sees JOB-0051 submitted
Reviewer reads code → finds issues
Reviewer posts feedback in job-board.json
Engineer watches job board, sees FLAG
Engineer reads feedback: "Add error handling in auth module"
Engineer re-works and resubmits
```

### Via Shared Files

Agents can read shared documentation:

```
Architect writes API schema to docs/API_SCHEMA.md
Engineer reads docs/API_SCHEMA.md before implementing
Both reference the shared schema (single source of truth)
```

Shared files prevent duplicated context and keep all agents aligned.

### Via Voice Announcements

When one agent completes critical work:

```
Architect completes schema design
Architect queues announcement: "Architect calling: API schema complete. Available at docs/API_SCHEMA.md"
All agents hear the announcement
Engineer reads the schema and starts implementation
```

Voice makes handoffs explicit and audible.

---

## Example: Three-Agent Team

### Setup

```bash
# Clone MultiDeck
git clone https://github.com/cmc3bear/claude-multideck-persona-launcher.git
cd dispatch-framework

# Initialize
./scripts/init-dispatch-framework.sh

# Enable Agent Teams and start
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true
claude-code --team-config team.json
```

### Initial Jobs

Post three jobs to `state/job-board.json`:

```json
{
  "job_id": "JOB-0050",
  "assigned_to": "architect",
  "objective": "Design RESTful API schema",
  "priority": "P1"
},
{
  "job_id": "JOB-0051",
  "assigned_to": "engineer",
  "objective": "Implement CRUD endpoints",
  "priority": "P1",
  "dependencies": ["JOB-0050"]
},
{
  "job_id": "JOB-0052",
  "assigned_to": "researcher",
  "objective": "Benchmark similar APIs",
  "priority": "P2"
}
```

### Execution

1. All agents spawn
2. Architect: Sees JOB-0050, starts designing
3. Engineer: Sees JOB-0051, sees it's blocked (depends on JOB-0050), moves to next
4. Researcher: Sees JOB-0052, starts benchmarking
5. Architect (2 hours): Schema complete, submits JOB-0050
6. Reviewer: Approves schema
7. Engineer: JOB-0051 unblocks, starts implementation
8. Researcher (1 hour): Benchmarks complete, submits JOB-0052
9. Engineer (4 hours): Endpoints complete, submits JOB-0051
10. Reviewer: Reviews both jobs (0052 approved immediately, 0051 flagged for security issues)
11. Engineer: Fixes security issues, resubmits
12. Reviewer: Approves both
13. Jobs completed, team dismissed

**Timeline:**
- Without Agent Teams: 7 hours (serial)
- With Agent Teams: 4 hours (parallel, Researcher + Architect + Engineer working simultaneously)

---

## Best Practices

### 1. Shared Context

Always include foundational docs in shared context:

```json
"shared_context": [
  "docs/OQE_DISCIPLINE.md",
  "docs/PERSONA_SYSTEM.md",
  "docs/VOICE_RULES.md",
  "personas/personas.json",
  "state/job-board.json"
]
```

All agents see the same OQE discipline and voice rules.

### 2. Clear Job Descriptions

Jobs must be clear and self-contained. Agent Teams have no in-person coordination.

**Bad:**
```
Objective: "Implement the thing we talked about"
```

**Good:**
```
Objective: "Implement user authentication using JWT tokens"
Success Criteria:
  - Users can register with email
  - Users can login with email + password
  - Sessions persist via JWT cookie
  - Invalid tokens are rejected
```

### 3. Dependency Chains

Keep dependency chains short (max 2-3 levels):

```
Schema (JOB-0050)
  ↓ (blocks)
API Implementation (JOB-0051)
  ↓ (blocks)
Integration Tests (JOB-0053)
```

Long chains serialize the work and defeat parallelism.

### 4. Voice for Handoffs

Use voice announcements to signal key transitions:

```
Architect → "Schema complete. Available at docs/API_SCHEMA.md"
Engineer → "Endpoints ready for testing"
Researcher → "Benchmarks compiled. Ready for comparison"
```

### 5. Monitor the Job Board

Keep the job board dashboard open:

```
http://localhost:3045/dashboard
```

Watch for:
- Stuck jobs (in review too long)
- Escalations (jobs flagged multiple times)
- Bottlenecks (one agent blocked by another)

---

## Troubleshooting

### Agent Not Picking Up Jobs

- Check persona file path is correct
- Check Agent Teams is enabled
- Check job is `assigned_to` the agent's callsign (exact match, case-sensitive)
- Check job status is `pending` or `assigned` (not `completed`)

### Agents Stepping on Each Other's Work

- Use unique file paths per agent
- Use the job board to coordinate (not direct file editing)
- Each job should have a single `assigned_to` agent

### Dependencies Not Working

- Ensure blocking job is in `dependencies` array (as string: `"JOB-0050"`, not object)
- Ensure blocking job's status is `completed` (not just `approved`)
- Check job board watch for dependency resolution logic

### Voice Announcements Overlapping

- Verify voice daemon is running: `ps aux | grep voice-queueing`
- Check TTS queue: `cat state/tts-queue.json | jq .`
- Restart if stuck: `pkill voice-queueing-daemon.py`

---

## Limits and Constraints

### Agent Limits

Agent Teams can spawn many agents, but consider:
- Each agent has its own Claude context (~200k tokens)
- OS limits on processes (typically 256–2048)
- Memory per agent (~1-2GB)

**Recommended:** 3–8 agents per team for most projects.

### Job Board Limits

The job board JSON file grows over time. Consider:
- Archive completed jobs periodically
- Keep `state/job-board.json` under 10MB (easier to watch/edit)
- Migrate to database if scaling beyond 10k jobs

### Voice Limits

Voice announcements are sequential. If agents complete work faster than voice can play:
- Queue depth grows
- Users can't keep up with announcements

Mitigate by:
- Batching announcements ("All three jobs approved")
- Summarizing instead of announcing every job
- Using dashboard instead of voice for high-frequency updates

---

## Further Reading

- `docs/PERSONA_SYSTEM.md` — Persona configuration
- `docs/JOB_BOARD.md` — Job lifecycle in teams
- Claude Code documentation on Agent Teams (official docs)
