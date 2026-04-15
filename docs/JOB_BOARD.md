# Job Board: Work Queue and Status Tracking

The **job board** is the central coordination mechanism in MultiDeck. It's a JSON-based work queue where you post jobs, assign them to agents, and track progress through completion gates.

---

## Core Concepts

### Job States

Every job transitions through these states:

```
pending → assigned → active → review → (approved | flagged) → completed
                                        ↳ (rejected)
```

| State | Meaning | Who Controls | Next State |
|-------|---------|--------------|-----------|
| **pending** | Job posted, not yet assigned | Dispatch | assigned |
| **assigned** | Job assigned to agent, awaiting start | Agent | active |
| **active** | Agent is working on the job | Agent | review |
| **review** | Agent submitted work, Reviewer is auditing | Reviewer | approved, flagged, rejected |
| **approved** | PASS — work meets standards, ready to ship | Reviewer | completed |
| **flagged** | FLAG — issues found, agent needs to fix | Reviewer | active (re-assignment) |
| **rejected** | REJECT — work doesn't meet requirements, reassign or close | Reviewer | pending (reassign) or closed |
| **completed** | Job finished and shipped | Dispatch | (end state) |
| **closed** | Job cancelled or abandoned | Dispatch | (end state) |

### Job Structure

```json
{
  "job_id": "JOB-0047",
  "created_at": "2026-04-15T14:32:00Z",
  "priority": "P1",
  "status": "active",
  
  "objective": "Write a Quickstart guide for MultiDeck",
  "summary": "5-minute walkthrough for users",
  "description": "Create docs/QUICKSTART.md. Cover: clone, init, configure voice, create first agent, launch dashboard.",
  
  "assigned_to": "architect",
  "assigned_at": "2026-04-15T14:33:00Z",
  "started_at": "2026-04-15T14:35:00Z",
  
  "expected_duration_hours": 2,
  "actual_duration_hours": null,
  
  "o_frame": {
    "objective": "Create beginner-friendly 5-minute setup guide",
    "success_criteria": [
      "Users can go from clone to first job in under 5 minutes",
      "All major features introduced (personas, voices, dashboard)",
      "Examples included, tested"
    ],
    "scope": {
      "in": ["Installation", "Configuration", "First job creation", "Dashboard overview"],
      "out": ["Advanced topics", "Full feature deep-dives", "Troubleshooting beyond basics"]
    },
    "assumptions": [
      "Users have Python 3.9+",
      "Users have Node.js 16+",
      "Kokoro is pre-installed"
    ]
  },
  
  "submission": {
    "submitted_at": "2026-04-15T16:32:00Z",
    "results_summary": "Quickstart guide written, tested, ready for review",
    "results_file": "docs/QUICKSTART.md",
    "voice_announcement": "Architect calling: Quickstart guide written and submitted for review",
    "evidence": [
      "File: docs/QUICKSTART.md (STRONG - direct observation)",
      "Tested walkthrough on clean clone (STRONG - hands-on testing)",
      "All 5 steps verified (STRONG - step-by-step confirmation)"
    ]
  },
  
  "review": {
    "reviewed_by": "reviewer",
    "reviewed_at": "2026-04-15T16:45:00Z",
    "decision": "approved",
    "feedback": "Clear, concise, examples work. Ready to ship.",
    "voice_announcement": "Reviewer calling: Quickstart approved and ready for production"
  },
  
  "tags": ["documentation", "onboarding", "high-visibility"],
  "dependencies": []
}
```

---

## Job Lifecycle

### 1. Create (Dispatch or User)

```bash
python scripts/job-board.py create \
  --agent "architect" \
  --priority "P1" \
  --summary "Write Quickstart guide" \
  --description "5-minute walkthrough from clone to first job"
```

This:
- Generates a unique job ID (JOB-0001, JOB-0002, etc.)
- Sets status to `pending`
- Records creation timestamp
- Appends to `state/job-board.json`

### 2. Assign (Dispatch)

```bash
python scripts/job-board.py assign \
  --job-id "JOB-0047" \
  --agent "architect"
```

This:
- Updates status to `assigned`
- Records assigned agent
- Records assignment timestamp
- (Optional) Posts an announcement: "Job 0047 assigned to Architect"

### 3. Start (Agent)

Agent opens the job, reads the objective and description, begins work:

```bash
python scripts/job-board.py status \
  --job-id "JOB-0047" \
  --status "active"
```

This:
- Updates status to `active`
- Records start timestamp
- Agent works on task

### 4. Submit (Agent)

When work is complete, agent submits for review:

```bash
python scripts/job-board.py submit \
  --job-id "JOB-0047" \
  --results "Quickstart guide written and tested" \
  --results-file "docs/QUICKSTART.md" \
  --evidence "[file read, tested walkthrough, verified steps]"
```

This:
- Updates status to `review`
- Records submission timestamp
- Stores results summary and evidence
- Triggers voice announcement: "[Agent] calling: [Job] submitted for review"

### 5. Review (Reviewer)

Reviewer reads the submission and makes a decision:

```bash
python scripts/job-board.py review \
  --job-id "JOB-0047" \
  --decision "approved" \
  --feedback "Clear and concise. All steps tested."
```

**Decision options:**
- `approved` — PASS, work meets standards
- `flagged` — FLAG, issues found, agent needs to fix (provide feedback)
- `rejected` — REJECT, work doesn't meet requirements (reassign or close)

This:
- Updates status to `approved`, `flagged`, or `rejected`
- Records reviewer and timestamp
- Stores feedback
- Triggers voice announcement: "Reviewer calling: Job 0047 [approved/flagged]"

### 6a. If Approved → Complete

```bash
python scripts/job-board.py complete \
  --job-id "JOB-0047"
```

