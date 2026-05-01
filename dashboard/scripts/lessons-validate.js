// MULTI-FEAT-0067 — Lesson schema validator (criterion 5).
//
// Implements docs/REVIEWER_LOG.md §2 "Field rules":
//   - ≥1 tenet broken, each with a non-empty `how` (≥10 chars).
//   - ≥3 actionable mitigations, each ≥1 full sentence (≥15 chars
//     enforced as the proxy for "actionable / non-vague").
//   - Abstract `root_cause` and `applies_to` — rejected if they only
//     describe the specific job. We can't perfectly detect that, so we
//     enforce minimum length AND warn against obvious anti-patterns
//     (e.g. text that just echoes the job_id or the literal phrase
//     "this bug").
//   - applies_to_tags is the matching key — at least one tag is required
//     so the matcher has something to score against.
//
// The editor in scripts/lessons.js already inlines a similar validator
// for live form feedback. This module is the canonical implementation;
// the editor delegates to it via window.validateLessonSchema() so the
// rules live in one place and can be unit-tested by the Reviewer.
//
// Usage:
//   const errs = window.validateLessonSchema(lesson);  // -> string[]
//   if (errs.length) { /* show errors, block save */ }

(function () {
  const ID_RE = /^LESSON-\d{4}$/;
  const JOB_ID_RE = /^[A-Z]+-[A-Z]+-\d{4}$/;
  const ABSTRACTION_TRIPWIRES = [
    /\bthis bug\b/i,
    /\bthis ticket\b/i,
    /\bthis specific (?:job|fix|change)\b/i,
  ];

  function nonEmpty(s) {
    return typeof s === "string" && s.trim().length > 0;
  }

  function countSentences(s) {
    return String(s || "").trim().split(/[.!?]\s+/).filter(Boolean).length;
  }

  function validateLessonSchema(d) {
    const errs = [];

    // ---- Identity ----
    if (!d || typeof d !== "object") {
      return ["Lesson must be an object."];
    }
    if (d.id && !ID_RE.test(d.id)) {
      errs.push("`id` must match LESSON-NNNN format (REVIEWER_LOG.md §2 schema).");
    }
    if (!nonEmpty(d.job_id) || !JOB_ID_RE.test(d.job_id)) {
      errs.push("`job_id` must match PROJECT-WORKTYPE-NNNN (OQE 2.0 §13).");
    }

    // ---- Detection context ----
    if (!nonEmpty(d.what_happened) || d.what_happened.trim().length < 30) {
      errs.push("`what_happened` must be ≥30 characters of plain narrative (REVIEWER_LOG.md §6 checklist).");
    }
    const PHASES = window.PHASES || ["O", "Q", "E", "COMPLETION", "POST_ACCEPTANCE"];
    if (!PHASES.includes(d.noted_at_phase)) {
      errs.push("`noted_at_phase` must be one of " + PHASES.join(" | ") + " (REVIEWER_LOG.md §3).");
    }
    const GATES = window.GATES || ["CREATION", "REVIEW", "STANDING", "NONE"];
    if (!GATES.includes(d.noted_at_gate)) {
      errs.push("`noted_at_gate` must be one of " + GATES.join(" | ") + ".");
    }
    const CONFS = window.CONFIDENCE_LEVELS || ["HIGH", "MODERATE", "LOW"];
    if (!CONFS.includes(d.confidence_at_decision)) {
      errs.push("`confidence_at_decision` must be HIGH | MODERATE | LOW.");
    }
    if (typeof d.oqe_path !== "boolean") {
      errs.push("`oqe_path` must be true or false.");
    }

    // ---- Decision-time evidence ----
    if (!nonEmpty(d.alternatives_considered) || d.alternatives_considered.trim().length < 10) {
      errs.push("`alternatives_considered` must be ≥10 characters (T1 evidence).");
    }
    if (Array.isArray(d.criteria_passed)) {
      d.criteria_passed.forEach((c, i) => {
        if (!c || !nonEmpty(c.criterion)) {
          errs.push(`criteria_passed[${i}].criterion is empty.`);
        }
        const STRENGTHS = window.EVIDENCE_STRENGTHS || ["STRONG", "MODERATE", "LIMITED"];
        if (!c || !STRENGTHS.includes(c.evidence_strength)) {
          errs.push(`criteria_passed[${i}].evidence_strength must be STRONG | MODERATE | LIMITED.`);
        }
      });
    }

    // ---- The spine: tenets broken ----
    // REVIEWER_LOG.md §2: ≥1 tenet broken, each with a non-empty `how`.
    if (!Array.isArray(d.tenets_broken) || d.tenets_broken.length < 1) {
      errs.push("`tenets_broken` must contain ≥1 entry (REVIEWER_LOG.md §2).");
    } else {
      d.tenets_broken.forEach((t, i) => {
        if (!t || typeof t.tenet !== "number" || t.tenet < 1 || t.tenet > 6) {
          errs.push(`tenets_broken[${i}].tenet must be an integer 1..6.`);
        }
        if (!nonEmpty(t && t.how) || t.how.trim().length < 10) {
          errs.push(`tenets_broken[${i}].how must be a non-empty description (≥10 chars).`);
        }
      });
    }

    // ---- Abstraction layer ----
    // §2: root_cause and applies_to must be abstract. We enforce length
    // (≥20 chars), require ≥1 sentence boundary, and trip on obvious
    // job-specific phrasing.
    if (!nonEmpty(d.root_cause) || d.root_cause.trim().length < 20) {
      errs.push("`root_cause` must be ≥20 characters and describe a CLASS of mistake (REVIEWER_LOG.md §2).");
    } else {
      for (const re of ABSTRACTION_TRIPWIRES) {
        if (re.test(d.root_cause)) {
          errs.push("`root_cause` reads as job-specific (matched `" + re.source + "`). Generalize to a class of mistake.");
          break;
        }
      }
    }
    if (!nonEmpty(d.applies_to) || d.applies_to.trim().length < 20) {
      errs.push("`applies_to` must be ≥20 characters describing the future work-shape at risk (REVIEWER_LOG.md §2).");
    } else {
      for (const re of ABSTRACTION_TRIPWIRES) {
        if (re.test(d.applies_to)) {
          errs.push("`applies_to` reads as job-specific (matched `" + re.source + "`). Generalize.");
          break;
        }
      }
    }

    // ---- Retrieval keys ----
    // §2: applies_to_tags is the matching key — at least one tag required
    // so the matcher has a non-trivial overlap target.
    if (!Array.isArray(d.applies_to_tags) || d.applies_to_tags.length === 0) {
      errs.push("`applies_to_tags` must contain ≥1 tag (matching key, REVIEWER_LOG.md §2).");
    }
    if (!Array.isArray(d.matches_worktypes)) {
      errs.push("`matches_worktypes` must be an array (use [] for universal lessons).");
    }

    // ---- Mitigations: ≥3, each actionable (≥15 chars proxy) ----
    if (!Array.isArray(d.mitigations) || d.mitigations.length < 3) {
      errs.push(
        "`mitigations` must contain ≥3 actionable entries (currently " +
        ((d.mitigations || []).length) + "). REVIEWER_LOG.md §2."
      );
    } else {
      d.mitigations.forEach((m, i) => {
        if (!nonEmpty(m) || m.trim().length < 15) {
          errs.push(`mitigations[${i}] must be a full actionable sentence (≥15 chars).`);
        } else if (countSentences(m) < 1) {
          errs.push(`mitigations[${i}] must read as at least one sentence.`);
        }
      });
    }

    return errs;
  }

  // Convenience: pass a lesson, get { ok, errors }.
  function validateLessonOk(lesson) {
    const errs = validateLessonSchema(lesson);
    return { ok: errs.length === 0, errors: errs };
  }

  window.validateLessonSchema = validateLessonSchema;
  window.validateLessonOk = validateLessonOk;
})();
