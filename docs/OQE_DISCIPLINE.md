<!--
oqe_version: 2.0
spec_source: state/oqe-version.json
governs: OQE_DISCIPLINE.md is the canonical source artifact cited in job criteria as §N
last_updated_by: Dispatch alignment pass 2026-04-20
-->

# OQE Discipline: Objective, Qualitative, Evidence

**OQE** is the core decision-making framework for all work in MultiDeck. It systematizes how tasks are defined, confidence is assessed, and evidence is collected before implementation.

> **OQE 2.0** (codename: Rigor) — enforced since 2026-04-20. Key changes from 1.0: mandatory problem statement, minimum 5 criteria with source-cited artifacts, PROJECT-WORKTYPE-#### job IDs, explicit dependency tracking, per-criterion §N citations. See §11-§14 below and `state/oqe-version.json` for the full capability matrix.

The acronym stands for **Objective → Qualitative → Evidence** — the logical flow of structured decision-making.

---

## §1 — Why OQE?

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

## §2 — Phase 1: OBJECTIVE

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

## §3 — Phase 2: QUALITATIVE

### What It Is

Before you act, assess your **confidence level** given what you know and don't know.

### Confidence Levels

| Level | Range | Meaning | Action |
|-------|-------|---------|--------|
| **HIGH** | >0.85 | Strong evidence. Critical gaps filled. Safe to proceed. | Proceed |
| **MODERATE** | 0.60–0.85 | Some evidence. Known gaps. Proceed with documented caveats. | Proceed with conditions |
| **LOW** | <0.60 | Insufficient evidence. Major gaps. Gather more before acting. | Do not proceed |

### How to Assess

**Bias check:** Am I favoring this approach because it's familiar, or because the evidence supports it? Have I considered alternatives?

**Completeness check:** Do I have evidence for all success criteria? Are there success criteria I haven't investigated yet?

**Source credibility:** Is my evidence from direct observation (STRONG) or inferred (MODERATE/LIMITED)? Is there contradictory evidence I'm ignoring?

**Risk assessment:** What could go wrong if my assessment is wrong? What's the cost of being wrong?

---

## §4 — Phase 3: EVIDENCE

### What It Is

Collect **specific, cited observations** that inform your decision. Tag each piece of evidence with its strength.

### Evidence Strength

| Strength | Definition | Example |
|----------|------------|---------|
| **STRONG** | Direct observation from running code, reading files, checking systems | Read the error log, saw the stack trace; ran the test suite, all passed |
| **MODERATE** | Inferred from related evidence, documented patterns, secondary sources | Documentation says X; similar modules follow this pattern |
| **LIMITED** | Single source, unverified, or assumption-based | One user reported this; vendor claims this works |

### How to Collect

1. **Read the actual state** — Don't guess. Read the code, check the logs, run the commands.
2. **Cite specifically** — "Line 42 of auth.py has an unhandled exception" not "the code has issues"
3. **Tag strength** — Every claim should have a strength tag
4. **Flag gaps** — If you don't have evidence for something, say so
5. **No speculation** — "Insufficient data" is always valid. Guessing is not.

### Evidence must match the criterion verbatim

Evidence is valid only when it directly observes what the criterion states — no inferential bridging, no "similar files do this." If the reviewer has to assume anything to accept the evidence, the evidence is insufficient. See §11 for the full rule.

Source: `oqe-version.json` capabilities.source_artifact_citation

---

## §5 — Applying OQE to Common Tasks

| Task Type | O (Objective) | Q (Qualitative) | E (Evidence) |
|-----------|---------------|------------------|--------------|
| **Bug Investigation** | Root cause the failure. Success: single identified cause + fix verification. | Reproducible case? Can run locally? MODERATE in staging, HIGH with production logs. | Error logs (STRONG), user reports (LIMITED), past issues (MODERATE), code review (STRONG). |
| **Architecture Decision** | Choose between options. Success: decision documented with tradeoffs. | Know scaling requirements? Talked to ops? MODERATE if clear, LOW if fuzzy. | Team experience (MODERATE), benchmarks (STRONG if local), cost analysis (MODERATE-STRONG). |
| **Research Task** | Evaluate tool X for use case Y. Success: pros/cons + recommendation. | Tested it? Talked to users? MODERATE if hands-on, LOW if just reading. | Hands-on trial (STRONG), testimonials (MODERATE), vendor matrix (LIMITED). |
| **Scheduling Decision** | Schedule deep work block. Success: 4+ hours, no conflicts, protected. | Checked calendar? Asked dependencies? HIGH if yes. | Calendar check (STRONG), agent confirmation (STRONG), no meetings (STRONG). |

