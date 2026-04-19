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

Define **what** you are trying to accomplish and **how you will prove it's done**. The Objective answers: *what are we doing?* The success criteria answer: *how will we prove it's done?*

### The Minimum 5-Criteria Rule

Every Objective **must include a minimum of 5 success criteria** that function as a test plan. Fewer than 5 is not acceptable — it means the work hasn't been defined precisely enough.

Each criterion must be:

- **Specific** — someone else could verify it independently without asking you for clarification
- **Observable** — measurable or checkable, not subjective ("works correctly" is not observable)
- **Traceable** — maps to a specific piece of evidence that will prove it was met

### The O-Frame

Write this at the start of every task:

```
O-FRAME:
  Objective: [one sentence describing the goal]
  Success Criteria (minimum 5 — each must be specific, observable, traceable):
    1. [specific, observable condition]
    2. [specific, observable condition]
    3. [specific, observable condition]
    4. [specific, observable condition]
    5. [specific, observable condition]
  Scope:
    In:  [what you will do]
    Out: [what you will not do]
  Assumptions: [list of assumptions the task depends on]
```

### Bad Criteria — Explicitly Rejected

These are not testable. Any job submitted with criteria like these will be **flagged by Reviewer**:

| Bad (untestable) | Why it fails | Rewrite it as |
|---|---|---|
| "briefing looks good" | Subjective — depends on who's looking | "Briefing covers all 5 sections defined in the job description, each 2–4 sentences" |
| "covers the important stuff" | Undefined — what's important? | "Briefing mentions all 3 project blockers by name, with a status per blocker" |
| "works correctly" | No observable check defined | "Command runs without error on Node 20, exits code 0, output contains 'ready'" |
| "documentation is clear" | Reader-dependent and vague | "Documentation has a worked example for each of the 3 main functions" |
| "looks professional" | Entirely subjective | "Follows the heading / body / code-block format used in existing docs" |

If you catch yourself writing criteria like these, stop and rewrite them before continuing.

### Example: Code Review (5 criteria)

```
O-FRAME:
  Objective: Review the authentication module and approve or flag for fixes
  Success Criteria:
    1. All exported function signatures have JSDoc comments (verified by reading each export)
    2. No unhandled error paths — every try/catch either re-throws or logs (verified by code scan)
    3. Test coverage >= 80% for this module (verified by running coverage report)
    4. All 7 items on the security checklist verified and checked off (verified by walking checklist)
    5. No direct DB calls outside the repository layer (verified by grep for db.query in auth/)
  Scope:
    In:  Code review, security audit, test coverage check
    Out: Refactoring, performance optimization, design changes
  Assumptions:
    - Current test suite passes before review starts
    - Branch is up to date with main
```

### Example: Research Task (5 criteria)