This:
- Updates status to `completed`
- Records completion timestamp
- Moves job from active to completed list
- Triggers voice announcement: "Job 0047 marked complete"

### 6b. If Flagged → Re-assign

Agent reads feedback and re-works the job:

```
Reviewer feedback: "Missing examples in voice rules. Add before, after pairs."

Agent re-reads requirement, adds examples, resubmits:

python scripts/job-board.py submit \
  --job-id "JOB-0047" \
  --results "Examples added to VOICE_RULES.md" \
  --evidence "[Before/after code examples, tested pronunciation]"
```

Job re-enters `review` state. Reviewer checks again. If `approved` now, complete. If `flagged` again, can do one more loop (then escalate if not resolved).

### 6c. If Rejected → Close

```bash
python scripts/job-board.py close \
  --job-id "JOB-0047" \
  --reason "Reassigned to different agent"
```

---

## Job Board JSON Schema

**File:** `state/job-board.json`

```json
{
  "meta": {
    "version": 1,
    "last_updated": "2026-04-15T16:45:00Z",
    "total_jobs": 47,
    "pending_count": 3,
    "active_count": 2,
    "review_count": 1,
    "completed_count": 41
  },
  "jobs": [
    { "job object" },
    { "job object" }
  ]
}
```

---

## Priority Levels

| Level | Urgency | SLA |
|-------|---------|-----|
| **P0** | Blocking — work cannot proceed | 1 hour response |
| **P1** | Critical — high visibility, customer-facing | 4 hours response |
| **P2** | Normal — planned work | 1 day response |
| **P3** | Backlog — nice-to-have, deferred | As capacity allows |

---

## Creating Jobs with O-Frames

All jobs should include an O-Frame (see `docs/OQE_DISCIPLINE.md`):

```bash
python scripts/job-board.py create \
  --agent "architect" \
  --priority "P1" \
  --summary "Document OQE discipline" \
  --o-objective "Create comprehensive guide to the OQE methodology" \
  --o-success-criteria "[users understand OQE phases, users can apply OQE to their own work]" \
  --o-scope-in "[OQE phases, examples, application to common tasks]" \
  --o-scope-out "[implementation details of internal tools]"
```

Or paste the O-Frame into the job description field.

---

## Job Queries and Reporting

### View All Jobs

```bash
python scripts/job-board.py list
```

### View Jobs by Status

```bash
python scripts/job-board.py list --status "active"
python scripts/job-board.py list --status "review"
python scripts/job-board.py list --status "completed"
```

### View Jobs by Agent

```bash
python scripts/job-board.py list --agent "architect"
```

### View Jobs by Priority

```bash
python scripts/job-board.py list --priority "P0"
python scripts/job-board.py list --priority "P1"
```

### Job Dashboard Stats

```bash
python scripts/job-board.py stats
```

Output:
```
Job Board Statistics
─────────────────────────
Total jobs: 47
Pending: 3 (6%)
Active: 2 (4%)
In Review: 1 (2%)
Completed: 41 (87%)
Blocked (P0): 0
Average completion time: 3.2 hours
Success rate (approved on first submission): 0.82
```

---

## Job Dependencies

Future feature: Mark job A as blocking job B until A is complete.

```json
{
  "job_id": "JOB-0048",
  "dependencies": ["JOB-0047"],
  "blocked": true
}
```

When JOB-0047 completes, JOB-0048 automatically moves from blocked to pending.

---

## Workflow Rules

1. **All jobs must have an O-Frame** — Define what before you work
2. **Evidence on submission** — Agent cites observations, not guesses
3. **One fix loop max** — Flagged once is OK, flagged twice escalates to Dispatch
4. **Review gate on everything** — No job ships without Reviewer approval
5. **Announcements on state change** — Each major transition triggers TTS

---

## Job Board API

### Python

```python
from job_board import JobBoard

board = JobBoard("state/job-board.json")

# Create
job = board.create(
    agent="architect",
    summary="Task summary",
    description="Full description",
    priority="P1"
)

# Assign
board.assign(job.id, "architect")

# Status
board.status(job.id, "active")

# Submit
board.submit(
    job.id,
    results="What was done",
    results_file="path/to/result",
    evidence=["cite1", "cite2"]
)

# Review
board.review(
    job.id,
    decision="approved",  # or "flagged", "rejected"
    feedback="Reviewer notes"
)

# Complete
board.complete(job.id)

# Close
board.close(job.id, reason="Cancelled")
```

### REST (via Dashboard)

```bash
# Create job
curl -X POST http://localhost:3045/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"agent":"architect","summary":"Task"}'

# Assign
curl -X PATCH http://localhost:3045/api/jobs/JOB-0047 \
  -d '{"assigned_to":"architect"}'

# Submit
curl -X POST http://localhost:3045/api/jobs/JOB-0047/submit \
  -d '{"results":"Done","evidence":"[...]"}'

# Review
curl -X POST http://localhost:3045/api/jobs/JOB-0047/review \
  -d '{"decision":"approved","feedback":"..."}'
```

---

## Troubleshooting

**Job stuck in review:**
- Check Reviewer agenda (may be busy)
- Check feedback on flagged jobs (may need fixes)
- Escalate to Dispatch if waiting >4 hours on P0/P1

**Agent unresponsive:**
- Check if agent session is still running
- Check agent's state for errors
- Reassign job to backup agent if needed

**Job board corrupted:**
- Backup current `state/job-board.json`
- Restore from git if available
- Manually edit to fix corrupt entries

---

## Further Reading

- `docs/OQE_DISCIPLINE.md` — O-Frame structure for jobs
- `docs/REVIEW_WORKFLOW.md` — How Reviewer audits jobs
- `docs/CLAUDE_DISPATCH_INTEGRATION.md` — Voice announcements on state change