---

## §6 — Review Checklist

Before submitting work for review, the job author walks this checklist. This is self-attestation, not a test — it is the author's conscience document. Actual verification happens at the enforcement points described in §14.

The **Enforced At** column shows where each item is also independently checked, so the author knows which items are on the honor system and which will be machine-verified or reviewer-verified.

| Self-Check Item | Enforced At |
|-----------------|-------------|
| **Objective clear** — Someone reading the O-Frame knows exactly what you tried to accomplish | Review gate |
| **Success criteria observable** — Each criterion can be verified without guessing | Creation gate + review gate |
| **Scope boundaries explicit** — What you did and didn't do are clear | Review gate |
| **Confidence assessed** — HIGH/MODERATE/LOW stated with rationale | Review gate |
| **Evidence cited** — Every major claim references a source | Review gate |
| **Criteria cite a named artifact** — Each criterion links a specific file + section/line, not a generic standard | Creation gate + review gate |
| **Criterion justifies its chosen standard** — States why the cited artifact governs this specific condition | Review gate |
| **Evidence directly observes the criterion** — No assumption bridging; reviewer needs no mental leap to accept it | Review gate |
| **Evidence strength tagged** — STRONG/MODERATE/LIMITED on each piece | Review gate |
| **Gaps acknowledged** — Missing evidence is called out explicitly | Creation gate + review gate |
| **No speculation** — Every conclusion is grounded in evidence | Review gate |
| **Alternatives considered** — Why this solution won | Creation gate + review gate |
| **Reviewable** — Someone else can follow your reasoning and reproduce findings | Review gate |

Every item on this list is enforced at a downstream gate. Rules without any gate — if any remain — are explicitly tracked in §14.

---

## §7 — OQE in the Reviewer Gate

**Reviewer** agents use OQE to audit completed jobs.

### Auto-Redline Trigger

Gate 2 (Review Gate) is triggered **automatically** when a job reaches `submitted` status. The review runs as a **sub-process of the original job**, not a separate job. No manual intervention is required to initiate review.

**Flow:**

1. Job status transitions to `submitted`
2. Auto-Redline review spawns as a sub-process of the submitting job
3. The Redline sub-agent runs the §14 Gate 2 checks (see below)
4. **PASS** → job auto-closes, dependent jobs unblock, SSE pushes status update to mobile
5. **FLAG** → one fix loop → re-review → if still failing, **FAIL-ESCALATE** to user

The review command is queued via `launch-queue.json` when the status change is detected. The review prompt template lives at `dispatch/scripts/redline-review-prompt.md`.

### Review Audit Points

The Reviewer checks five OQE audit points on every job:

1. Does the O-Frame match the job description? — *(Objective check)*
2. Is the confidence assessment justified? — *(Qualitative check)*
3. Is all evidence cited and strength-tagged? — *(Evidence check)*
4. Are there unsubstantiated claims? — *(Gaps check)*
5. Would you approve this work with the same evidence? — *(Sanity check)*

If all five pass: **PASS**. If not: **FLAG** with specific feedback.

The project reviewer (human or senior agent) retains final determination of validity — auto-Redline accelerates the process but does not replace judgment authority.

---

## §8 — Common Mistakes

**Mistake 1: Confusing Objective with Subjective**
- Wrong: "The code should be clean"
- Right: "Reduce cyclomatic complexity below 5 in the auth module (currently 12)"

**Mistake 2: Skipping Qualitative Assessment**
- Wrong: State confidence only after finishing
- Right: Assess before you start — it informs what evidence you need

**Mistake 3: Assuming Evidence**
- Wrong: "The test suite passes" (not verified)
- Right: "I ran the test suite locally; 247 tests passed, 0 failed" (observed directly)

**Mistake 4: Confusing Strength Tags**
- STRONG = "I did this" · MODERATE = "Docs say this" · LIMITED = "Someone told me this"

**Mistake 5: Ignoring Contradictory Evidence**
- Wrong: Omit contradictions
- Right: Acknowledge them and explain why one is stronger

---

## §9 — OQE at Scale