```
O-FRAME:
  Objective: Assess whether [technology X] is suitable for [use case Y]
  Success Criteria:
    1. Pros and cons documented — minimum 3 items each, not overlapping (verified in output doc)
    2. Feature gap analysis completed against our 8 required features (verified by matrix)
    3. Licensing terms confirmed from the vendor's actual license file, not a summary (verified by URL)
    4. At least 2 reference implementations evaluated — real projects, not toy demos (verified by links)
    5. Cost estimate includes one-time and recurring components, sourced from vendor pricing page (verified by URL)
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

Before you act, assess your **confidence level** given what you know and don't know. The Qualitative phase now explicitly walks each criterion: *does this approach actually satisfy all 5+ criteria?*

### Confidence Levels

| Level | Range | Meaning | Action |
|-------|-------|---------|--------|
| **HIGH** | >0.85 | Strong evidence. Critical gaps filled. Safe to proceed. | Proceed |
| **MODERATE** | 0.60–0.85 | Some evidence. Known gaps. Proceed with documented caveats. | Proceed with conditions |
| **LOW** | <0.60 | Insufficient evidence. Major gaps. Gather more before acting. | Do not proceed |

### How to Assess

**Walk each criterion:**
- For each of your 5+ criteria: does the planned approach actually satisfy it?
- Which criteria are hardest to meet? Which are trivial?
- Are there criteria you can't satisfy with the current approach? That's a blocker, not a gap.

**Bias check:**
- Am I favoring this approach because it's familiar, or because the evidence supports it?
- Have I considered alternatives?

**Completeness check:**
- Do I have evidence for all success criteria, or am I planning to find it during execution?
- Are there criteria I haven't investigated yet?

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

Criteria Walk:
  Criterion 1 (unit tests pass): STRONG — ran locally, 134 passed, 0 failed
  Criterion 2 (security audit clean): STRONG — audit complete, no critical issues
  Criterion 3 (load test shows 10x headroom): STRONG — ran k6 locally, results saved
  Criterion 4 (staging matches production schema): MODERATE — staging is similar but not identical
  Criterion 5 (migration tested on prod data copy): MODERATE — tested on 2-week-old snapshot
  Criterion 6 (rollback procedure documented): NOT YET — gap, must address before proceed

Known Gaps:
  - Criterion 6 missing — rollback doc doesn't exist yet
  - Real customer load patterns unknown
  - Edge cases with concurrent transactions untested

Alternatives Considered:
  - Gradual rollout: Slower, but reduces risk. Requires feature flag.
  - Full launch: Faster, but higher risk given gap in criterion 6.

Confidence: MODERATE (0.68)
Rationale: Strong evidence for correctness and performance under normal conditions. 
Criterion 6 is an open gap — task cannot close until it's addressed.
Recommend: Document rollback procedure, then re-assess before launch.
```

---

## Phase 3: EVIDENCE

### What It Is

Collect **specific, cited observations** that prove each criterion was met. Every criterion must have at least one corresponding evidence item. The mapping must be explicit — not implied.

### Evidence Strength

| Strength | Definition | Example |
|----------|------------|---------|
| **STRONG** | Direct observation from running code, reading files, checking systems | Read the error log, saw the stack trace; ran the test suite, all passed; verified calendar availability directly |
| **MODERATE** | Inferred from related evidence, documented patterns, secondary sources | Documentation says X; similar modules follow this pattern; error message matches known issue #123 |
| **LIMITED** | Single source, unverified, or assumption-based | One user reported this; similar project blog post suggests; vendor claims this works |

### The 1:1 Mapping Rule

Every criterion from the Objective must have **at least one STRONG or MODERATE evidence item** proving it was met. A criterion backed only by LIMITED evidence is not closed — it is still open.

When collecting evidence, think: "which criterion does this piece of evidence prove?"

### How to Collect Evidence

1. **Read the actual state** — Don't guess. Read the code, check the logs, run the commands.
2. **Cite specifically** — "Line 42 of auth.py has an unhandled exception" not "the code has issues"
3. **Tag strength** — Every claim should have a strength tag
4. **Flag gaps** — If you don't have evidence for something, say so
5. **No speculation** — "Insufficient data" is always valid. Guessing is not.

### Example Evidence Collection

**Task:** Verify if the job board is processing jobs correctly

**Criteria → Evidence mapping:**

```
Criterion 1 (completion rate >= 90%):
  STRONG: Ran `job-board.py status` — output shows 0.92 completion rate over last 7 days

Criterion 2 (no jobs stuck > 24h):
  STRONG: Read job-board.json — oldest pending job timestamp is 3h ago (no stuck jobs)

Criterion 3 (all agents reporting heartbeat):
  STRONG: Checked /api/stats — all 4 agents reporting heartbeat in last 5 minutes

Criterion 4 (queue depth < 50 pending):
  STRONG: Read job-board.json — 47 jobs in pending, within threshold

Criterion 5 (dashboard load time < 2s):
  MODERATE: Checked browser devtools on last open — 1.8s, but not re-tested on slow network
```

