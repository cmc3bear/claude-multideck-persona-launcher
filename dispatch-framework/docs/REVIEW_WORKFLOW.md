# Review Workflow: Review Gate and Quality Standards

**Reviewer** is the quality gate agent. Every completed job passes through Reviewer before shipping.

This document describes the review process, decision criteria, feedback loops, and escalation paths.

---

## Auto-Redline Review Methodology

As of OQE 2.0, the review gate is triggered **automatically** when a job reaches `submitted` status. Review is no longer a manually initiated step — it runs as a **sub-process of the original job**, not a separate job.

### How Auto-Review Works

1. **Trigger:** When a job's status transitions to `submitted`, a review command is automatically queued via `launch-queue.json`.
2. **Sub-process spawn:** The Redline review spawns as a sub-process of the submitting job. No separate review job is created — the review is part of the original job's lifecycle.
3. **Gate 2 checks:** The Redline sub-agent runs all §14 Gate 2 checks from `OQE_DISCIPLINE.md` against the submitted work.
4. **PASS flow:** Job auto-closes, all dependent jobs unblock, and SSE pushes the status update to connected clients (including mobile devices).
5. **FLAG flow:** The submitting agent gets one fix loop. After the fix, the Redline sub-agent re-reviews. If it still fails: **FAIL-ESCALATE** to user. No further automated loops.
6. **Review prompt:** The review prompt template lives at `dispatch/scripts/redline-review-prompt.md`.

### What Didn't Change

The project reviewer (human or senior agent) retains **final determination of validity**. Auto-Redline accelerates the mechanical review process but does not replace judgment authority. The five-gate review criteria, the one-fix-loop rule, and the escalation protocol all remain intact.

---

## Auto-Redline Queue Markers

When `scripts/job-board.py submit <job_id> --output <path>` runs successfully, the CLI writes a queue marker file at `state/pending-reviews/{job_id}.json`. The marker is the hand-off contract between the submitting agent and the (possibly out-of-process) Redline reviewer. Without it, the gate is silently optional — the operator has no idea which jobs are waiting.

### Lifecycle

1. **Created on submit.** `cmd_submit()` writes the marker file *after* the status transition is persisted. If the submit gate rejects (job not found, etc.), no marker is written.
2. **Consumed by the reviewer.** An operator or watcher dispatch agent reads the marker, populates the Redline prompt template at `dispatch/scripts/redline-review-prompt.md`, and runs the review.
3. **Removed on review.** `cmd_review()` removes the marker on both `--pass` and `--flag` paths. Missing-marker is not an error (idempotent).

### Marker File Shape

Each marker is a single JSON object. Field list, with the source field on the job record:

| Key | Source | Notes |
|---|---|---|
| `job_id` | `job.id` | The PROJECT-WORKTYPE-#### identifier. |
| `board_key` | derived from `--project` | `multideck`, `oqe-labs`, etc. `default` for unscoped. |
| `oqe_version` | `job.oqe_version` | OQE version declared on the job (§12). |
| `assigned_to` | `job.assigned_to` | The producing agent. |
| `posted_by` | `job.posted_by` | The author (may be empty for legacy jobs). |
| `problem` | `job.problem` | §11 problem statement. |
| `objective` | `job.subject` | The subject line, used as the objective in the prompt. |
| `criteria_count` | `len(job.criteria)` | Number of testable criteria (must be ≥5 under OQE 2.0). |
| `criteria_list` | `job.criteria` | Array of criterion strings, one per gate. |
| `output_path` | from `--output` | Path to the deliverable being reviewed. |
| `submitted_at` | ISO timestamp | UTC, set at submit time. |
| `redline_prompt_template_path` | absolute path | Where the Redline prompt template lives. |

### Spawning the Reviewer

To run a review by hand:

1. `cat state/pending-reviews/<job_id>.json` to see the populated context.
2. Open the prompt template at the `redline_prompt_template_path` field.
3. Substitute the `{{job_id}}`, `{{board_key}}`, `{{problem}}`, `{{objective}}`, `{{criteria_count}}`, `{{criteria_list}}`, etc. placeholders with the marker values.
4. Hand the resulting prompt to a Redline sub-agent.
5. Record the verdict via `python scripts/job-board.py --project <board_key> review <job_id> --pass|--flag --note "<text>"` — this drains the marker.

### .gitignore