| Task Size | O-Frame | Qualitative | Evidence |
|-----------|---------|-------------|----------|
| **Small** (1-2 hours) | Brief, inline | Quick HIGH/MOD/LOW | 3-5 key observations |
| **Large** (days) | Documented in job | Detailed + risk analysis | Full bibliography with tags |
| **Complex** (architecture, go/no-go) | Formal doc | Scoring matrix / confidence intervals | Multiple sources + decision tree |

---

## §10 — Version Requirements Overview

### OQE 1.0 — Foundation (Released)

Established the core discipline: Problem → Objective → Criteria → Qualitative Assessment → Evidence. Introduced the problem statement field, recommended minimum 5 criteria, and created the reviewer gate workflow. All capabilities are **recommended practices** — the system supports them but does not enforce them.

### OQE 2.0 — Rigor (In Progress)

Converts recommendations into **enforced requirements**. Nothing from 1.0 is removed — 2.0 raises the floor.

---

## §11 — OQE 2.0 Enforced Requirements

**Mandatory Problem Statement.** Every job MUST have a `problem` field. 1.0 introduced it; 2.0 rejects jobs that omit it.

**Minimum 5 Testable Criteria — Enforced.** Jobs with fewer than 5 testable success criteria are rejected at creation. Hard gate, not a guideline.

**Source Artifact Citation on Every Criterion.** Each criterion must cite the specific named artifact — file path and section or line — against which it is measured. "Per OQE 2.0 standards" is not a valid citation: the standard must be named (e.g. `OQE_DISCIPLINE.md §5`, `oqe-version.json capabilities.problem_statement_enforced`, `PERSONA_SYSTEM.md callsign_announcements`). If a criterion references a standard it cannot link to, the criterion itself is rejected.

Examples:
- "All personas announce callsign before acting" — *per PERSONA_SYSTEM.md §3 callsign_announcements*
- "Job board tracks problem, objective, and criteria fields" — *per oqe-version.json capabilities.problem_statement*
- "Evidence strength tagged on every claim" — *per OQE_DISCIPLINE.md §4 Phase 3*

### Citation must be linkable — no generic standards

A criterion that cites "OQE 2.0 standards" or "the governance doc" without naming the specific file and section is rejected at creation. The cited artifact must exist, be reachable by path, and contain the rule the criterion is measuring against. Reviewers verify the link before verifying the evidence.

**Why:** In a previous instance a criterion claimed compliance with "OQE 2.0" but linked no artifact. The criterion was unverifiable, the evidence rested on assumption, and the review had to reject the job after implementation. This rule closes that gap at creation time, not review time.

Source: `oqe-version.json` capabilities.source_artifact_citation · lessons-learned

### Evidence must match the criterion — no assumption bridging

Evidence is valid only if it directly observes the condition the criterion states. Evidence that requires an inferential step — "the file probably does X because similar files do" — does not satisfy the criterion. If the criterion says "line 42 throws on null input," the evidence must cite line 42 and show the throw; a test suite passing elsewhere is not a substitute.

Operational test: a reviewer should be able to read the criterion, read the evidence, and conclude pass/fail without filling in any gaps of their own. If the reviewer has to assume, the evidence is insufficient.

Source: `OQE_DISCIPLINE.md §4` — No speculation · lessons-learned

### Criterion must justify its chosen standard

Citing an artifact is not enough — the criterion must state **why** that artifact is the governing standard for this specific condition. A criterion that links PERSONA_SYSTEM.md without explaining the relevance is treated the same as an uncited criterion: rejected.

The "why" has to connect the criterion's subject to the cited rule. Example:

- **Weak:** "All personas announce callsign before acting" — per PERSONA_SYSTEM.md §3
- **Strong:** "All personas announce callsign before acting — per PERSONA_SYSTEM.md §3 callsign_announcements, which defines callsign discipline as a prerequisite for voice isolation; this criterion exists because the persona agent under review operates across multiple projects and must preserve isolation."

Reviewers verify the justification holds: does the cited rule actually govern the criterion's subject, or was it name-dropped? If the link doesn't hold, the criterion is rejected.

Source: `oqe-version.json` capabilities.source_artifact_citation · lessons-learned

**Standardized Job Numbering.** Four-digit JOBTYPE-0001 format. Freeform IDs no longer accepted. See §13 for full specification.

