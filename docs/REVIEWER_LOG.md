# OQE 2.0 — Reviewer Log Protocol

> **One-page reference. Canonical source of truth. Do not extend without ratification.**

The Reviewer Log is the system's memory. Every accepted job that later turns out to have been wrong, fragile, or incomplete becomes a *lesson*. Every new job pulls relevant lessons into its context **before work starts**, so the same failure cannot happen twice on the same shape of work.

This document defines the six tenets, the lesson schema, how lessons are matched to new jobs, and the workflow for writing and ratifying them.

---

## 1. The Six Tenets

These are the only six. They were reduced from a longer list. **Do not add a seventh without cross-project ratification.**

| # | Key | Short name | Rule |
|---|---|---|---|
| 1 | T1 | **Problem before Objective** | Define the problem (what's wrong + why it matters) before stating the objective. |
| 2 | T2 | **Criteria before Action** | 5+ specific, observable, traceable success criteria before any implementation step. |
| 3 | T3 | **Confidence before Implementation** | HIGH / MODERATE / LOW rating across bias, completeness, source credibility, and risk — *before* acting. |
| 4 | T4 | **Evidence before Completion** | Every criterion backed by ≥1 STRONG or MODERATE evidence item. No closure on LIMITED-only evidence. |
| 5 | T5 | **Citation before Assertion** | Every criterion cites a linkable section / file path and justifies its chosen standard. |
| 6 | T6 | **Version before Declaration** | Every artifact declares its OQE version before any MET / NOT MET declaration. |

When a lesson is written, it must call out **which tenet(s) were broken and how**. That is the spine of the lesson — the rest is context around it.

---

## 2. Lesson Schema (every field, enforced by the editor)

```jsonc
{
  "id":            "LESSON-NNNN",            // assigned at creation
  "job_id":        "PROJECT-WORKTYPE-NNNN",  // the job this lesson came from
  "created_at":    "ISO-8601 timestamp",
  "status":        "draft | ratified | archived",   // only `ratified` fires on new jobs

  // === detection context ===
  "what_happened":          "Plain-language failure narrative.",
  "noted_at_phase":         "O | Q | E | COMPLETION | POST_ACCEPTANCE",
  "noted_at_gate":          "CREATION | REVIEW | STANDING | NONE",
  "confidence_at_decision": "HIGH | MODERATE | LOW",
  "oqe_path":               true,            // did this run the full O→Q→E flow?

  // === decision-time evidence ===
  "alternatives_considered": "Options on the table at decision time.",
  "criteria_passed": [
    { "criterion": "...", "evidence_strength": "STRONG | MODERATE | LIMITED" }
  ],

  // === the spine — what principles were violated ===
  "tenets_broken": [
    { "tenet": 4, "how": "Specific description of how T4 was violated." }
  ],

  // === abstraction layer ===
  "root_cause": "The abstract failure mode — not 'this bug', but 'this CLASS of mistake'.",
  "applies_to": "Prose generalization of the future work-shape at risk.",

  // === retrieval keys (machine-matchable) ===
  "applies_to_tags":   ["governance", "negative-property", "..."],
  "matches_worktypes": ["FIX", "FEAT"],   // [] = applies to all worktypes

  // === the actionable payload ===
  "mitigations": [
    "Concrete mitigation 1 — written as an instruction the next agent can follow.",
    "Concrete mitigation 2.",
    "Concrete mitigation 3."
  ]
}
```

### Field rules

- **≥1 tenet broken**, each with a non-empty `how`.
- **≥3 mitigations**, each at least one full sentence, and **actionable** (a future agent can follow them without further interpretation).
- **`root_cause` and `applies_to` must be abstract** — if they only describe the specific job, the lesson cannot be matched against new work. Generalize.
- **`applies_to_tags` is the matching key.** Be specific and re-use existing tags where possible.
- **`status: "draft"` lessons do NOT fire** on new jobs. A lesson is invisible to the system until ratified.

---

## 3. Lesson-Lifecycle Phases

| Phase | Meaning |
|---|---|
| `O` | Caught while drafting the **Objective** (problem definition). |
| `Q` | Caught while assigning **Confidence** ratings. |
| `E` | Caught while gathering **Evidence**. |
| `COMPLETION` | Caught at the completion gate (final review before close). |
| `POST_ACCEPTANCE` | Caught after the job closed — these are the **most expensive** lessons and the highest-priority to ratify. |

---

## 4. Matcher — How Lessons Surface on New Jobs

When a job is opened in the dashboard, the matcher runs against ratified lessons:

```
Score = (tag overlap on applies_to_tags  × 3)
      + (transitive tags via source job  × 1)
      + (worktype match                  × 2)
      + (universal — no worktype filter  × 0.5)
      + (same project                    × 0.5)

→ ranked descending, top 5 surface
→ each match shows WHY it matched (reason chips)
→ top-2 mitigations surface inline; rest available on the lesson detail page
```

- **Deterministic.** Same input → same ranked output.
- **Debuggable.** Every match exposes its score components.
- **Read-only at match time.** The lesson is not modified by being matched — it is referenced.

A v2 semantic-similarity layer is tracked separately. It will *blend* with — not replace — the v1 hybrid score.

---

## 5. Ratification Workflow

A lesson becomes `ratified` only when:

1. **Schema valid** — all required fields, ≥1 tenet, ≥3 mitigations.
2. **Generalizable** — `root_cause` and `applies_to` are abstract enough to match future work.
3. **Reviewed** — a second agent (not the lesson author) confirms the mitigations are actionable and non-redundant.
4. **Published** — `status` flipped to `ratified`. From this moment, the lesson fires on matching jobs.

Drafts are persistent and visible in the Reviewer Log, but the system treats them as private notes until ratified.

---

## 6. Write-a-Lesson Checklist

Before you click SAVE on a draft lesson, verify:

- [ ] **What happened** is a *narrative*, not a bug report. Tells a story, names the decision point.
- [ ] **At least one tenet broken** is specified, with a concrete `how`.
- [ ] **Root cause is a class of mistake**, not the specific bug. Re-write until "this could happen on any job that ___".
- [ ] **Applies-to tags are reusable.** If you invent a tag, search existing tags first.
- [ ] **Three mitigations**, each *actionable by the next agent without interpretation*. Vague mitigations ("be more careful") are not mitigations.
- [ ] **Confidence at decision** is honestly recorded. If it was MODERATE and you treated it as HIGH, say so.
- [ ] **Phase noted at** is correct, especially POST_ACCEPTANCE.

---

## 7. Pattern Detector (read-only telemetry)

The Pattern Detector view shows cross-job trends across all ratified lessons:

- **Tenet break trends** — which principles are most-violated, ranked.
- **Phase of detection** — distribution across O / Q / E / COMPLETION / POST_ACCEPTANCE. A heavy POST_ACCEPTANCE bar means the front-loaded gates are failing.
- **Worktype × tenet heatmap** — shows which kinds of work tend to break which principles. Used to scope guardrails.
- **Top applies-to tags** — most-cited problem domains.
- **Open-job coverage** — every open job ranked by total prior-lesson score. Unprotected jobs (no matching lessons) are flagged red.

This view is **read-only**. It does not modify lessons or jobs.

---

## 8. Self-Improvement Loop — End to End

```
  Job posted
     │
     ▼
  Drawer opens → matcher fires → PRIOR LESSONS panel renders
     │             (top-2 mitigations packed into context)
     ▼
  Agent accepts job, runs O → Q → E
     │
     ▼
  Submitted for review
     │
     ▼
  Reviewer ratifies / rejects / flags
     │
     ▼
  IF the work later proves wrong / fragile:
     → write a draft lesson
     → cite tenets broken
     → write 3+ mitigations
     → second agent reviews
     → ratify
     │
     ▼
  Lesson now fires on every future matching job. Loop closed.
```

---

## 9. Project-by-Project Notes

This protocol is **cross-project**. Every project that uses OQE 2.0 reads from this same document. Project-specific deviations (extra tenets, extra phases) are *not permitted* without ratification at the cross-project level.

**Adopting projects** must:

1. Vendor or symlink this document into their repo at `docs/REVIEWER_LOG.md`.
2. Wire their job-board data shape to include `tags` and `id: "PROJECT-WORKTYPE-NNNN"` so the matcher works.
3. Implement the Reviewer Log + Pattern Detector views, or import them.

---

## 10. Versioning

- **Document version: 2.0.0**
- **Schema version: lesson@1.0** (backwards-compatible additions only without bump)
- **Matcher version: hybrid@1.0** (semantic@2.0 tracked as MULTIDECK-FEAT-0055)

Any breaking change to schema, matcher, or tenet count requires a major-version bump and a cross-project meeting to ratify.
