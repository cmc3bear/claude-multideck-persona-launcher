// OQE 2.0 Reviewer Lessons — structured post-acceptance lesson log
// Schema (enforced by editor):
//   id                   string   LESSON-NNNN
//   job_id               string   PROJECT-WORKTYPE-NNNN reference
//   created_at           ISO8601
//   status               enum     draft | ratified | archived  — only ratified fire on new jobs
//   what_happened        string   plain-language failure narrative
//   noted_at_phase       enum     O | Q | E | COMPLETION | POST_ACCEPTANCE
//   noted_at_gate        enum     CREATION | REVIEW | STANDING | NONE
//   confidence_at_decision enum   HIGH | MODERATE | LOW
//   alternatives_considered string  options on the table at decision time
//   oqe_path             bool     did this run the full O→Q→E flow?
//   criteria_passed      array    [{criterion, evidence_strength: STRONG|MODERATE|LIMITED}]
//   tenets_broken        array    [{tenet: 1..6, how: string}]
//   root_cause           string   abstract failure mode
//   applies_to           string   future work-shape at risk (prose generalization)
//   applies_to_tags      array    machine-matchable tags for retrieval (e.g. negative-property, governance)
//   matches_worktypes    array    worktypes this lesson applies to (e.g. FIX, FEAT) — empty = all
//   mitigations          array    3+ concrete mitigations (enforced)

window.TENETS = [
  { n: 1, key: "T1", short: "Problem before Objective",
    long: "Define the problem (what's wrong + why it matters) before stating the objective." },
  { n: 2, key: "T2", short: "Criteria before Action",
    long: "5+ specific, observable, traceable success criteria before any implementation step." },
  { n: 3, key: "T3", short: "Confidence before Implementation",
    long: "HIGH/MODERATE/LOW rating across bias, completeness, source credibility, risk — before acting." },
  { n: 4, key: "T4", short: "Evidence before Completion",
    long: "Every criterion backed by ≥1 STRONG or MODERATE evidence item; no closure on LIMITED alone." },
  { n: 5, key: "T5", short: "Citation before Assertion",
    long: "Every criterion cites a linkable section/file path and justifies its chosen standard." },
  { n: 6, key: "T6", short: "Version before Declaration",
    long: "Every artifact declares its OQE version before any MET/NOT MET declaration." },
];

window.LESSON_STATUSES = ["draft", "ratified", "archived"];
window.PHASES = ["O", "Q", "E", "COMPLETION", "POST_ACCEPTANCE"];
window.PHASE_LABEL = {
  O: "O-Phase · Objective",
  Q: "Q-Phase · Confidence",
  E: "E-Phase · Evidence",
  COMPLETION: "Completion Gate",
  POST_ACCEPTANCE: "Post-Acceptance",
};
window.GATES = ["CREATION", "REVIEW", "STANDING", "NONE"];
window.CONFIDENCE_LEVELS = ["HIGH", "MODERATE", "LOW"];
window.EVIDENCE_STRENGTHS = ["STRONG", "MODERATE", "LIMITED"];

function lt(hoursAgo) {
  return new Date(Date.now() + hoursAgo * 3600e3).toISOString();
}