**Explicit Dependency Tracking.** Jobs declare dependencies; dependencies rendered visibly. A job cannot start if dependencies are unresolved.

**Per-Project Impact Evaluation.** No blanket rollout — each project opts in after an impact evaluation assesses readiness, migration cost, and workflow support.

### Adoption Gate — Evaluation Job Rules

The three in-flight evaluation jobs (WS-0057, PLANEX-0056, MULTI-0055) added operational rules that govern how a project gets onto 2.0. These are enforced on the evaluation job itself — before any code changes ship.

**Binary compliance verdict, per component.** Every artifact that touches OQE gets a single compliant / non-compliant verdict, tested against every capability in the `oqe-version.json` capabilities array — not a narrative assessment. Partial credit is not a verdict.

Source: WS-0057 · PLANEX-0056 · MULTI-0055 criteria 2

**Verbatim evidence with file path + line number.** Every finding must quote the artifact verbatim and cite file path and line number. Hypothetical, assumed, or paraphrased findings are rejected. If a claim cannot be grep-verified against the actual codebase, it does not count.

Source: WS-0057 criterion 6 · MULTI-0055 criterion 6 · PLANEX-0056 criterion 4

**Itemized change list for every non-compliant artifact.** Non-compliance is not a flag — it is a work order. Each non-compliant artifact must ship with file path, line number, current text, and required replacement text. "Needs updating" is not an acceptable finding.

Source: PLANEX-0056 · MULTI-0055 criterion 3

**Dependency-ordered implementation plan.** The plan must sequence upgrades so that no step depends on a component that has not been upgraded by a prior step. Reviewers reject plans that introduce a dependency before its prerequisite is in place.

Source: WS-0057 criterion 4 · MULTI-0055 criterion 5

**Backward-compatibility proof.** The evaluation must prove that existing v1.0 jobs — missing the problem field or carrying fewer than 5 criteria — will not break parsing, display, or pipeline execution under the proposed changes. No silent breakage of in-flight work.

Source: WS-0057 criterion 5

**Named-workflow risk assessment with mitigations.** Risk is not a paragraph. The evaluation must name every specific workflow where v1.0 capability enforcement could break an in-flight job, paired with a concrete mitigation for each. Generic risk statements ("migration may be disruptive") do not satisfy this rule.

Source: PLANEX-0056 criterion 6

**Per-command CLI verdict on job-creating tools.** Tools that create or validate jobs (e.g. `job-board.py`) get a per-command verdict on whether each command enforces the problem field and the 5-criteria minimum. One overall verdict for the tool is not sufficient.

Source: MULTI-0055 criterion 4

### Comparison: 1.0 vs 2.0

| Capability | 1.0 (Foundation) | 2.0 (Rigor) |
|---|---|---|
| Problem statement | Introduced, optional | Mandatory — rejected without it |
| Minimum 5 criteria | Recommended | Enforced at creation |
| Source citation | Not required | Specific artifact + section/line + justification |
| Job numbering | Freeform | PROJECT-WORKTYPE-#### standardized format |
| Dependencies | Implicit | Explicitly declared + rendered |
| Adoption model | System-wide | Per-project impact evaluation |
| Compliance verdict | Narrative review | Binary, per-component, per-capability |
| Evidence format | Cited observation | Verbatim quote + file path + line number |
| Non-compliance output | Flagged for follow-up | Itemized change list — current + required text |
| Implementation order | Loose | Dependency-sequenced — no step before its prereq |
| Backward compatibility | Assumed | Proven — v1.0 jobs must still parse and run |
| Risk assessment | Narrative | Named workflow + concrete mitigation per risk |
| CLI tool review | Tool-level verdict | Per-command verdict on enforcement |
| Evidence-criterion fit | Reviewer judgment | Direct observation only — no assumption bridging |

Version tracking: `dispatch/state/oqe-version.json`

---

## §12 — Version Declaration

Every artifact governed by OQE — jobs, state files, persona agents, governance docs — must declare which OQE version it complies with. Without an explicit declaration, a reviewer cannot tell whether an artifact is stale, in-migration, or current.

### Declaration Field

Every versioned artifact carries an `oqe_version` field. The value is the version the artifact was authored or last verified against, stated as three digits: MAJOR.MINOR.PATCH.

```json
{
  "oqe_version": "2.0.0",
  "oqe_version_verified": "2026-04-20",
  "oqe_version_verified_by": "reviewer"
}
```

