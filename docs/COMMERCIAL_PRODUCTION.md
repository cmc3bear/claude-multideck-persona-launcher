# Commercial Production Workflow

Use this workflow when producing commercial deliverables (scripts, documentation, media) that require quality gates and stakeholder review.

---

## The Workflow: Draft → Review → Production → Redline → Final Review

```
DRAFT (Engineer/Broadside writes) 
  ↓
REVIEW (Architect/subject-matter expert audits)
  ↓ (conditional: PASS or FLAG)
PRODUCTION (Broadside produces final media)
  ↓
REDLINE (Reviewer quality gate)
  ↓ (conditional: PASS or FLAG+1-loop)
FINAL REVIEW (Cary or stakeholder approves)
  ↓
SHIPPED
```

Each stage is a separate job on the job board.

---

## Stage 1: DRAFT

**Who:** Engineer or Broadside (content creator)  
**Input:** Brief with objective, success criteria  
**Output:** Raw draft (script, doc, media outline)  
**Gate:** Subject-matter review (no quality gate yet)

### Job Creation

```bash
python scripts/job-board.py create \
  --agent "engineer" \
  --priority "P1" \
  --summary "Draft: Quickstart video script" \
  --description "Write raw script for 5-minute Quickstart video. Include: installation, voice setup, first job, dashboard overview." \
  --o-objective "Create engaging script that teaches MultiDeck basics in 5 minutes" \
  --o-success-criteria "[Script is 5 min at natural speech pace, covers all 4 topics, includes examples]"
```

### Submission

Engineer writes the draft and submits:

```bash
python scripts/job-board.py submit \
  --job-id "JOB-0060" \
  --results "Quickstart script drafted and ready for review" \
  --results-file "scripts/quickstart-video-script.md"
```

---

## Stage 2: REVIEW

**Who:** Architect or domain expert  
**Input:** Raw draft  
**Output:** Feedback, approved draft, or rejection  
**Gate:** Architectural/domain review

### Reviewer's Check

Architect reads the draft and evaluates:

1. **Does it cover the objective?** — All 4 topics mentioned?
2. **Is it engaging?** — Language natural? Examples clear?
3. **Is it accurate?** — No technical errors?
4. **Is it feasible to produce?** — Can Broadside turn this into video?

### Decision

**If PASS:**
```bash
python scripts/job-board.py review \
  --job-id "JOB-0060" \
  --decision "approved" \
  --feedback "Clear script, good pacing, examples work. Ready for production."
```

**If FLAG:**
```bash
python scripts/job-board.py review \
  --job-id "JOB-0060" \
  --decision "flagged" \
  --feedback "Add more examples for voice setup. Current section is too quick. Suggest before/after comparison."
```

### Re-work (if flagged)

Engineer reads feedback and revises:

```
Feedback: Add more examples for voice setup

Engineer adds:
- Before: "Just type the command"
- After: "Shows actual terminal output and audio sample"

Engineer resubmits JOB-0060
Architect re-checks and approves
```

---

## Stage 3: PRODUCTION

**Who:** Broadside (content producer)  
**Input:** Approved script  
**Output:** Final media (video, podcast, document)  
**Gate:** None (Broadside owns this stage)

### Job Creation

Once Stage 2 is approved, create production job:

```bash
python scripts/job-board.py create \
  --agent "broadside" \
  --priority "P1" \
  --summary "Produce: Quickstart video" \
  --description "Produce 5-minute video from approved script. Include: screen recordings, demo walkthrough, background music (Suno), callout graphics." \
  --depends-on "JOB-0060"
```

Note the `--depends-on` flag — job doesn't start until Stage 2 is complete.

### Production Process

Broadside:
1. Reads approved script
2. Records screen captures
3. Does demo walkthrough
4. Generates background music (Suno)
5. Edits and produces final video
6. Submits

```bash
python scripts/job-board.py submit \
  --job-id "JOB-0061" \
  --results "Quickstart video produced and edited, ready for quality review" \
  --results-file "media/quickstart-video-final.mp4"
```

---

## Stage 4: REDLINE (Quality Gate)

**Who:** Reviewer (quality gate agent)  
**Input:** Produced media  
**Output:** PASS/FLAG with specific feedback  
**Gate:** Hard quality gate (no shipping without PASS)

### Reviewer's Five-Gate Check

Reviewer applies the OQE discipline (see `docs/REVIEW_WORKFLOW.md`):

1. **Does final product match the original objective?** — Is it a 5-minute Quickstart?
2. **Is it technically correct?** — No errors in the walkthrough?
3. **Is it production-ready?** — Audio quality good? Video clear?
4. **Are success criteria met?** — Does it cover all 4 topics? Engaging?
5. **Is it evidence-based?** — Can anyone reproduce the steps from the video?

### Decision

**PASS:**
```bash
python scripts/job-board.py review \
  --job-id "JOB-0061" \
  --decision "approved" \
  --feedback "Video is polished, clear walkthrough, excellent pacing. Approved for distribution."
```