window.LESSONS = [
  {
    id: "LESSON-0001",
    job_id: "MULTIDECK-ASSET-0039",
    created_at: lt(-90),
    status: "ratified",
    applies_to_tags: ["negative-property", "asset-generation", "pii", "verification"],
    matches_worktypes: ["ASSET", "FEAT"],
    what_happened:
      "Job 11 (predecessor portrait set) was closed PASS with note 'no personal data', but two of the nine portraits contained reference photo backgrounds that included a real person's office whiteboard with handwritten names. Caught by the standing gate on a downstream asset scan, eight days post-acceptance.",
    noted_at_phase: "POST_ACCEPTANCE",
    noted_at_gate: "STANDING",
    confidence_at_decision: "HIGH",
    alternatives_considered:
      "(a) Generate from text-only prompts (chosen alt for 39); (b) Reference photos with manual scrub pass; (c) Reference photos with automated face/text detection. Chose (b) at the time — assumed visual scan was sufficient.",
    oqe_path: true,
    criteria_passed: [
      { criterion: "All 9 portraits delivered at 384×512 PNG", evidence_strength: "STRONG" },
      { criterion: "Cyberpunk style consistent across set", evidence_strength: "MODERATE" },
      { criterion: "No personal data in output", evidence_strength: "LIMITED" },
    ],
    tenets_broken: [
      { tenet: 4, how: "Closed on LIMITED evidence — 'no personal data' was a spot-check, not a verifiable scan." },
      { tenet: 5, how: "Note 'no personal data' cited no scan tool, no file path, no methodology." },
    ],
    root_cause:
      "Negative-claim verification ('X is NOT present') was treated as default-true without instrumented evidence. Reviewer accepted reviewer-self-attestation in lieu of a tool-backed scan.",
    applies_to:
      "Any asset-generation job where output must be free of a class of content (PII, branded marks, copyrighted material, profanity). Negative-property criteria in general.",
    mitigations: [
      "Require tool-backed scan with linkable output (e.g. OCR pass over images, named-entity scan over text) for any 'X NOT present' criterion.",
      "Reject LIMITED evidence on negative-property claims at the Completion Gate — auto-flag, not advisory.",
      "Add 'negative-property' classification to criteria so the Review Gate can pattern-match and demand stronger evidence.",
    ],
  },
  {
    id: "LESSON-0002",
    job_id: "MULTIDECK-FIX-0052",
    created_at: lt(-30),
    status: "ratified",
    applies_to_tags: ["reproduction-parity", "chaos-test", "reliability", "vague-criterion"],
    matches_worktypes: ["FIX"],
    what_happened:
      "SSE reconnect storm fix shipped with claim '200 clients, zero reconnect storm'. Caught in review: chaos test was run against a single restart event, not the rolling-restart scenario that originally triggered the bug. Test was real but didn't cover the actual failure mode.",
    noted_at_phase: "COMPLETION",
    noted_at_gate: "REVIEW",
    confidence_at_decision: "HIGH",
    alternatives_considered:
      "(a) Single-restart chaos test (chosen, faster); (b) Rolling-restart test matching prod incident; (c) Replay of original log capture against new code. Chose (a) for speed.",
    oqe_path: true,
    criteria_passed: [
      { criterion: "Exponential backoff implemented (1,2,4,8s max 30s)", evidence_strength: "STRONG" },
      { criterion: "Single watcher per file", evidence_strength: "STRONG" },
      { criterion: "Verified under load", evidence_strength: "MODERATE" },
    ],
    tenets_broken: [
      { tenet: 2, how: "'Verified under load' was not specific enough — didn't constrain WHICH load profile, allowing the wrong one to satisfy the criterion." },
      { tenet: 5, how: "Criterion didn't cite the original incident log it was meant to defend against." },
    ],
    root_cause:
      "Vague success criterion. 'Verified under load' is the kind of phrase OQE 2.0 explicitly rejects — it accepts any load test, including ones that don't reproduce the bug.",
    applies_to:
      "Any bug fix where the success criterion describes the test type rather than the failure mode being defended against.",
    mitigations: [
      "Bug-fix criteria must cite the original incident log/file and specify 'reproduces under conditions X, then fails to reproduce under same conditions after fix'.",
      "Review Gate adds a 'reproduction parity' check for any FIX worktype — test inputs must mirror incident inputs.",
      "Add criterion-template library for FIX jobs that prefills 'pre-fix repro confirmed' + 'post-fix repro fails' as default.",
    ],
  },
  {
    id: "LESSON-0003",
    job_id: "MULTIDECK-FEAT-0035",
    created_at: lt(-200),
    status: "ratified",
    applies_to_tags: ["governance", "enforcement", "bypass", "completeness-lens", "security"],
    matches_worktypes: ["FEAT", "SPEC", "GATE"],
    what_happened:
      "Runtime boundary enforcement was implemented and shipped at HIGH confidence. Three weeks later a cross-project leak was found: the --project banner could be silenced by an env var that wasn't documented. The escape hatch existed in the code at decision time but wasn't surfaced during the Q-phase review.",
    noted_at_phase: "POST_ACCEPTANCE",
    noted_at_gate: "NONE",
    confidence_at_decision: "HIGH",
    alternatives_considered:
      "(a) Three-layer enforcement with env-var override (chosen); (b) Three-layer with no override; (c) Single hard-fail layer. Override was chosen to allow ops escape during incidents — but the override wasn't tracked as part of the surface area.",
    oqe_path: true,
    criteria_passed: [
      { criterion: "--project banner visible on every CLI invocation", evidence_strength: "STRONG" },
      { criterion: "boundary_rule field enforced in job-board.py", evidence_strength: "STRONG" },
      { criterion: "List reminder shown when crossing project context", evidence_strength: "STRONG" },
    ],
    tenets_broken: [
      { tenet: 3, how: "HIGH confidence rating skipped the 'completeness' lens — the env-var escape hatch was a known surface that wasn't enumerated." },
      { tenet: 1, how: "Problem statement was 'enforce boundaries' not 'prevent cross-project leaks under all conditions including ops overrides' — too narrow framing let the escape hatch slip out of scope." },
    ],
    root_cause:
      "The Q-phase 'completeness' lens was treated as a checkbox rather than an enumeration. Known escape hatches in the code weren't surfaced as part of the system's threat surface.",
    applies_to:
      "Any enforcement, validation, or governance feature where bypass mechanisms exist. Security features in general.",
    mitigations: [
      "Q-phase completeness lens for governance features must produce an explicit enumeration of all bypass mechanisms (env vars, CLI flags, config files, fallbacks).",
      "If any bypass exists, it must appear as its own success criterion ('bypass X is documented and audit-logged').",
      "Add 'governance' classification to job tags — Standing Gate scans these for bypass-mechanism documentation post-merge.",
    ],
  },
  {
    id: "LESSON-0004",
    job_id: "MULTIDECK-OQE-0033",
    created_at: lt(-260),
    status: "ratified",
    applies_to_tags: ["performance", "single-source", "load-bearing", "codec", "latency"],
    matches_worktypes: ["OQE", "SPEC", "FEAT"],
    what_happened:
      "OQE design doc compared MP3 vs WAV with the criterion 'feed transport works on cell'. Single test on one carrier in one location passed at MODERATE confidence and the decision was locked. Two months later, users on slower connections reported 8s+ load times — the tested location had unrepresentatively good signal.",
    noted_at_phase: "POST_ACCEPTANCE",
    noted_at_gate: "NONE",
    confidence_at_decision: "MODERATE",
    alternatives_considered:
      "(a) MP3 128k (chosen); (b) MP3 96k; (c) Opus 64k; (d) WAV. Chose (a) on size+quality tradeoff. Cell test was acknowledged as single-source.",
    oqe_path: true,
    criteria_passed: [
      { criterion: "MP3 file size <1MB for typical 30s clip", evidence_strength: "STRONG" },
      { criterion: "Sub-second encode on 4090", evidence_strength: "STRONG" },
      { criterion: "Plays on cell", evidence_strength: "LIMITED" },
    ],
    tenets_broken: [
      { tenet: 4, how: "'Plays on cell' was LIMITED (single source, single carrier, single location) and was the deciding criterion for the codec — closing on LIMITED for a load-bearing claim." },
      { tenet: 3, how: "MODERATE confidence acknowledged the single-source weakness but the decision proceeded at that level instead of gathering more — should have been LOW pending more samples." },
    ],
    root_cause:
      "MODERATE-confidence decisions on load-bearing criteria are systematically risky. The framework allows them but 'documented caveats' is a weaker enforcement than 'do not proceed' (LOW).",
    applies_to:
      "Any decision where a single criterion is load-bearing for the choice (codec, schema, protocol, vendor). Performance/latency claims in particular.",
    mitigations: [
      "Identify load-bearing criteria explicitly in the O-Frame; for those, MODERATE confidence is treated as LOW (do not proceed).",
      "Performance criteria must specify the test matrix (carriers/devices/conditions) BEFORE evidence is gathered, not after.",
      "Standing Gate periodically re-runs performance criteria from closed jobs against current data; flags drift.",
    ],
  },
  {
    id: "LESSON-0005",
    job_id: "MULTIDECK-FEAT-0030",
    created_at: lt(-340),
    status: "ratified",
    applies_to_tags: ["version-drift", "spec-transition", "process-failure", "vague-criterion"],
    matches_worktypes: [],
    what_happened:
      "Audio transport controls were declared MET with the result string 'works as expected'. Reviewer flagged at gate, sent back for proper criteria + evidence. Roundtrip cost 6 hours that should have been zero — the engineer had the evidence, just hadn't structured it. This was pre-OQE-2.0 and the engineer claimed they were unaware §13 even applied yet.",
    noted_at_phase: "COMPLETION",
    noted_at_gate: "REVIEW",
    confidence_at_decision: "HIGH",
    alternatives_considered:
      "Not applicable — this was a process failure, not a design failure. Implementation choice was sound.",
    oqe_path: false,
    criteria_passed: [
      { criterion: "PREV/NEXT/SEEK controls implemented", evidence_strength: "STRONG" },
      { criterion: "Clickable history", evidence_strength: "STRONG" },
      { criterion: "Works as expected", evidence_strength: "LIMITED" },
    ],
    tenets_broken: [
      { tenet: 6, how: "Artifact didn't declare its OQE version — engineer was operating against an outdated mental model of the framework." },
      { tenet: 2, how: "'Works as expected' is the canonical rejected criterion phrase per §2." },
    ],
    root_cause:
      "Version drift. The engineer's local working copy of the spec was stale and didn't reflect §11–§14 enforcement. The Creation Gate didn't catch this because the job was created before §14 went live.",
    applies_to:
      "Transition periods around any spec version bump. Any job created before an enforcement gate goes live but submitted after.",
    mitigations: [
      "Creation Gate stamps the artifact's OQE version at job-post time and locks it; submission is validated against THAT version, not current.",
      "On spec version bumps, all open jobs receive an automated note: 'this job was created under v1.x; submission accepted under v1.x rules'.",
      "Engineer onboarding includes a §6 self-check: 'what OQE version are you reading' as gate to first commit.",
    ],
  },
  {
    id: "LESSON-0006",
    job_id: "WORKSPACE-FEAT-0044",
    created_at: lt(-12),
    status: "ratified",
    applies_to_tags: ["synthetic-data", "fixture-provenance", "data-shape", "calendar", "sync"],
    matches_worktypes: ["FEAT", "FIX"],
    what_happened:
      "Calendar gcal_read sync shipped with 5min refresh. The 'conflicts marked on dashboard' claim was demonstrated with one synthetic conflict in the test data. In production, real conflicts span multiple calendars with overlapping (not identical) time ranges, and the dedup logic silently dropped half of them. Caught by user report, not by gates.",
    noted_at_phase: "POST_ACCEPTANCE",
    noted_at_gate: "NONE",
    confidence_at_decision: "MODERATE",
    alternatives_considered:
      "(a) Exact-match dedup (chosen, simpler); (b) Time-range overlap dedup; (c) No dedup, surface duplicates to user. Chose (a) because synthetic test data showed exact matches.",
    oqe_path: true,
    criteria_passed: [
      { criterion: "5-min refresh active", evidence_strength: "STRONG" },
      { criterion: "Events from 3 calendars merged", evidence_strength: "STRONG" },
      { criterion: "Conflicts marked on dashboard", evidence_strength: "MODERATE" },
    ],
    tenets_broken: [
      { tenet: 4, how: "Evidence was MODERATE based on synthetic data, but synthetic data didn't represent the real conflict shape — evidence quality was overrated." },
      { tenet: 1, how: "Problem was framed as 'sync calendar' not 'represent overlapping commitments accurately'. The narrower framing let an incomplete dedup pass." },
    ],
    root_cause:
      "Evidence-from-synthetic-data was tagged MODERATE when it should have been LIMITED. Synthetic test data is a single source by definition — the data was authored by the same engineer who wrote the code, so it inherits all the same blind spots.",
    applies_to:
      "Any feature where success is verified against test fixtures the engineer wrote themselves. Data-shape-dependent features in particular (calendars, contacts, addresses, anything with edge cases).",
    mitigations: [
      "Self-authored test fixtures are LIMITED evidence by default. STRONG/MODERATE requires real data sample or independently-authored fixture.",
      "Data-shape features must include at least one criterion verified against production-shape data (sampled, anonymized, or staged).",
      "Review Gate adds a 'fixture provenance' check — who authored the test data, when, against what real-world spec.",
    ],
  },
];