### Artifact Types & Where the Field Lives

| Artifact | Where `oqe_version` lives | Who sets it |
|----------|--------------------------|-------------|
| Job entries | Top-level field on each job record in `job-board.json` | Job creator; reviewer verifies |
| State files | `meta.oqe_version` at root of the JSON | Schema owner |
| Persona agents | Front-matter field in the agent markdown | Persona author; architect verifies |
| Governance docs | Header block at top of the doc | Doc owner |
| CLI tools | Constant in source; surfaced via `--version` | Tool owner |

### No artifact without a version

Any OQE-governed artifact missing `oqe_version` is treated as non-compliant regardless of its content. The field is the minimum precondition for review — without it, the reviewer has no baseline to evaluate against.

Source: `oqe-version.json` · this document §12

### Version declaration must match actual compliance

An artifact declaring `oqe_version: 2.0` must pass every 2.0 capability check. A false declaration — claiming 2.0 while missing mandatory fields — is a harder failure than declaring 1.0 honestly. Reviewers verify the declaration against the capabilities in `oqe-version.json` before accepting the artifact.

Source: `oqe-version.json` capabilities arrays

### Version Numbering — MAJOR.MINOR.PATCH

OQE follows a three-digit version scheme. The bump level states the scope of change; reviewers and tool authors use it to decide whether artifacts need re-verification.

| Digit | Position | Bump When | Effect on Artifacts |
|-------|----------|-----------|---------------------|
| **MAJOR** | First (X.0.0) | Breaking change — a capability that was recommended becomes enforced, or an accepted artifact shape becomes invalid. 1.0 → 2.0 is a MAJOR bump (problem statement moved from recommended to enforced). | All artifacts must be re-verified. Non-compliant artifacts enter STALE or UNDECLARED. |
| **MINOR** | Second (2.X.0) | Additive, backward-compatible — a new capability, a new optional field, a new enforcement gate that only tightens in a new direction without invalidating prior artifacts. | Existing artifacts remain compliant. New artifacts should target the new MINOR. No forced re-verification. |
| **PATCH** | Third (2.0.X) | Clarification, wording fix, example correction, or bug fix that does not change what passes or fails. | No artifact impact. No re-verification needed. |

### Bump Decision Examples

| Change | Bump | Why |
|--------|------|-----|
| Problem statement becomes mandatory (was optional) | MAJOR | Existing compliant artifacts become non-compliant |
| New `supersedes` field added as optional | MINOR | Additive, no existing artifact breaks |
| `reviewer-review.py` now runs actual test suites (previously narrative) | MINOR | Capability added; prior review passes remain valid |
| Rename capability `minimum_5_criteria` → `minimum_5_criteria_enforced` in docs and tooling | PATCH (if behavior identical) / MAJOR (if tooling reads the old name) | Check whether any consumer depends on the old name |
| Fix a typo in the rejection message for missing problem field | PATCH | Cosmetic; no rule change |
| Add new WORKTYPE `SECURITY` to registered list | MINOR | New accepted value; existing IDs still valid |
| Remove `RESEARCH` WORKTYPE | MAJOR | Existing `*-RESEARCH-####` IDs become invalid |

### Pre-release versions

A MAJOR or MINOR in progress uses a `-pre` suffix until the capabilities array is frozen: `2.0.0-pre`, `2.1.0-pre`. Artifacts may declare a `-pre` version, but they are not eligible for CURRENT status until the suffix is dropped.

Source: this document §12

### The bump level is defended in the version entry

Every new version added to `oqe-version.json` must include a `bump_rationale` field stating why it is MAJOR, MINOR, or PATCH. The rationale is reviewed with the same rigor as any OQE criterion — a MINOR that should have been MAJOR is a compliance hazard because it skips re-verification.

Source: this document §12

### Migration States

| State | Declaration | Meaning |
|-------|-------------|---------|
| **CURRENT** | `oqe_version` = current version | Verified against the latest capabilities. No action needed. |
| **STALE** | `oqe_version` = prior version | Honest but outdated. Scheduled for migration. |
| **IN-MIGRATION** | `oqe_version` + `oqe_version_migrating_to` | Upgrade in progress. Partial compliance acceptable with a dated deadline. |
| **UNDECLARED** | Field missing | Non-compliant by default. Blocks review. |

### Version Bump Triggers

An artifact's `oqe_version` is re-bumped when:

- A new MAJOR OQE version is released — forced re-verification
- A new MINOR OQE version is released and the artifact opts in to the new capabilities
- The artifact is materially edited — edits require re-verification, not a free ride on the prior declaration
- A reviewer finds the declaration false; the field is demoted to the actual compliance level
- A PATCH bump in OQE itself does not require artifact re-bump — artifacts automatically roll forward on the PATCH digit.

Canonical versions: `dispatch/state/oqe-version.json`

---

## §13 — Job ID Specification

Every job ID follows the format `PROJECT-WORKTYPE-####`. Freeform IDs are rejected at creation under OQE 2.0.

### Format

```
PROJECT-WORKTYPE-####

PROJECT   Which project owns the job (uppercase, short code)
WORKTYPE  Kind of work being done (uppercase, short code)
####      Four-digit zero-padded sequence, unique within PROJECT-WORKTYPE
```

Examples:
- `MULTI-OQE-0001` — First OQE work item in MultiDeck
- `WS-INFRA-0042` — Infrastructure fix #42 in the Dispatch workspace
- `PLANEX-DOC-0007` — Documentation update in Planex-Core

### PROJECT Codes

| Code | Project |
|------|---------|
| `WS` | Workspace / Dispatch infrastructure |
| `MULTI` | MultiDeck |
| `PLANEX` | Planex-Core |

New projects register a code before their first job. No ad-hoc codes.

### WORKTYPE Codes

| Code | Work Type | Use When |
|------|-----------|----------|
| `INFRA` | Infrastructure | Pipelines, state files, dashboards, deployment |
| `FEAT` | Feature | New capability or surface area |
| `FIX` | Bug fix | Correcting defective behavior |
| `DOC` | Documentation | Governance, READMEs, agent specs |
| `OQE` | OQE governance | Evaluations, rule changes, compliance migrations |
| `RESEARCH` | Research / evaluation | Scoping, feasibility, tool assessment |
| `DESIGN` | Design | UX, visual design, architecture decisions |

### Four-digit sequence, zero-padded, scoped to PROJECT-WORKTYPE

The sequence resets per PROJECT-WORKTYPE pair. `MULTI-FIX-0001` and `WS-FIX-0001` can both exist — they are different counters. Jobs are created with the next available number in their counter; IDs are never reused or renumbered.

Source: `oqe-version.json` capabilities.standardized_job_numbering

### IDs are immutable once issued

A job's ID never changes — not on reassignment, not on re-scoping, not on reclassification. If the work type changes materially, the job is closed and a new job is issued under the correct WORKTYPE with an explicit back-reference in the `supersedes` field.

Source: this document §13

### Active legacy IDs migrate to 2.0 standards

Any job that is pending, accepted, or in_progress at 2.0 cutover is renamed to `PROJECT-WORKTYPE-####`. The original four-digit sequence is preserved; only the WORKTYPE is inserted. Example: `WS-0057` becomes `WS-INFRA-0057`. The original ID is retained on the record as `legacy_id` for traceability, and the migration is logged with old→new mapping.

Migration workflow:
1. Dispatch proposes the new ID based on the job's content and tags — selects the PROJECT code (already present) and a WORKTYPE from the registered list (§13).
2. Assigned persona verifies/updates the proposal. If the proposed WORKTYPE mis-classifies the work, the persona edits it before acknowledgement.
3. Reviewer validates the final choice against the actual work scope. An incorrect WORKTYPE at this gate is flagged and returned to the assigned persona.
4. Cross-references inside other active jobs are updated to the new ID during migration. References to closed jobs keep the old ID.

Source: this document §13 · `oqe-version.json` v2.0 migration

### Closed and archived jobs keep their historical IDs

Jobs already in `done`, `closed`, or `archived` state at cutover are not renamed. They keep their original freeform IDs and render with a `LEGACY` tag. History is not rewritten — the record of what was done, as it was done, is preserved.

Source: this document §13

### Rejection Examples

| ID | Verdict | Why |
|----|---------|-----|
| `fix-the-thing` | REJECT | Freeform, no PROJECT, no WORKTYPE, no sequence |
| `MULTI-42` | REJECT | Missing WORKTYPE; sequence not zero-padded to 4 |
| `MULTI-BUG-42` | REJECT | `BUG` is not a registered WORKTYPE; use `FIX`. Sequence not zero-padded. |
| `MULTI-FIX-0042` | ACCEPT | Registered project, registered work type, four-digit sequence |