**FLAG (one fix loop allowed):**
```bash
python scripts/job-board.py review \
  --job-id "JOB-0061" \
  --decision "flagged" \
  --feedback "Audio sync issue at 2:34. Redo that section and resubmit."
```

### What Happens If Flagged

- Broadside reads feedback
- Fixes the specific issue (e.g., re-records the audio section)
- Resubmits

If flagged a second time, escalates to Dispatch (no second fix loop).

---

## Stage 5: FINAL REVIEW

**Who:** Stakeholder (Cary, product owner, CEO)  
**Input:** Approved final product  
**Output:** Ship or hold  
**Gate:** Stakeholder decision (not automated)

### Manual Review

Stakeholder:
1. Watches the video
2. Checks against marketing requirements
3. Decides: Ship or hold

**Ship:**
```
Approved for publication. Moving to next priority job.
```

**Hold:**
```
Hold until [condition]. Returning to Broadside for revisions.
```

---

## Timeline Example

```
JOB-0060 (Draft):        Created Apr 15, 14:00
                         Submitted Apr 15, 16:30 (2.5 hours)
                         Reviewed Apr 15, 17:00
                         Approved Apr 15, 17:15

JOB-0061 (Production):   Created Apr 15, 17:15 (depends on JOB-0060)
                         Started Apr 15, 17:16 (auto-unblocked)
                         Submitted Apr 16, 18:00 (25 hours, includes recording)
                         Reviewed Apr 16, 18:30
                         Approved Apr 16, 19:00

FINAL REVIEW:            Apr 16, 19:30 (stakeholder watches)
                         Apr 16, 20:00 (approved for ship)

SHIPPED:                 Apr 17, 09:00
```

**Total:** 1.5 days from brief to ship

---

## Job Board Schema for Commercial Work

Each commercial job includes:

```json
{
  "job_id": "JOB-0060",
  "type": "commercial-draft",
  "stage": "draft",  // or "review", "production", "redline", "final"
  
  "objective": "Create engaging Quickstart script",
  "brief": "5-minute walkthrough covering installation, voice setup, first job, dashboard",
  
  "depends_on": [],  // Earlier stages this job depends on
  "blocks": ["JOB-0061"],  // Later stages this job unblocks
  
  "assigned_to": "engineer",
  "submission": { ... },
  
  "review": {
    "reviewed_by": "architect",
    "decision": "approved",
    "feedback": "..."
  }
}
```

---

## Lessons Learned Integration

This workflow encodes lessons from commercial production:

1. **Separate concerns** — Draft, review, production, quality are distinct
2. **One review loop per stage** — Prevents endless cycles
3. **Dependencies matter** — Can't produce from unapproved draft
4. **Stakeholder sign-off is last** — Not automated
5. **Each stage has a gate** — Quality is enforced throughout, not just at the end

---

## Workflow Customization

You can modify stages based on your needs:

### Shorter Workflow (Smaller Projects)

Skip Stage 2 (review) if you trust the author:

```
DRAFT → PRODUCTION → REDLINE → SHIPPED
```

### Longer Workflow (Complex Projects)

Add more review layers:

```
DRAFT → ARCHITECT-REVIEW → SME-REVIEW → PRODUCTION → REDLINE → FINAL-REVIEW → SHIPPED
```

Use `depends_on` to chain them.

### Multi-Agent Production

Parallel work where possible:

```
SCRIPT (Engineer) ━━━┓
                      ┃→ PRODUCTION (Broadside) → REDLINE → SHIPPED
VOICEOVER (Broadside)┛
GRAPHICS (Designer) ━┛
```

All three drafts can be reviewed in parallel before production starts.

---

## Voice Announcements in Commercial Workflow

Each transition triggers a voice announcement:

```
[Engineer submits JOB-0060]
"Engineer calling. Quickstart script submitted for review."

[Architect approves JOB-0060]
"Architect calling. Quickstart script approved for production."

[Broadside submits JOB-0061]
"Broadside calling. Quickstart video produced and submitted for quality review."

[Reviewer approves JOB-0061]
"Reviewer calling. Quickstart video approved for publication."

[Stakeholder ships]
"Dispatch calling. Quickstart video approved and scheduled for publication."
```

Listen to `/audio-feed` to hear progress in real-time.

---

## Checklist: Commercial Production

Before starting, ensure:

- [ ] Objective is clear (one sentence)
- [ ] Success criteria are observable
- [ ] Stage 1 owner (author) is ready
- [ ] Stage 2 owner (reviewer) is available
- [ ] Stage 3 owner (producer) is available
- [ ] Stage 4 owner (Reviewer) is available
- [ ] Stage 5 owner (stakeholder) identified
- [ ] Timeline is realistic (don't under-estimate)
- [ ] Output format is defined (video? doc? podcast?)
- [ ] Distribution plan is clear (where does it go after ship?)

---

## Further Reading

- `docs/JOB_BOARD.md` — Job lifecycle and dependencies
- `docs/REVIEW_WORKFLOW.md` — How Reviewer applies the quality gate
- `docs/OQE_DISCIPLINE.md` — O-Frame structure for commercial jobs