Markers themselves are ignored (`state/pending-reviews/*.json`); the directory is tracked via `state/pending-reviews/.gitkeep` so a fresh checkout has the queue location ready.

---

## The Review Process

### Jobs Flow to Review

When an agent submits a job (status transitions to `submitted`):

1. Auto-Redline review spawns as a sub-process (see above)
2. Reviewer reads:
   - Original objective (O-Frame)
   - Agent's submission summary
   - Evidence cited by agent
   - Actual work (file, code, documentation)
3. Reviewer applies review criteria
4. Reviewer makes a decision: PASS, FLAG, or REJECT

### Review Criteria

Reviewer checks **five gates** on every job:

#### Gate 1: Does the Work Match the Objective?

Is what was delivered what was asked for?

- Objective says "Write Quickstart guide"
- Agent submitted "Quickstart guide"
- ✅ PASS

Versus:

- Objective says "Write Quickstart guide"
- Agent submitted "API reference documentation"
- ❌ FLAG / REJECT: Wrong deliverable

#### Gate 2: Is the O-Frame Present and Sound?

Does the agent's work include:
- Objective statement
- Success criteria (observable conditions)
- Scope boundaries (in/out)
- Assumptions

And do they make sense for this work?

**Bad O-Frame:**
```
Objective: "Do the thing"
Success: [empty]
Scope: [not defined]
Assumptions: [none listed]
```

Result: **FLAG** — Ask agent to define success criteria before proceeding.

#### Gate 3: Is All Evidence Cited and Strength-Tagged?

For every major claim, does the agent cite an observation?

**Bad:**
```
"All tests pass" (no citation)
```

**Good:**
```
"All tests pass" (STRONG: ran test suite locally, 247 tests pass, 0 fail)
```

**No evidence for critical requirement:**
```
Objective: "Verify module runs in production"
Submission: "I believe it works"
Evidence: [none]
```

Result: **FLAG** — Agent must verify before approval.

#### Gate 4: Is the Confidence Assessment Justified?

Agent must state confidence (HIGH / MODERATE / LOW) before submitting.

**Unjustified:**
```
Confidence: HIGH
But evidence shows: "Only tested in staging, untested in production, unknown edge cases"
```

Result: **FLAG** — Confidence doesn't match evidence.

#### Gate 5: Are Success Criteria Met?

Go back to the O-Frame. Does the evidence support each success criterion?

**O-Frame success criteria:**
1. All function signatures documented
2. No unhandled error paths
3. Test coverage >80%
4. Security checklist items verified

**Agent's evidence:**
1. ✅ All functions have docstrings (STRONG)
2. ❌ Not verified — no error path audit (LIMITED)
3. ✅ 95% coverage (STRONG)
4. ✅ Security checklist signed off (STRONG)

Result: **FLAG** — Criterion 2 not met. Agent must audit error paths.

---

## Decision Options

### PASS ✅

Work meets all five gates. Ready to ship.

```
Decision: PASS
Feedback: "Clear implementation, all criteria met, ready for production."
```

Consequences:
- Job moves to `completed`
- Agent hears: "Reviewer calling: Job approved and completed"
- **Commit is amended with `Reviewed-by: Reviewer <reviewer@multideck.local>` trailer**
- The pre-push hook (`scripts/pre-push-review-gate.sh`) checks for this trailer and blocks any push that doesn't have it
- Work ships

### FLAG 🚩

Work has fixable issues. Agent addresses and resubmits.

```
Decision: FLAG
Feedback: "Missing examples in voice rules section. Add 2-3 before/after pairs and resubmit."
```

Consequences:
- Job moves back to `active`
- Agent reads feedback
- Agent fixes and resubmits
- Reviewer re-checks (can approve on second look)
- **One fix loop allowed.** If flagged twice on same issues, escalates

### REJECT ❌

Work doesn't meet requirements. Must be redone or reassigned.

```
Decision: REJECT
Feedback: "Objective requires 5-minute walkthrough, but this is 15 minutes. Needs complete rewrite. Reassigning to research agent for different approach."
```

Consequences:
- Job moves to `rejected`
- Dispatch reassigns or closes
- Original agent's work is archived (not lost)

---

## The One-Fix-Loop Rule

Reviewer can flag a job once for fixes. If the same issues appear on resubmission, the job escalates to **Dispatch**.

### Why One Loop?

- Prevents ping-pong cycles
- Forces agent to understand feedback thoroughly
- Ensures escalation for genuine blockers