window.LESSONS_BY_ID = Object.fromEntries(window.LESSONS.map(l => [l.id, l]));
window.LESSONS_BY_JOB = window.LESSONS.reduce((m, l) => {
  (m[l.job_id] = m[l.job_id] || []).push(l);
  return m;
}, {});

// Stash mock lessons so the live adapter can swap back to them in mock mode
// MULTI-FEAT-0067: criterion 4 — sample lessons live in mock mode only.
window.MOCK_LESSONS = window.LESSONS;

// Tenet break frequency over a set of lessons
window.computeTenetCounts = function(lessons) {
  const counts = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
  for (const l of lessons) {
    for (const t of (l.tenets_broken || [])) {
      counts[t.tenet] = (counts[t.tenet] || 0) + 1;
    }
  }
  return counts;
};

// =========================================================
// MATCHER — finds relevant ratified lessons for a given job.
// Hybrid scoring: tag overlap + worktype + applies_to_tags.
// Deterministic + debuggable. Returns ranked [{lesson, score, why:[reasons]}].
// =========================================================
function jobWorktype(job) {
  // Extract WORKTYPE from PROJECT-WORKTYPE-NNNN id; fall back to legacy/null.
  if (!job || !job.id) return null;
  const m = String(job.id).match(/^[A-Z]+-([A-Z]+)-\d{4}$/);
  return m ? m[1] : null;
}

