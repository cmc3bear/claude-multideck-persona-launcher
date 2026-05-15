# MultiDeck Examples

This directory contains example use cases and workflows for MultiDeck.

---

## Example 1: Simple Documentation Project

**Scenario:** Write a README and API documentation for a new module.

**Agents Involved:**
- Architect (design structure, write README)
- Engineer (provide technical details)
- Reviewer (quality gate)

**Jobs:**
1. JOB-0001: Architect writes README skeleton
2. JOB-0002: Engineer provides API details
3. JOB-0003: Architect integrates and finalizes
4. Reviewer audits and approves

**Duration:** 2-4 hours

**Voice Announcements:**
- "Architect calling. README drafted."
- "Engineer reporting. API details provided."
- "Architect calling. Documentation complete and submitted for review."
- "Reviewer calling. Documentation approved for publication."

---

## Example 2: Feature Development with Tests

**Scenario:** Implement a new feature with full test coverage.

**Agents Involved:**
- Architect (design spec)
- Engineer (implement + test)
- Reviewer (quality gate)

**Jobs:**
1. JOB-0010: Architect writes feature specification
2. JOB-0011: Engineer implements feature
3. JOB-0012: Engineer adds tests (90%+ coverage)
4. Reviewer approves

**Success Criteria (OQE):**
- All acceptance criteria met
- No failing tests
- 90%+ code coverage
- No unhandled errors

**Duration:** 4-8 hours

**Typical FLAG Scenario:**
- Engineer submits with 85% coverage
- Reviewer: "Need 90%+ coverage. Add tests for error paths."
- Engineer adds tests, resubmits
- Reviewer approves

---

## Example 3: Research and Feasibility Study

**Scenario:** Assess whether technology X is suitable for use case Y.

**Agents Involved:**
- Researcher (investigate and grade sources)
- Architect (architectural implications)
- Reviewer (quality gate)

**Jobs:**
1. JOB-0020: Researcher evaluates technology X (pros/cons, feature matrix, licensing)
2. Reviewer audits evidence grading
3. Reviewer approves
4. Architect may create follow-up job if adoption is recommended

**Evidence Quality:**
- STRONG: Official documentation, benchmarks, published papers
- MODERATE: Expert opinions, industry patterns, case studies
- LIMITED: Vendor claims, blog posts, anecdotal evidence

**Duration:** 1-2 days

---

## Example 4: Commercial Production Script → Video

**Scenario:** Produce a tutorial video from a script.

**Workflow:**
1. JOB-0030: Engineer (or Researcher) writes draft script
2. JOB-0031: Architect reviews script for clarity and completeness
3. JOB-0032: Researcher produces video (screen recordings, narration, editing)
4. JOB-0033: Reviewer QA gate (production quality check)
5. Final review by stakeholder

**Dependencies:**
- JOB-0031 blocks JOB-0032 (can't produce without approved script)
- JOB-0033 blocks final review

**Duration:** 2-3 days

**Voice Announcements:**
- "Engineer calling. Script drafted for review."
- "Architect calling. Script approved for production."
- "Researcher calling. Video produced and submitted for QA."
- "Reviewer calling. Video approved for distribution."

---

## Example 5: Bug Fix with Regression Tests

**Scenario:** Fix a reported bug and add regression tests.

**Agents Involved:**
- Engineer (reproduce, fix, test)
- Reviewer (verify fix, check for regressions)

**Jobs:**
1. JOB-0040: Engineer reproduces bug (creates test case that fails)
2. JOB-0041: Engineer fixes bug (test now passes)
3. JOB-0042: Engineer adds regression test (prevents re-occurrence)
4. Reviewer approves

**Evidence:**
- Before: Test fails (bug reproduced)
- After: Test passes (bug fixed)
- Regression: New test ensures this bug can't resurface

**Duration:** 1-3 hours

**O-Frame Example:**
```
Objective: Fix authentication failure when JWT expires
Success Criteria:
  - Expired JWT properly rejected (test passes)
  - User redirected to login (manual verification)
  - Regression test added to prevent re-occurrence
  - Build passes, no new failures
Evidence:
  - Error logs showing the original issue (STRONG)
  - Code review of fix (STRONG)
  - Test results: 247 pass, 0 fail (STRONG)
  - Regression test coverage (STRONG)
Confidence: HIGH
```

---

## Example 6: Cross-Project Coordination

**Scenario:** Two projects need to coordinate on a shared interface.

**Agents:**
- Project A: Architect, Engineer
- Project B: Architect, Engineer
- Coordinator: Dispatch

**Workflow:**
1. JOB-0050: Project A Architect defines interface spec
2. Dispatch routes to Project B for review/feedback
3. JOB-0051: Project B Architect reviews and provides feedback
4. JOB-0052: Project A Engineer implements
5. JOB-0053: Project B Engineer implements their side
6. Reviewer (both projects) approves
7. Dispatch marks both teams as coordinated

**Duration:** 3-5 days

---

## Workflows to Explore

- **Parallel Development:** Multiple agents working simultaneously on different aspects
- **Dependent Jobs:** One job blocks another until complete
- **Escalation:** Job flagged twice, escalated to Dispatch
- **Stakeholder Review:** Commercial production with final sign-off
- **Research + Implementation:** Researcher finds solution, Engineer implements, Reviewer verifies

---

## Tips for Success

1. **Be specific with O-Frames** — Vague objectives lead to rework
2. **Cite evidence** — Don't assume; verify and document
3. **Grade sources** — STRONG/MODERATE/LIMITED helps Reviewer assess confidence
4. **Keep job board clean** — Archive completed jobs to avoid clutter
5. **Use voice announcements** — They keep everyone in the loop without constant screen-watching
6. **One fix loop** — Flag once, escalate if the same issue persists
7. **Respect scope** — Stay within lane boundaries

---

## More Examples

As you use MultiDeck, document your own workflows and add them here. Each example teaches the team patterns that work.

---

## Further Reading

- `docs/JOB_BOARD.md` — How jobs flow
- `docs/OQE_DISCIPLINE.md` — Objective, Qualitative, Evidence
- `docs/REVIEW_WORKFLOW.md` — Review process
- `docs/COMMERCIAL_PRODUCTION.md` — Production workflow