**Gaps:**
- Insufficient data on root cause of 47 pending jobs (are they stuck or just queued?)
- Criterion 5 is MODERATE — should be re-tested under realistic network conditions

**Conclusion:**
- Job board is functioning nominally (92% completion rate, no stuck jobs)
- Queue depth is within acceptable range
- Performance criterion partially met — flag for further testing

---

## Phase 4: COMPLETION GATE

Before declaring a task complete, walk through this gate explicitly. This is not optional.

```
COMPLETION GATE:

Criterion 1: [restate criterion]
  Evidence: [specific cite]
  Strength: STRONG / MODERATE / LIMITED
  Status: MET / NOT MET

Criterion 2: [restate criterion]
  Evidence: [specific cite]
  Strength: STRONG / MODERATE / LIMITED
  Status: MET / NOT MET

[... repeat for all criteria ...]

Completion decision:
  - All criteria MET with STRONG or MODERATE evidence → COMPLETE
  - Any criterion NOT MET or backed only by LIMITED evidence → NOT COMPLETE (reopen)
```

A task is **not complete** if any criterion has only LIMITED evidence or no evidence. "I believe this is met" without a cite is a gap, not evidence.

---

## Applying OQE to Common Tasks

### Bug Investigation

| Phase | What You Do |
|-------|------------|
| **O** | Objective: Root cause the login failure. 5 criteria: reproducible case defined, root cause identified, fix implemented, test covering the bug added, regression verified in staging. |
| **Q** | Does the approach satisfy all 5? Walk each: can I reproduce in staging (yes/no)? Do I have log access (yes/no)? | 
| **E** | Criterion→Evidence: Error logs (STRONG) for root cause; test run (STRONG) for fix; staging deploy (STRONG) for regression. |

### Architecture Decision

| Phase | What You Do |
|-------|------------|
| **O** | Objective: Choose between monolith and microservices. 5 criteria: scaling requirements documented, team experience assessed, cost analysis complete, migration path defined, decision rationale written. |
| **Q** | Walk each: do I know scaling requirements (MODERATE if documented, LOW if fuzzy)? Have I talked to ops? |
| **E** | Team experience (MODERATE); benchmarks (STRONG if run, LIMITED if from blogs); cost (MODERATE if estimated, STRONG if vendor quotes). |

### Research Task

| Phase | What You Do |
|-------|------------|
| **O** | Objective: Evaluate tool X for use case Y. 5 criteria: hands-on trial completed, pros/cons with 3+ items each, licensing confirmed from source, 2+ reference implementations reviewed, cost estimate sourced. |
| **Q** | Have I tested it? Is my licensing source authoritative? Walk each criterion. |
| **E** | Hands-on trial (STRONG); user testimonials (MODERATE); licensing from vendor docs (STRONG if direct read, LIMITED if from summary). |

### Scheduling Decision

| Phase | What You Do |
|-------|------------|
| **O** | Objective: Schedule deep work block. 5 criteria: block is 4+ hours, no conflicts in calendar, all dependencies confirmed available, work is pre-defined, block is protected from interruptions. |
| **Q** | Did I check the calendar? Did I confirm dependencies? Walk each. |
| **E** | Calendar free-time check (STRONG); confirmation from dependent agents (STRONG); no meetings within 2 hours (STRONG). |

---

## Review Checklist: Is This OQE-Compliant?

Before submitting work for review, check:

- [ ] **Objective clear** — Someone reading my O-Frame knows exactly what I tried to accomplish
- [ ] **Minimum 5 success criteria** — Fewer than 5 is a rejection, not a flag
- [ ] **Criteria are specific** — Each could be verified independently without asking me
- [ ] **Criteria are observable** — No "looks good", "works correctly", or "covers the important stuff"
- [ ] **Criteria are traceable** — Each maps to a specific evidence item
- [ ] **Scope boundaries explicit** — What I did and didn't do are clear
- [ ] **Qualitative walked all criteria** — I assessed whether my approach satisfied each one
- [ ] **Confidence assessed** — I stated HIGH/MODERATE/LOW and explained why
- [ ] **Evidence cited** — Every criterion has a corresponding evidence item
- [ ] **Evidence strength tagged** — STRONG/MODERATE/LIMITED on each piece
- [ ] **No criterion closes on LIMITED evidence alone**
- [ ] **Gaps acknowledged** — If I don't have evidence for something, I said so
- [ ] **Completion Gate completed** — Criteria restated with evidence and status
- [ ] **No speculation** — Every conclusion is grounded in evidence
- [ ] **Alternatives considered** — If applicable, I explored why this solution won