---

## §14 — Enforcement Gates

OQE discipline is only as strong as the points at which it is tested. §6 is an author self-check — trust-based. This section enumerates the gates that actually test jobs against the rules, independent of what the author claims.

A job passes through three gates: **creation**, **review**, and **standing**. Each gate owns a specific set of checks. If a check has no gate, it lives on the honor system — and that is explicitly named in §6.

### Gate 1: Creation Gate

**Owner:** `job-board.py` (or whatever tool creates a job).
**Runs:** At job creation, before the job is written to `job-board.json`.
**Failure mode:** Hard reject — the job is not created.

| Check | Rule | Capability |
|-------|------|------------|
| Problem field present and non-empty | §11 | `problem_statement_enforced` |
| Minimum 5 testable criteria | §11 | `minimum_5_criteria_enforced` |
| Every criterion cites a named artifact (file + section/line) | §11 | `source_artifact_citation` |
| Cited artifact exists and is reachable by path | §11 | `source_artifact_citation` |
| Job ID matches `PROJECT-WORKTYPE-####` format | §13 | `standardized_job_numbering` |
| PROJECT and WORKTYPE codes are registered | §13 | `standardized_job_numbering` |
| Sequence is four-digit, zero-padded, next available | §13 | `standardized_job_numbering` |
| Declared `oqe_version` is present | §12 | — |
| Declared dependencies resolve to existing jobs | §11 | `dependency_tracking` |
| Gaps-acknowledged field present and non-empty | §4 | — |
| Alternatives-considered field present and non-empty | §6 | — |

### Gate 2: Review Gate (Auto-Triggered)

**Owner:** `reviewer-review.py` (Reviewer agent), spawned automatically as a sub-process.
**Runs:** Automatically when job status transitions to `submitted`. The review is queued via `launch-queue.json` and runs as a sub-process of the original job — no separate review job is created.
**Trigger:** Status change to `submitted` → auto-Redline spawn → §14 Gate 2 checks.
**Failure mode:** Returns FLAG with specific feedback; one fix loop max. If the fix loop fails, FAIL-ESCALATE to user.
**PASS flow:** Job auto-closes, dependent jobs unblock, SSE pushes status to connected clients (including mobile).
**Prompt template:** `dispatch/scripts/redline-review-prompt.md`

| Check | Rule |
|-------|------|
| Each criterion has at least one evidence item mapped to it | §4 |
| Every evidence item carries a STRONG / MODERATE / LIMITED tag | §4 |
| Each criterion's justification actually connects the cited artifact to the subject | §11 |
| Evidence directly observes the criterion — no assumption bridging | §11 |
| Confidence level stated with rationale (HIGH / MODERATE / LOW) | §3 |
| Gaps and contradictory evidence acknowledged, not hidden | §4, §8 |
| Alternatives-considered field present and substantive (not boilerplate) | §6, §8 |
| Declared `oqe_version` matches actual compliance with that version's capabilities | §12 |
| Completion gate restates each criterion with its evidence citation | §4, §7 |

### Gate 3: Standing Gate

**Owner:** Dashboard renderers and morning pipeline.
**Runs:** Continuously, on every render of a job record.
**Failure mode:** Non-compliant jobs are visibly flagged; they do not silently pass.

| Check | Rule |
|-------|------|
| Job record carries `oqe_version`; missing field renders as `UNDECLARED` | §12 |
| Stale-version jobs render with their declared version and a migration state | §12 |
| Legacy-ID jobs render with a `LEGACY` tag | §13 |
| Unresolved dependencies render visibly — job is shown as blocked | §11 |
| Problem statement renders on every job card — not collapsed behind a click | §11 |

### If a rule has no gate, it is on the honor system

Any rule in this document that is not tested at one of the three gates is trust-based by default. §6 names those items explicitly. Do not assume a rule is enforced because the doc says it — look for the gate.

Source: this document §14

### Gate failures are logged, not silenced

Every rejection at the creation gate and every flag at the review gate is written to a log with the job ID, the failing check, and the author. The log is reviewable — patterns of failure drive rule revisions and training, not just individual fixes.

Source: this document §14

### Per-Rule Gate Matrix