### Escalation Process

```
Agent submits Job 0047 → Reviewer flags (missing examples)
Agent adds examples, resubmits → Reviewer flags again (examples unclear)
Job escalates to Dispatch → Dispatch reassigns or closes
```

When escalating, Reviewer includes:
- Original objective
- All feedback (first and second review)
- Recommended next step (reassign to different agent, close, defer)

---

## Review Checklist

Before making a decision, Reviewer uses this checklist:

```
GATE 1: Work Matches Objective
- [ ] Deliverable type matches what was asked
- [ ] Scope boundaries respected
- [ ] No out-of-scope extras

GATE 2: O-Frame Present
- [ ] Objective statement clear
- [ ] Success criteria observable and specific
- [ ] Scope in/out explicitly stated
- [ ] Assumptions listed

GATE 3: Evidence Cited and Strength-Tagged
- [ ] Every major claim has a source
- [ ] STRONG evidence for critical decisions
- [ ] No unconfirmed assumptions loading the work
- [ ] Gaps acknowledged

GATE 4: Confidence Justified
- [ ] Agent's confidence level matches evidence quality
- [ ] No HIGH confidence with LIMITED evidence
- [ ] Caveats noted if MODERATE confidence

GATE 5: Success Criteria Met
- [ ] Every success criterion has supporting evidence
- [ ] No "we'll test this later"
- [ ] Acceptance criteria satisfied
```

If all checks pass: **PASS**  
If 1-2 gates fail and are fixable: **FLAG** with specific feedback  
If 3+ gates fail or blocked by external factors: **REJECT** with recommendation

---

## Feedback Template

When flagging or rejecting, use this structure:

```
DECISION: FLAG

ISSUE 1 (Severity: MINOR): [Gate that failed]
Problem: [What's wrong]
Evidence: [What you found]
Fix: [What agent should do]

ISSUE 2 (Severity: MAJOR): [Gate that failed]
Problem: [What's wrong]
Evidence: [What you found]
Fix: [What agent should do]

RESUBMIT: When you've addressed both issues, resubmit.
```

**Severity levels:**
- **MINOR** — Doesn't block approval, but should be fixed (examples, formatting)
- **MAJOR** — Must be fixed before approval (missing evidence, unmet success criteria)
- **CRITICAL** — Makes work unsuitable (wrong deliverable, security issue)

---

## Common Rejection Reasons

### Insufficient Evidence

```
Objective: Verify authentication module works in production
Submission: "Tested in staging, works great"
Feedback: Production verification missing. Requires live environment testing.
```

### Success Criteria Not Met

```
O-Frame success criterion: "Load time <200ms"
Submission evidence: "Average load time 250ms"
Feedback: Does not meet success criteria. Optimize to <200ms or revise success criteria.
```

### Out of Scope

```
Objective: "Fix login button styling"
Submission: Rewrote entire authentication flow
Feedback: Work exceeds scope. Login button styling only. Revert to original scope.
```

### Unclear Feedback

```
Agent's submission: "I think this is good"
Reviewer feedback: Too vague. No evidence. What have you verified? Test results? User feedback?
```

---

## Communication During Review

### Reviewer's Voice

When a job enters review, Reviewer announces:

```
"Reviewer calling. Job 0047 received for review. Auditing now."
```

When decision is made:

**On PASS:**
```
"Reviewer calling. Job 0047 approved. Quickstart guide ready for production."
```

**On FLAG:**
```
"Reviewer flagging. Job 0047 needs fixes. Missing examples in voice rules. See feedback in job board."
```

**On REJECT:**
```
"Reviewer rejecting. Job 0047 out of scope. Needs refocus on core objective."
```

---

## Escalation to Dispatch

If a job is flagged twice or genuinely blocked, Reviewer escalates to Dispatch:

```
Escalated Job: JOB-0047
Agent: Architect
Status: Flagged twice (same issues)
Recommendation: Reassign to Researcher for different approach
Next step: Dispatch to decide
```

Dispatch then:
- Reassigns to different agent (if expertise gap)
- Closes if no longer needed
- Breaks it into smaller jobs
- Assigns to Reviewer for help (if review itself is the blocker)

---

## Metrics and Feedback Loops

Reviewer tracks:

| Metric | Interpretation |
|--------|-----------------|
| Approval rate on first submission | >80% is healthy, <60% suggests unclear job definitions |
| Average time in review | <2 hours for P1, <1 day for P2 |
| Escalation rate | <5% should escalate; >20% suggests process issues |
| Common flag reasons | Top 3 issues to address with team |

These metrics feed back to job board process (clearer O-Frames?) and agent training.

---

## Red Flags (Patterns to Watch)

### Agent Always Confident

```
Every submission: "Confidence: HIGH"
But frequently flagged
```

Means: Agent is overconfident or doesn't understand Qualitative assessment. Needs coaching.

### Reviewer Approves Everything

```
Approval rate: 99%
No flags or rejections
```

Means: Review gate is too loose. Reviewer needs to be more rigorous or team needs clearer criteria.

### Jobs Stuck in Review

```
Many jobs in "review" state for days
```

Means: Reviewer is backlogged or unclear on decisions. Need to unblock or add reviewer capacity.

### Endless Flagging Loops

```
Job flagged 3, 4, 5 times on same issues
```

Means: Feedback isn't clear or agent isn't able to complete. Time to escalate and reassign.

---

## Reviewer Charter

Reviewer's role:

1. **Guard quality** — No bad work ships
2. **Enable agents** — Feedback that helps them improve
3. **Track metrics** — Monitor health of review process
4. **Escalate** — Know when issues need Dispatch attention
5. **Document** — Keep records of all decisions for traceability

Reviewer does NOT:

- Rewrite agent's work (feedback, not implementation)
- Change job objectives mid-review (work with Dispatch if objective is wrong)
- Hold jobs indefinitely (timebox to 2 hours for P0/P1, 1 day for P2)
- Apply different standards to different agents (consistency)

---

## Push Denial Escalation Protocol

When the pre-push hook blocks a commit (missing `Reviewed-by:` trailer), the following escalation protocol is MANDATORY. This is not optional. The agent does not simply add the trailer and retry — the denial is a signal that process broke down, and the breakdown must be investigated.

### Step 1: Full Redline Review

The agent that triggered the denial spawns a Reviewer sub-agent to perform a full review of the commit(s) that were blocked. This is not a rubber stamp — it is the same 6-gate review that should have happened before the commit was created.

The Reviewer checks:
1. Does the work match the job objective?
2. Is OQE evidence cited?
3. Are all claims verified against actual files?
4. No personal data leaks?
5. No security issues?
6. Scope clean, no collateral damage?

### Step 2: Job Documentation Audit

The agent checks the related job(s) on the project board:
- Does the job have a **description** (objective)?
- Does the job have a **result** (evidence of completion)?
- Does the job have **tags**?
- Was the job created BEFORE work started, or retroactively?

If any field is missing, the agent backfills it NOW. No push until the job record is complete.

### Step 3: Persona Alignment Check

The agent reads its own persona file and answers:
- Am I operating within my defined scope?
- Did I follow the Coordination Standards?
- Did I route work correctly (right agent for the task)?
- Why did I skip the Reviewer gate? What was I optimizing for?
- Is the behavior that led to the denial consistent with my persona, or did I drift?

This is documented in a brief alignment note (3-5 sentences, not a full retrospective).

### Step 4: Mini-Retrospective

The agent writes a short retrospective entry:
- **What happened**: one sentence on why the push was denied
- **Root cause**: why the Reviewer gate was skipped
- **Pattern check**: is this a repeat of a known failure? (check previous retrospectives)
- **Mitigation**: what specific action prevents recurrence (not "I will remember" — that already failed)

This entry is appended to the session retrospective file.

### Step 5: Amend and Push

Only after Steps 1-4 are complete:
1. Reviewer adds `Reviewed-by:` trailer to the commit
2. Agent amends the commit with the trailer
3. Push succeeds
4. Job is updated with a note documenting the escalation

### Why This Exists

A push denial means the most fundamental quality gate in the framework was bypassed. If an agent can skip the Reviewer and push anyway (by just adding the trailer), the hook is theater. The escalation protocol ensures the denial triggers actual investigation — not just a retry.

The cost of the escalation (review + documentation + alignment check + retrospective) is deliberately higher than doing it right the first time. This creates an incentive to follow the process rather than trigger the escalation.

---

## Further Reading

- `docs/OQE_DISCIPLINE.md` — What Reviewer is auditing
- `docs/JOB_BOARD.md` — Job lifecycle and state transitions
- `docs/COMMERCIAL_PRODUCTION.md` — Review workflow in commercial production context