window.matchLessonsToJob = function(job, opts) {
  opts = opts || {};
  const minScore = opts.minScore != null ? opts.minScore : 1;
  const limit = opts.limit != null ? opts.limit : 5;
  const includeAllStatuses = !!opts.includeAllStatuses;

  if (!job) return [];
  const lessons = (window.LESSONS || []).filter(l =>
    includeAllStatuses ? true : l.status === "ratified"
  );

  const jobTags = new Set((job.tags || []).map(t => String(t).toLowerCase()));
  const jobWT = jobWorktype(job);

  const scored = lessons.map(lesson => {
    const reasons = [];
    let score = 0;

    // 1. tag overlap on job.tags vs lesson.applies_to_tags (high signal)
    const lessonTags = new Set((lesson.applies_to_tags || []).map(t => String(t).toLowerCase()));
    const tagOverlap = [...jobTags].filter(t => lessonTags.has(t));
    if (tagOverlap.length) {
      score += tagOverlap.length * 3;
      reasons.push({ kind: "tag-overlap", weight: tagOverlap.length * 3, detail: tagOverlap.join(", ") });
    }

    // 2. tag overlap on job.tags vs lesson.job's tags (transitive — same problem-space)
    const sourceJob = (window.JOBS || []).find(j => j.id === lesson.job_id);
    if (sourceJob) {
      const srcTags = new Set((sourceJob.tags || []).map(t => String(t).toLowerCase()));
      const transitive = [...jobTags].filter(t => srcTags.has(t) && !lessonTags.has(t));
      if (transitive.length) {
        score += transitive.length * 1;
        reasons.push({ kind: "transitive-tags", weight: transitive.length, detail: transitive.join(", ") });
      }
    }

    // 3. worktype match (jobs of same kind)
    if (jobWT && Array.isArray(lesson.matches_worktypes) && lesson.matches_worktypes.length) {
      if (lesson.matches_worktypes.includes(jobWT)) {
        score += 2;
        reasons.push({ kind: "worktype", weight: 2, detail: jobWT });
      }
    } else if (jobWT && Array.isArray(lesson.matches_worktypes) && lesson.matches_worktypes.length === 0) {
      // empty matches_worktypes means "applies to all" — gentle universal match
      score += 0.5;
      reasons.push({ kind: "universal", weight: 0.5, detail: "applies to all worktypes" });
    }

    // 4. project match (lessons from same project carry slight extra weight)
    if (sourceJob && sourceJob.project && sourceJob.project === job.project) {
      score += 0.5;
      reasons.push({ kind: "same-project", weight: 0.5, detail: job.project });
    }

    return { lesson, score, why: reasons };
  });

  return scored
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

// MULTI-FEAT-0067 criterion 6: score components must be inspectable for
// debugging. window.debugMatcher(jobId) prints every lesson's component
// breakdown for the given job — used from the browser console when a
// surprising match (or non-match) needs to be explained. Read-only.
window.debugMatcher = function (jobId) {
  const job = (window.JOBS || []).find(j => j.id === jobId);
  if (!job) {
    console.warn("[matcher] no job found with id", jobId);
    return [];
  }
  // includeAllStatuses + minScore=0 — show everything, including drafts +
  // zero-score lessons so the operator can see WHY a lesson didn't match.
  const all = window.matchLessonsToJob(job, { minScore: 0, limit: 9999, includeAllStatuses: true });
  console.groupCollapsed("[matcher] " + jobId + " — " + all.length + " lessons scored");
  all.forEach(m => {
    const breakdown = m.why.map(r => `${r.kind}(+${r.weight})`).join(" + ") || "—";
    console.log(`${m.lesson.id} score=${m.score.toFixed(2)} status=${m.lesson.status} :: ${breakdown}`);
  });
  console.groupEnd();
  return all;
};
