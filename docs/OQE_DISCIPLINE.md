# OQE Discipline: Objective, Qualitative, Evidence

**OQE** is the core decision-making framework for all work in MultiDeck. It systematizes how tasks are defined, confidence is assessed, and evidence is collected before implementation.

The acronym stands for **Objective → Qualitative → Evidence** — the logical flow of structured decision-making.

---

## Why OQE?

Ad-hoc decision-making leads to:
- Scope creep (what are we actually building?)
- Analysis paralysis (when do we have enough information?)
- Rework (discovering requirements after implementation)
- Difficulty in review (no trace of why a decision was made)

OQE fixes this by requiring:
1. **Define what first** — before you research or implement
2. **Assess confidence** — before you act
3. **Cite evidence** — so your work is reviewable

Every task in MultiDeck follows this pattern. No exceptions.

---

## Phase 1: OBJECTIVE

### What It Is

Define **what** you are trying to accomplish, **success criteria** (how you'll know it's done), and **scope boundaries** (what's in and out).

### The O-Frame

Write this at the start of every task:

```
O-FRAME:
  Objective: [one sentence describing the goal]
  Success Criteria:
    - [observable condition 1]
    - [observable condition 2]
    - [observable condition 3]
  Scope:
    In:  [what you will do]
    Out: [what you will not do]
  Assumptions: [list of assumptions the task depends on]
```

### Example: Code Review

```
O-FRAME:
  Objective: Review the authentication module and approve or flag for fixes
  Success Criteria:
    - All function signatures documented
    - No unhandled error paths
    - Test coverage >80%
    - Security checklist items verified
  Scope:
    In:  Code review, security audit, test coverage check
    Out: Refactoring, performance optimization, design changes
  Assumptions:
    - Current test suite passes
    - Branch is up to date with main
```

### Example: Research Task

```
O-FRAME:
  Objective: Assess whether [technology X] is suitable for [use case Y]
  Success Criteria:
    - Pros and cons documented
    - Feature gap analysis completed
    - Cost and licensing verified
    - At least 2 reference implementations evaluated
  Scope:
    In:  Technical evaluation, cost/licensing review, feasibility
    Out: Procurement, negotiation, deployment planning
  Assumptions:
    - Use case requirements are frozen
    - Budget constraints are known
```

---

## Phase 2: QUALITATIVE

### What It Is

Before you act, assess your **confidence level** given what you know and don't know.

### Confidence Levels

| Level | Range | Meaning | Action |
|-------|-------|---------|--------|
| **HIGH** | >0.85 | Strong evidence. Critical gaps filled. Safe to proceed. | Proceed |
| **MODERATE** | 0.60–0.85 | Some evidence. Known gaps. Proceed with documented caveats. | Proceed with conditions |
| **LOW** | <0.60 | Insufficient evidence. Major gaps. Gather more before acting. | Do not proceed |

### How to Assess

**Bias check:**
- Am I favoring this approach because it's familiar, or because the evidence supports it?
- Have I considered alternatives?

**Completeness check:**
- Do I have evidence for all success criteria?
- Are there success criteria I haven't investigated yet?

**Source credibility:**
- Is my evidence from direct observation (STRONG) or inferred (MODERATE/LIMITED)?
- Is there contradictory evidence I'm ignoring?

**Risk assessment:**
- What could go wrong if my assessment is wrong?
- What's the cost of being wrong?

### Example: Feature Approval

```
QUALITATIVE ASSESSMENT:

Objective: Approve the new payment module for production

Evidence Collected:
- STRONG: All unit tests passing (ran locally)
- STRONG: Security audit complete, no critical issues
- STRONG: Load testing shows 10x headroom
- MODERATE: Staging environment similar but not identical to production
- MODERATE: Database migration tested on copy of production data
- LIMITED: No customer feedback yet (pre-launch)

Known Gaps:
- Real customer load patterns unknown
- Edge cases with concurrent transactions untested
- Failure recovery under extreme load untested

Alternatives Considered:
- Gradual rollout: Slower, but reduces risk. Requires feature flag.
- Full launch: Faster, but higher risk.

Confidence: MODERATE (0.72)
Rationale: Strong evidence for correctness and performance under normal conditions. 
Known gaps in extreme failure scenarios and real-world concurrency patterns. 
Recommend gradual rollout with monitoring.
```

---

## Phase 3: EVIDENCE

### What It Is

Collect **specific, cited observations** that inform your decision. Tag each piece of evidence with its strength.

### Evidence Strength

| Strength | Definition | Example |
|----------|------------|---------|
| **STRONG** | Direct observation from running code, reading files, checking systems | Read the error log, saw the stack trace; ran the test suite, all passed; verified calendar availability directly |
| **MODERATE** | Inferred from related evidence, documented patterns, secondary sources | Documentation says X; similar modules follow this pattern; error message matches known issue #123 |
| **LIMITED** | Single source, unverified, or assumption-based | One user reported this; similar project blog post suggests; vendor claims this works |

### How to Collect Evidence

1. **Read the actual state** — Don't guess. Read the code, check the logs, run the commands.
2. **Cite specifically** — "Line 42 of auth.py has an unhandled exception" not "the code has issues"
3. **Tag strength** — Every claim should have a strength tag
4. **Flag gaps** — If you don't have evidence for something, say so
5. **No speculation** — "Insufficient data" is always valid. Guessing is not.

### Example Evidence Collection

**Task:** Verify if the job board is processing jobs correctly

**Evidence:**
- STRONG: Read job-board.json, found 47 jobs in "pending" state, 3 in "active", 12 in "completed" (direct file read)
- STRONG: Ran `job-board.py status`, output shows completion rate 0.92 over last 7 days (direct command execution)
- STRONG: Checked dashboard /api/stats endpoint, all agents reporting heartbeat in last 5 minutes (live API check)
- MODERATE: Engineer reported "jobs seem slow" in Slack (hearsay, not direct observation)
- MODERATE: Similar spike in pending jobs occurred 2 weeks ago before a performance fix (pattern matching)
- LIMITED: Dashboard sometimes feels slow on mobile (subjective perception)

**Gaps:**
- Insufficient data on root cause of 47 pending jobs (are they stuck or just queued?)
- No data on which agents are causing slowdowns
- No timestamp on last job completion

**Conclusion:**
- Job board is functioning nominally (92% completion rate is healthy)
- The 47 pending jobs are likely normal queue behavior, not a failure
- Engineer's perception of slowness may be network lag or personal timing (needs investigation)
- Recommend: Add timestamps to pending jobs, sample 5 jobs to understand queue depth

---

## Applying OQE to Common Tasks

### Bug Investigation

| Phase | What You Do |
|-------|------------|
| **O** | Objective: Root cause the login failure. Success: Single identified cause + fix verification. |
| **Q** | Assess: Do I have a reproducible case? Can I run the code locally? MODERATE confidence if I can reproduce in staging, HIGH if I can see the production logs. |
| **E** | Evidence: Error logs (STRONG), user reports (LIMITED), similar past issues (MODERATE), code review (STRONG). |

### Architecture Decision

| Phase | What You Do |
|-------|------------|
| **O** | Objective: Choose between monolith and microservices. Success: Decision documented with tradeoffs. |
| **Q** | Assess: Do I know the scaling requirements? Have I talked to ops? MODERATE if requirements are clear, LOW if they're fuzzy. |
| **E** | Evidence: Team experience (MODERATE), benchmarks for both approaches (STRONG if run locally, LIMITED if from blogs), cost analysis (MODERATE if estimated, STRONG if vendor quotes). |

### Research Task

| Phase | What You Do |
|-------|------------|
| **O** | Objective: Evaluate tool X for use case Y. Success: Pros/cons list + recommendation. |
| **Q** | Assess: Have I tested it? Have I talked to users? MODERATE if hands-on, LOW if just reading reviews. |
| **E** | Evidence: Hands-on trial (STRONG), user testimonials (MODERATE), feature matrix from vendor (LIMITED). |

### Scheduling Decision

| Phase | What You Do |
|-------|------------|
| **O** | Objective: Schedule deep work block. Success: Block is 4+ hours, has no conflicts, is protected. |
| **Q** | Assess: Did I check the calendar? Did I ask dependencies? HIGH if yes, MODERATE if partial. |
| **E** | Evidence: Calendar free-time check (STRONG), confirmation from dependent agents (STRONG), no meetings within 2 hours (STRONG). |

---

## Review Checklist: Is This OQE-Compliant?

Before submitting work for review, check:

- [ ] **Objective clear** — Someone reading my O-Frame knows exactly what I tried to accomplish
- [ ] **Success criteria observable** — Each criterion can be verified without guessing
- [ ] **Scope boundaries explicit** — What I did and didn't do are clear
- [ ] **Confidence assessed** — I stated HIGH/MODERATE/LOW and explained why
- [ ] **Evidence cited** — Every major claim references a source (file, test, log, etc.)
- [ ] **Evidence strength tagged** — STRONG/MODERATE/LIMITED on each piece
- [ ] **Gaps acknowledged** — If I don't have evidence for something, I said so
- [ ] **No speculation** — Every conclusion is grounded in evidence
- [ ] **Alternatives considered** — If applicable, I explored why this solution won
- [ ] **Reviewable** — Someone else can follow my reasoning and reproduce my findings

---

## OQE in the Reviewer Gate

**Reviewer** agents use OQE to audit completed jobs:

1. **Does the O-Frame match the job description?** — (Objective check)
2. **Is the confidence assessment justified?** — (Qualitative check)
3. **Is all evidence cited and strength-tagged?** — (Evidence check)
4. **Are there unsubstantiated claims?** — (Gaps check)
5. **Would I approve this work with the same evidence?** — (Sanity check)

If all five pass, **PASS**. If not, **FLAG** with specific feedback (see `docs/REVIEW_WORKFLOW.md`).

---

## Common Mistakes

**Mistake 1: Confusing Objective with Subjective**
- Wrong: "The code should be clean"
- Right: "Reduce cyclomatic complexity below 5 in the auth module (currently 12)"

**Mistake 2: Skipping Qualitative Assessment**
- Wrong: State confidence only after finishing
- Right: Assess before you start — it informs what evidence you need to collect

**Mistake 3: Assuming Evidence**
- Wrong: "The test suite passes" (not verified)
- Right: "I ran the test suite locally; 247 tests passed, 0 failed" (observed directly)

**Mistake 4: Confusing Strength Tags**
- STRONG = "I did this" (observed directly)
- MODERATE = "Documentation says this" (pattern matching, secondary source)
- LIMITED = "Someone told me this" (hearsay, single source)

**Mistake 5: Ignoring Contradictory Evidence**
- Wrong: Omit evidence that contradicts your conclusion
- Right: Acknowledge contradictions and explain why one is stronger

---

## OQE at Scale

For **small tasks** (1–2 hour jobs):
- O-Frame: 1–2 minutes
- Qualitative: Quick assessment (HIGH / MODERATE / LOW)
- Evidence: Cite 3–5 key observations

For **large projects** (days of work):
- O-Frame: 15–30 minutes (document in job description)
- Qualitative: Detailed assessment with risk analysis
- Evidence: Full bibliography with strength tags

For **complex decisions** (architecture, go/no-go calls):
- O-Frame: Formal document (1–2 pages)
- Qualitative: Scoring matrix or confidence intervals
- Evidence: Multiple sources, decision tree, alternatives analysis

---

## Further Reading

- `docs/PERSONA_SYSTEM.md` — How personas apply OQE
- `docs/REVIEW_WORKFLOW.md` — How Reviewer uses OQE gates
- `docs/JOB_BOARD.md` — How jobs include O-Frames

OQE is a practice. The more you use it, the faster and more natural it becomes. Start with small tasks and build the habit.
