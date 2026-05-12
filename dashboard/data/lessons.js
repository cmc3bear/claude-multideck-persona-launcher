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

// Mock data for the public demo dashboard, schema-aligned with state/lessons.json.
// See docs/OQE_DISCIPLINE.md §11 and docs/REVIEWER_LOG.md §2 for field definitions.
window.LESSONS = [
  {
    "id": "LESSON-0001",
    "job_id": "MULTIDECK-VS-0001",
    "created_at": "2026-05-04T10:00:00Z",
    "status": "ratified",
    "applies_to_tags": [
      "regression",
      "test-harness",
      "iterative-fix",
      "fix",
      "safety-net"
    ],
    "matches_worktypes": [
      "FIX",
      "FEAT"
    ],
    "what_happened": "VS R2 (accumulated-context round): OpenCode introduced a syntax error while attempting a mid-test fix. The fix addressed the immediate failure but broke previously passing code. With no harness confirming prior state, the regression was invisible until the full suite ran — at which point the pipeline was unrunnable and scored 0/10 hard requirements.",
    "noted_at_phase": "COMPLETION",
    "noted_at_gate": "REVIEW",
    "confidence_at_decision": "HIGH",
    "alternatives_considered": "(a) Fix inline without re-running suite (chosen by OpenCode, fastest); (b) Re-run full suite after each fix; (c) Isolate the failing case first, confirm fix in isolation, then run full suite. Claude used (c) implicitly — every fix was validated against existing tests before moving on.",
    "oqe_path": false,
    "criteria_passed": [],
    "tenets_broken": [
      {
        "tenet": 4,
        "how": "No evidence was gathered that prior passing tests still passed after the mid-fix change — the 'fix is safe' claim was unverified."
      },
      {
        "tenet": 2,
        "how": "No success criterion required regression-free state after each incremental fix step."
      }
    ],
    "root_cause": "Iterative repair without a continuously-green test harness. Each fix only checked the new symptom; prior passing behavior was assumed stable, not verified. The assumption broke on a syntax error that the author couldn't catch without running the interpreter.",
    "applies_to": "Any multi-step fix sequence where each step is a potential regression vector. Especially relevant when the fix author is also the only test runner.",
    "mitigations": [
      "Every mid-task fix must be followed by a full suite run before the next change. No exceptions — single broken re-run is a blocker, not a note.",
      "FIX job criteria must include 'all previously passing tests still pass after each incremental change' as an explicit criterion.",
      "If a fix introduces a syntax/parse error that breaks the suite, the task is immediately paused and the error diagnosed before any further changes."
    ]
  },
  {
    "id": "LESSON-0002",
    "job_id": "MULTIDECK-VS-0002",
    "created_at": "2026-05-04T10:05:00Z",
    "status": "ratified",
    "applies_to_tags": [
      "planning",
      "oqe-citations",
      "leading-indicator",
      "implementation-depth",
      "quality-prediction"
    ],
    "matches_worktypes": [
      "FEAT",
      "FIX",
      "SPEC"
    ],
    "what_happened": "VS R3 (clean-context round): Claude's planning phase cited OQE §N section references inline, named concrete subsystems, and enumerated acceptance criteria before any implementation. Claude scored 81/90 with 48/48 tests passing. OpenCode produced no planning artifacts, no §N citations in code, and a 'test suite' that was a console.log script — scoring 42/90 with 0 passing structured tests. The planning quality at T=0 predicted the implementation quality at T=end with high fidelity.",
    "noted_at_phase": "POST_ACCEPTANCE",
    "noted_at_gate": "NONE",
    "confidence_at_decision": "HIGH",
    "alternatives_considered": "Not a design decision — an observed correlation. Implication: allocating planning time (O-phase + Q-phase) is not overhead, it is load-bearing for implementation quality.",
    "oqe_path": true,
    "criteria_passed": [
      {
        "criterion": "48/48 structured tests pass",
        "evidence_strength": "STRONG"
      },
      {
        "criterion": "OQE §N citations present in code comments",
        "evidence_strength": "STRONG"
      },
      {
        "criterion": "Safety infrastructure (TmpFileRegistry, SIGINT cleanup) present",
        "evidence_strength": "STRONG"
      }
    ],
    "tenets_broken": [],
    "root_cause": "Not a failure — a validated positive finding. Planning quality (§N citations, explicit criteria, named subsystems) is a leading indicator of implementation quality because it forces the implementer to resolve ambiguity before writing code, not during.",
    "applies_to": "Any job where implementation quality needs to be predicted before the implementation is done. Planning review gates, code review prioritization.",
    "mitigations": [
      "Creation Gate checks for at least one §N section citation in the O-Frame before allowing the job to move to E-phase.",
      "Jobs with zero §N citations in planning artifacts are flagged MODERATE confidence automatically — the operator must override to HIGH.",
      "Planning artifacts are reviewed independently before implementation begins, not as part of the same submission."
    ]
  },
  {
    "id": "LESSON-0003",
    "job_id": "MULTIDECK-VS-0003",
    "created_at": "2026-05-04T10:10:00Z",
    "status": "ratified",
    "applies_to_tags": [
      "test-quality",
      "assertion",
      "console-log",
      "false-confidence",
      "evidence"
    ],
    "matches_worktypes": [
      "FIX",
      "FEAT",
      "OQE"
    ],
    "what_happened": "VS R3: OpenCode's test deliverable was a script that printed console.log statements — no assertions, no pass/fail logic. A script that never asserts can never fail, making it worse than no test: it produces a test-shaped artifact that creates false confidence and satisfies a 'tests exist' criterion without providing any signal.",
    "noted_at_phase": "COMPLETION",
    "noted_at_gate": "REVIEW",
    "confidence_at_decision": "HIGH",
    "alternatives_considered": "(a) console.log verification script (OpenCode, chosen); (b) Assertion-based test suite with pass/fail reporting (Claude, chosen); (c) Manual spot-check with documented results. Only (b) and (c) produce falsifiable evidence.",
    "oqe_path": false,
    "criteria_passed": [],
    "tenets_broken": [
      {
        "tenet": 4,
        "how": "Test output that cannot fail is not evidence — it is a ritual. 'Tests pass' has no meaning when the test cannot assert a failure."
      },
      {
        "tenet": 5,
        "how": "A test script with no assertions cites nothing linkable. It cannot support a 'criterion met' claim under §5."
      }
    ],
    "root_cause": "Confusing test-shaped output for test evidence. A verification script that prints observations is a logging tool, not a test suite. The distinction matters because test evidence is only valid if the test can fail.",
    "applies_to": "Any job where a 'tests written' criterion could be satisfied by a non-asserting script. All FIX and FEAT jobs that require test evidence.",
    "mitigations": [
      "Review Gate rejects any test artifact where no assertion framework (assert, expect, jest, pytest, etc.) is present in the test source — console.log-only scripts are classified LIMITED evidence.",
      "Test evidence must include a run output showing at least one PASS/FAIL or equivalent assertion result, not just printed values.",
      "Job criteria for testing must specify 'X assertions pass' not 'tests written' — the count of assertions is the criterion, not the existence of a file."
    ]
  },
  {
    "id": "LESSON-0004",
    "job_id": "MULTIDECK-VS-0004",
    "created_at": "2026-05-04T10:15:00Z",
    "status": "ratified",
    "applies_to_tags": [
      "evidence-pack",
      "missing-deliverables",
      "oqe-citations",
      "job-cards",
      "structural-completeness"
    ],
    "matches_worktypes": [
      "SPEC",
      "OQE",
      "FEAT"
    ],
    "what_happened": "VS R4A (independent review of OpenCode/devstral output): Reviewer scored 15/60. Three deliverables (Evidence Pack Definition, Risks and Failure Modes, Recommended Build Order) were entirely absent. Zero §N citations across all 9 submitted documents. All 9 job cards missing oqe_version, alternatives_considered, and problem fields. The submitted artifacts described what evidence would exist, not actual evidence.",
    "noted_at_phase": "COMPLETION",
    "noted_at_gate": "REVIEW",
    "confidence_at_decision": "MODERATE",
    "alternatives_considered": "(a) Describe evidence that would exist when the work is done (chosen by devstral — zero cost, not evidence); (b) Produce actual evidence artifacts with citations (Claude approach); (c) Partial delivery with explicit 'not yet done' markers. Only (b) and (c) are honest.",
    "oqe_path": false,
    "criteria_passed": [],
    "tenets_broken": [
      {
        "tenet": 4,
        "how": "Every submission that describes future evidence rather than presenting present evidence is a T4 failure by definition."
      },
      {
        "tenet": 5,
        "how": "Zero §N citations means no criterion cited a linkable standard — assertions were made without traceable basis."
      },
      {
        "tenet": 6,
        "how": "oqe_version absent from all 9 job cards — framework version undeclared."
      }
    ],
    "root_cause": "An evidence pack that lists what evidence will exist is a proposal, not a pack. The structural format of an evidence artifact (section headings, item list) was present; the actual content (measurements, citations, test outputs) was absent. Format compliance ≠ evidence compliance.",
    "applies_to": "Any job requiring an evidence pack, spec deliverable, or OQE job card. Especially multi-deliverable specs where the temptation to index content before creating it is high.",
    "mitigations": [
      "Review Gate checks each evidence pack item for at least one STRONG or MODERATE evidence citation — items containing only forward-looking language ('will be', 'can be', 'should be') are flagged as missing.",
      "Job cards are schema-validated at submission time: oqe_version, problem, and alternatives_considered fields are required; absent = auto-reject.",
      "§N citation count is tracked as a submission metric; zero citations triggers an automatic FAIL at the Review Gate regardless of prose quality."
    ]
  },
  {
    "id": "LESSON-0005",
    "job_id": "MULTIDECK-VS-0005",
    "created_at": "2026-05-04T10:20:00Z",
    "status": "ratified",
    "applies_to_tags": [
      "structural-hallucination",
      "readme-first",
      "index-before-content",
      "spec",
      "deliverable-gap"
    ],
    "matches_worktypes": [
      "SPEC",
      "FEAT",
      "OQE"
    ],
    "what_happened": "VS R4A (devstral): 3 files / 101 lines produced against a task requiring 8+ deliverable files. The README listed 6 files that were never created, complete with filenames and descriptions. The index was complete; the indexed content was not. This is structurally identical to writing a table of contents before writing the chapters — the map precedes the territory by an indefinite amount.",
    "noted_at_phase": "COMPLETION",
    "noted_at_gate": "REVIEW",
    "confidence_at_decision": "LOW",
    "alternatives_considered": "(a) Write README/index first, then files (devstral — index completed, files not); (b) Write files first, generate README from what actually exists; (c) Write files and README together, neither referencing something not yet present. Only (b) and (c) are safe.",
    "oqe_path": false,
    "criteria_passed": [],
    "tenets_broken": [
      {
        "tenet": 4,
        "how": "A README pointing to non-existent files is not evidence of those files — it is a claim without backing."
      },
      {
        "tenet": 1,
        "how": "The problem (content gaps) is obscured when the index is complete — readers conclude delivery is further along than it is."
      }
    ],
    "root_cause": "Structural hallucination pattern: generating a complete directory index or table of contents for content that doesn't yet exist. The README is convincing as a deliverable on its own, making the missing files harder to notice on casual review.",
    "applies_to": "Any deliverable set with an index, README, or manifest. Especially multi-file specs and evidence packs where the index is a separate file from the content.",
    "mitigations": [
      "Review Gate checks that every file named in a README, manifest, or index actually exists in the submission before marking any criterion complete.",
      "READMEs and index files are the last thing written, not the first — no exceptions for multi-deliverable jobs.",
      "If a file listed in an index is absent, the entire submission is returned as incomplete — partial delivery is not accepted for indexed deliverable sets."
    ]
  },
  {
    "id": "LESSON-0006",
    "job_id": "MULTIDECK-VS-0006",
    "created_at": "2026-05-04T10:25:00Z",
    "status": "ratified",
    "applies_to_tags": [
      "benchmark",
      "accumulated-context",
      "attribution",
      "test-design",
      "context-effect"
    ],
    "matches_worktypes": [
      "VS",
      "OQE",
      "SPEC"
    ],
    "what_happened": "VS R1/R2: The round tested models sequentially with accumulated context — the second model (Claude) entered after significant context was already established from R1. Claude's 10/10 hard-requirement score may partially reflect context coherence from the first round rather than pure cold-start capability. A clean-context control (R3) was added, where Claude scored 81/90 and OpenCode 42/90 starting from zero context. The R1/R2 result is not invalid but cannot cleanly attribute capability vs. context advantage.",
    "noted_at_phase": "POST_ACCEPTANCE",
    "noted_at_gate": "NONE",
    "confidence_at_decision": "MODERATE",
    "alternatives_considered": "(a) Accumulated context, sequential (R1/R2 design — some ecological validity, confounded attribution); (b) Clean context per model (R3 design — clean attribution, may underrepresent real-world performance); (c) Counterbalanced order (both models see each round first half the time). (b) is stronger for capability attribution; (a) is stronger for real-workflow realism.",
    "oqe_path": true,
    "criteria_passed": [
      {
        "criterion": "Clean-context control round conducted (R3)",
        "evidence_strength": "STRONG"
      },
      {
        "criterion": "R3 result directionally consistent with R1/R2",
        "evidence_strength": "STRONG"
      }
    ],
    "tenets_broken": [
      {
        "tenet": 3,
        "how": "R1/R2 confidence was MODERATE — the confound was acknowledged but the test proceeded at that confidence level. Attribution claims from R1/R2 alone should have been rated LOW."
      }
    ],
    "root_cause": "Accumulated-context benchmarks conflate context coherence with capability. When a model benefits from a detailed prior context window, the test measures 'capability + context' not 'capability'. This is a systematic bias that inflates scores for the model that goes second.",
    "applies_to": "Any comparative benchmark or VS round that tests models sequentially on the same codebase. Capability attribution in general when test order isn't counterbalanced.",
    "mitigations": [
      "Every VS round with accumulated context must have a paired clean-context control round before any capability conclusions are drawn.",
      "Attribution claims from non-counterbalanced tests are automatically capped at MODERATE confidence.",
      "VS round design must state explicitly: 'accumulated context' vs 'clean context' and whether ordering is counterbalanced — this goes in the round spec before the test begins."
    ]
  },
  {
    "id": "LESSON-0007",
    "job_id": "MULTIDECK-VS-0007",
    "created_at": "2026-05-04T10:30:00Z",
    "status": "ratified",
    "applies_to_tags": [
      "local-model",
      "tool-calling",
      "modelfile",
      "ollama",
      "context-window",
      "setup-verification"
    ],
    "matches_worktypes": [
      "VS",
      "FEAT",
      "OQE"
    ],
    "what_happened": "VS R3 pre-test: qwen3-coder:30b-32k (the extended-context variant) emitted raw XML function call strings instead of structured tool API calls. The Ollama Modelfile for the :32k variant lacked the tool-calling template that the base :30b tag includes. The round had to switch to the base tag before testing could begin. Extended-context variants are not guaranteed to inherit all capabilities of their base.",
    "noted_at_phase": "O",
    "noted_at_gate": "CREATION",
    "confidence_at_decision": "LOW",
    "alternatives_considered": "(a) Use :32k extended context variant (chosen initially — larger context window desired); (b) Use base :30b tag (fallback, confirmed functional); (c) Manually patch the Modelfile to add tool-calling template to :32k. Chose (b) for speed; (c) is the durable fix.",
    "oqe_path": false,
    "criteria_passed": [],
    "tenets_broken": [
      {
        "tenet": 2,
        "how": "No criterion in the round setup required verification of tool-calling capability before the round began — the capability was assumed from the model family, not confirmed."
      },
      {
        "tenet": 3,
        "how": "Confidence that :32k would behave identically to :30b was assumed HIGH; the Modelfile difference was not checked."
      }
    ],
    "root_cause": "Local model variant selection based on context window size without verifying that the variant inherits all capabilities (tool-calling, structured output) from its base. Extended-context Ollama variants may be re-quantized or re-templated independently of the base, losing features in the process.",
    "applies_to": "Any task that selects a local Ollama model variant for an extended capability (context, quantization, instruct suffix). Tool-calling dependent workflows in particular.",
    "mitigations": [
      "Model selection for tool-calling workflows must include a capability pre-check: run a minimal tool-call probe before starting the main task. If it fails, fall back to the verified base tag.",
      "VS round setup criteria must explicitly include 'tool-calling verified on selected model' as a CREATION gate criterion.",
      "When pulling a non-base Ollama variant, inspect the Modelfile template section before use — verify it includes the tool-calling chat template from the base."
    ]
  },
  {
    "id": "LESSON-0008",
    "job_id": "WS-FIX-0001",
    "created_at": "2026-05-10T10:25:09.319824Z",
    "status": "draft",
    "applies_to_tags": [
      "oqe-citations",
      "linkable-citations",
      "runtime-observation",
      "job-creation",
      "session-reference",
      "standing-gate-regex"
    ],
    "matches_worktypes": [
      "FIX",
      "FEAT",
      "OQE",
      "INFRA"
    ],
    "what_happened": "When creating WS-FIX-0001 to track a screen-capture MCP bug discovered in-session, the author wrote criteria that cited the live observation context (\"per operator session 2026-05-10\", \"per the actual error output captured\", \"per System.Windows.Forms.Screen.AllScreens enumeration\") instead of citing the source file where the behavior lives or the §N rule that governs the test. Four of six criteria failed the standing-gate citation regex, which requires either a §N reference or a file with extension .md/.ts/.tsx/.js/.cjs/.mjs/.py/.json/.ps1/.bat. The job was caught at the standing gate moments after creation (compliance rate dropped from 94.1% to 92.8%) and patched in-place; without the standing scan it would have shipped uncited and triggered review-gate rejection downstream. The author had drafted the OQE 2.0 prompt block earlier in the same session warning explicitly about this exact pattern, and still missed it on first creation.",
    "noted_at_phase": "COMPLETION",
    "noted_at_gate": "STANDING",
    "confidence_at_decision": "HIGH",
    "alternatives_considered": "(a) Cite session as evidence (chosen on first pass; rejected by standing gate). (b) Cite source file path of the misbehaving component (chosen on patch — added screen-capture-mcp/dist/index.js to criteria 2, 4, 5). (c) Cite the OQE rule that defines the test grade (chosen on patch — added OQE_DISCIPLINE.md §4 and §11 to criteria 2, 3, 4, 5). The patch applied (b) and (c) together because runtime-observed defects need both: the source location proves WHERE the bug is, the §N reference proves WHY this test grade is the right one.",
    "oqe_path": true,
    "criteria_passed": [
      {
        "criterion": "WS-FIX-0001 contains 6 criteria with linkable citations after patch",
        "evidence_strength": "STRONG"
      },
      {
        "criterion": "Standing-gate scan returns workspace board to 0 non-compliant active",
        "evidence_strength": "STRONG"
      }
    ],
    "tenets_broken": [
      {
        "tenet": 5,
        "how": "Criteria 2, 3, 4, 5 of WS-FIX-0001 referenced standards (\"per the tool's JSONSchema description\", \"per operator session 2026-05-10\", \"per System.Windows.Forms.Screen.AllScreens enumeration\") without naming a linkable file path or §N section. The standing-gate citation regex (CITATION_RX in scripts/oqe-standing-scan.py line 38) requires either §N or a file with a recognized extension; conversational references match neither."
      }
    ],
    "root_cause": "When a criterion is born from a runtime observation made during the same session that creates the job, the author's natural impulse is to cite the observation context (\"per the error I just saw\", \"per the operator session\"). The session is real and verifiable to the author at write time, but it is invisible to every future reader and to the standing-gate regex. This class of mistake is structural: the author is conflating \"obvious to me right now\" with \"linkable from the artifact\". It will happen on any job whose criteria reference behaviors observed in the session that birthed the job, particularly bug-fix and incident-response jobs where the defect was just witnessed.",
    "applies_to": "Any job (especially FIX and incident-response work) where criteria reference behaviors, errors, or environment facts that the author observed in-session rather than reading from a file. The risk is highest when the bug was just seen, the fix is being scoped quickly, and the author hasn't yet read the offending source.",
    "mitigations": [
      "When writing a criterion that references a runtime observation (error message, log line, environmental fact), immediately also cite the source file path where the misbehaving component lives. If you don't know the file path yet, that is itself a signal to read the source before finalizing the criterion. Pattern: \"...per <error signature> and per <file path>:<line> where <component> is constructed...\"",
      "Every criterion must additionally cite the OQE_DISCIPLINE.md §N rule that defines the test grade for that criterion (e.g. §4 for evidence strength, §11 for evidence-criterion match, §13 for ID format). The §N citation is what tells the reviewer which rule is being applied; without it, the reviewer has to guess.",
      "Before submitting any newly-created job, run the standing-gate scan (scripts/oqe-standing-scan.py) and check that the board's non-compliant count did not increase. If it did, the new job introduced the violation and must be patched before the job goes to review. This is a 5-second sanity check that catches T5 violations at creation time, not review time.",
      "If a criterion legitimately cannot point to a file (e.g. the bug is in a closed-source binary or the source is not yet identified), the criterion must explicitly cite gaps_acknowledged with the reason and name the OQE §N rule that says \"insufficient citation\" is acceptable for this specific case. Silent uncited criteria are never acceptable."
    ]
  }
];

// === Helpers below restored 2026-05-10 — were truncated by sync; required by lessons.js view ===

window.LESSONS_BY_ID = Object.fromEntries(window.LESSONS.map(l => [l.id, l]));
window.LESSONS_BY_JOB = window.LESSONS.reduce((m, l) => {
  (m[l.job_id] = m[l.job_id] || []).push(l);
  return m;
}, {});

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