---

## OQE in the Reviewer Gate

**Reviewer** agents use OQE to audit completed jobs:

1. **Does the O-Frame have a minimum of 5 criteria?** — Fewer than 5 is an automatic FLAG
2. **Are all criteria specific, observable, and traceable?** — Vague criteria are an automatic FLAG regardless of count
3. **Does the Qualitative walk each criterion?** — (Qualitative check)
4. **Does every criterion have STRONG or MODERATE evidence?** — LIMITED-only criteria are open, not closed
5. **Is the Completion Gate present and complete?** — Every criterion restated with evidence and status
6. **Are there unsubstantiated claims?** — (Gaps check)

If all six pass: **PASS**. If not, **FLAG** with specific feedback (see `docs/REVIEW_WORKFLOW.md`).

---

## Common Mistakes

**Mistake 1: Fewer than 5 criteria**
- Wrong: 2–3 vague bullet points
- Right: 5+ specific, observable, traceable conditions — think of them as your test plan

**Mistake 2: Vague criteria**
- Wrong: "The code should be clean"
- Right: "Cyclomatic complexity < 5 in the auth module (currently 12, confirmed by complexity report)"

**Mistake 3: Criteria without evidence mapping**
- Wrong: Criterion listed in O-Frame, no corresponding evidence collected
- Right: Every criterion has at least one STRONG or MODERATE evidence item with a specific cite

**Mistake 4: Skipping the Completion Gate**
- Wrong: "Done" without walking each criterion
- Right: Explicit gate — restate criterion, cite evidence, grade strength, declare MET/NOT MET

**Mistake 5: Skipping Qualitative Assessment**
- Wrong: State confidence only after finishing
- Right: Assess before you start — walk each criterion against your approach

**Mistake 6: Assuming Evidence**
- Wrong: "The test suite passes" (not verified)
- Right: "I ran the test suite locally; 247 tests passed, 0 failed" (observed directly)

**Mistake 7: Closing on LIMITED Evidence**
- Wrong: "User reported it works — criterion met"
- Right: Limited evidence is a gap, not a close. Get STRONG or MODERATE before declaring done.

---

## OQE at Scale

For **small tasks** (1–2 hour jobs):
- O-Frame: 5 criteria minimum, 1–2 minutes to write
- Qualitative: Quick walk of each criterion (HIGH / MODERATE / LOW)
- Evidence: Cite one item per criterion, strength-tagged
- Completion Gate: Brief — one line per criterion

For **large projects** (days of work):
- O-Frame: 5–10 criteria, documented in job description
- Qualitative: Detailed assessment with risk analysis per criterion
- Evidence: Full bibliography with strength tags, one-to-one with criteria
- Completion Gate: Formal document

For **complex decisions** (architecture, go/no-go calls):
- O-Frame: 5+ formal criteria — treat as an acceptance test suite
- Qualitative: Scoring matrix or confidence intervals per criterion
- Evidence: Multiple sources, decision tree, alternatives analysis
- Completion Gate: Formal sign-off with evidence trails

---

## Further Reading

- `docs/PERSONA_SYSTEM.md` — How personas apply OQE
- `docs/REVIEW_WORKFLOW.md` — How Reviewer uses OQE gates
- `docs/JOB_BOARD.md` — How jobs include O-Frames

OQE is a practice. The more you use it, the faster and more natural it becomes. Start with small tasks and build the habit.