| Rule | Creation | Review | Standing |
|------|----------|--------|----------|
| Problem statement mandatory | ✕ | ✕ | ✕ |
| Minimum 5 criteria | ✕ | ✕ | — |
| Criteria cite named artifact | ✕ | ✕ | — |
| Criterion justifies chosen standard | — | ✕ | — |
| Evidence observes criterion directly | — | ✕ | — |
| Evidence strength tagged | — | ✕ | — |
| Confidence stated with rationale | — | ✕ | — |
| PROJECT-WORKTYPE-#### ID format | ✕ | — | ✕ |
| Declared `oqe_version` present | ✕ | ✕ | ✕ |
| Dependencies resolve and render | ✕ | — | ✕ |
| Gaps acknowledged | ✕ | ✕ | — |
| Alternatives considered | ✕ | ✕ | — |

---

## §15 — The Six Tenets (canonical short form)

The fourteen sections above expand into the full discipline. The **six tenets** are the canonical short form — the spine. They are the only six. Reduced from a longer list. **Do not add a seventh without cross-project ratification.**

| # | Key | Short name | Rule | Maps to |
|---|---|---|---|---|
| 1 | T1 | **Problem before Objective** | Define the problem (what's wrong + why it matters) before stating the objective. | §2 |
| 2 | T2 | **Criteria before Action** | 5+ specific, observable, traceable success criteria before any implementation step. | §2, §11 |
| 3 | T3 | **Confidence before Implementation** | HIGH / MODERATE / LOW rating across bias, completeness, source credibility, and risk — *before* acting. | §3 |
| 4 | T4 | **Evidence before Completion** | Every criterion backed by ≥1 STRONG or MODERATE evidence item. No closure on LIMITED-only evidence. | §4 |
| 5 | T5 | **Citation before Assertion** | Every criterion cites a linkable section / file path and justifies its chosen standard. | §11 |
| 6 | T6 | **Version before Declaration** | Every artifact declares its OQE version before any MET / NOT MET declaration. | §12 |

When a lesson is written (see §16), it must call out **which tenet(s) were broken and how**. That is the spine of the lesson — the rest is context around it.

---

## §16 — Reviewer Log & Lesson Capture Protocol

The Reviewer Log is the system's memory. Every accepted job that later turns out to have been wrong, fragile, or incomplete becomes a **lesson**. Every new job pulls relevant lessons into its context **before work starts**, so the same failure cannot happen twice on the same shape of work.

The full protocol — lesson schema, lifecycle phases, matcher algorithm, ratification workflow, write-a-lesson checklist, pattern detector, and self-improvement loop diagram — lives in **`docs/REVIEWER_LOG.md`** as the one-page canonical reference. It is not duplicated here.

### Why the lesson protocol is folded into OQE

OQE 2.0 produces well-framed jobs but cannot, by itself, prevent the *same kind of mistake from recurring across jobs*. Lessons close that loop. They are the institutional memory layer that sits underneath the six tenets — when a tenet is broken in production work and only caught later, a lesson is written, ratified, and from that moment forward fires on every matching new job.

### Cross-references

- **Schema validity** is enforced at the editor level; see `docs/REVIEWER_LOG.md` §2 for the full field list.
- **Ratification gate** parallels the §14 review gate but operates on lessons rather than jobs.
- **Matcher** is deterministic and read-only; same input produces same ranked output (see `docs/REVIEWER_LOG.md` §4).
- **Pattern Detector** surfaces cross-job tenet-violation trends and is the telemetry side of OQE — used to scope new guardrails (see `docs/REVIEWER_LOG.md` §7).

### Adopting projects

Per `docs/REVIEWER_LOG.md` §9, any project using OQE 2.0 must vendor or symlink the Reviewer Log doc into its own `docs/` folder, wire its job-board data shape to include `tags` and `id: "PROJECT-WORKTYPE-NNNN"` so the matcher works, and implement (or import) the Reviewer Log + Pattern Detector views.

---

## Further Reading

- `docs/REVIEWER_LOG.md` — Reviewer Log Protocol: six tenets short form, lesson schema, matcher, pattern detector, self-improvement loop
- `docs/PERSONA_SYSTEM.md` — How personas apply OQE
- `docs/REVIEW_WORKFLOW.md` — How Reviewer uses OQE gates
- `docs/JOB_BOARD.md` — How jobs include O-Frames

OQE is a practice. The more you use it, the faster and more natural it becomes. Start with small tasks and build the habit.
