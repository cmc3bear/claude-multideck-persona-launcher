#!/usr/bin/env python3
"""MultiDeck Job Board CLI

Job creation, assignment, review, and completion tracking for Dispatch agents.

Commands:
  python job-board.py create <subject> [--assigned-to <agent>] [--priority P0|P1|P2|P3] [--depends-on <job-id>]
  python job-board.py list [--status <status>] [--agent <agent>]
  python job-board.py assign <job-id> <agent>
  python job-board.py accept <job-id>
  python job-board.py submit <job-id> --output <path>
  python job-board.py review <job-id> --pass|--flag --note "<text>"
  python job-board.py close <job-id>
  python job-board.py show <job-id>

All commands accept --project <key> to scope to a per-project job board.
Without --project, uses the default state/job-board.json.
With --project, uses state/job-board-<project-key>.json.

Uses state/job-board.json as persistent state. File-locked for concurrent access.

Status flow: open → assigned → in_progress → submitted → pending_review → [passed/flagged] → closed
"""
import sys
import os
import re
import json
import argparse
import time
from pathlib import Path
from datetime import datetime
from contextlib import contextmanager

# Find framework root
SCRIPT_DIR = Path(__file__).resolve().parent
FRAMEWORK_ROOT = SCRIPT_DIR.parent
JOB_BOARD_FILE = FRAMEWORK_ROOT / "state" / "job-board.json"

# Auto-Redline review queue. Per OQE_DISCIPLINE.md §14 the review gate is auto-triggered
# on submit; the marker is the hand-off contract between the submitting agent and the
# (possibly out-of-process) Redline reviewer. See docs/REVIEW_WORKFLOW.md.
PENDING_REVIEWS_DIR = FRAMEWORK_ROOT / "state" / "pending-reviews"
REDLINE_PROMPT_TEMPLATE = (
    FRAMEWORK_ROOT.parent / "dispatch" / "scripts" / "redline-review-prompt.md"
)


def _board_key_from_path(board_file):
    """Return the board key string used in marker files (e.g. 'multideck' or 'default')."""
    bf = board_file or JOB_BOARD_FILE
    if bf == JOB_BOARD_FILE:
        return "default"
    stem = bf.stem  # e.g. 'job-board-multideck'
    return stem.replace("job-board-", "") or "default"


def _pending_marker_path(job_id):
    """Path to the per-job marker file in state/pending-reviews/."""
    return PENDING_REVIEWS_DIR / f"{job_id}.json"


def job_board_path(project=None):
    """Return the job board file path, optionally scoped to a project."""
    if not project:
        return JOB_BOARD_FILE
    safe = re.sub(r"[^a-z0-9-]", "", project.lower())
    if not safe:
        return JOB_BOARD_FILE
    return FRAMEWORK_ROOT / "state" / f"job-board-{safe}.json"

# File locking with simple retry
@contextmanager
def locked_job_board(board_file=None, timeout=5.0):
    """Context manager for thread-safe job board access."""
    bf = board_file or JOB_BOARD_FILE
    bf.parent.mkdir(parents=True, exist_ok=True)

    start = time.time()
    lock_file = bf.with_suffix(".lock")

    while True:
        try:
            with open(lock_file, "x") as f:
                f.write(str(os.getpid()))
            break
        except FileExistsError:
            if time.time() - start > timeout:
                raise TimeoutError(f"Could not acquire lock on {bf}")
            time.sleep(0.1)

    try:
        yield
    finally:
        try:
            lock_file.unlink()
        except FileNotFoundError:
            pass


def load_job_board(board_file=None):
    """Load job board from file."""
    bf = board_file or JOB_BOARD_FILE
    if not bf.exists():
        board = {
            "meta": {"version": 1, "next_job_id": 1},
            "boundary_rule": "AGENTS: This board is scoped to ONE project. Do NOT create, read, or act on jobs from other projects. Cross-project requests go to Dispatch (the coordinator). See docs/JOB_BOARD.md — Project Boundary Enforcement.",
            "jobs": []
        }
        # Embed the project key if scoped
        if bf != JOB_BOARD_FILE:
            stem = bf.stem  # e.g., "job-board-oqe"
            project_key = stem.replace("job-board-", "")
            board["meta"]["project"] = project_key
        return board

    with open(bf) as f:
        return json.load(f)


def save_job_board(data, board_file=None):
    """Save job board to file."""
    bf = board_file or JOB_BOARD_FILE
    bf.parent.mkdir(parents=True, exist_ok=True)
    with open(bf, "w") as f:
        json.dump(data, f, indent=2)


# Per OQE 2.0 §13 project_worktype_job_ids: IDs must be PROJECT-WORKTYPE-####.
# Map state file → PROJECT code (derived from filename stem).
def _project_code_from_board(board_file):
    """Return the PROJECT code for a board file, e.g. job-board-multideck.json -> MULTI."""
    if board_file is None:
        return "WS"
    stem = board_file.stem  # e.g. "job-board-multideck" or "job-board"
    if stem == "job-board":
        return "WS"
    key = stem.replace("job-board-", "").lower()
    # Canonical project code map. Extend here when adding new project boards.
    code_map = {"multideck": "MULTI", "planex-core": "PLANEX", "oqe-labs": "OQE", "workspace": "WS"}
    return code_map.get(key, key.upper().replace("-", ""))


# Valid WORKTYPE codes per OQE 2.0 §13. Keep this list authoritative — reject unknown worktypes
# at create time so the taxonomy doesn't drift.
VALID_WORKTYPES = {
    "INFRA", "OQE", "DOCS", "PERSONA", "GOV", "UI", "API", "PIPE", "DATA",
    "TPL", "MCP", "REV", "FIX", "FEAT", "RESEARCH", "AUDIT",
}


def next_job_id(board_file=None, worktype=None):
    """Get and increment next job ID.

    OQE 2.0 §13: when a worktype is supplied, emit PROJECT-WORKTYPE-#### format.
    Falls back to bare integer for backward compatibility when no worktype is given
    (legacy callers; a warning is printed so the caller fixes it).
    """
    board = load_job_board(board_file)
    n = board["meta"]["next_job_id"]
    board["meta"]["next_job_id"] += 1
    save_job_board(board, board_file)
    if worktype:
        wt = worktype.upper()
        if wt not in VALID_WORKTYPES:
            raise ValueError(
                f"Unknown worktype '{worktype}'. Valid: {sorted(VALID_WORKTYPES)}. "
                f"Extend VALID_WORKTYPES in scripts/job-board.py if a new taxonomy is needed."
            )
        project_code = _project_code_from_board(board_file or JOB_BOARD_FILE)
        return f"{project_code}-{wt}-{int(n):04d}"
    # Legacy path — issue a deprecation warning but still generate a bare int so old callers keep working.
    print(
        f"WARN: job-board.py next_job_id called without --worktype. "
        f"Per OQE 2.0 §13 project_worktype_job_ids, IDs must be PROJECT-WORKTYPE-####. "
        f"This path is deprecated and will be removed.",
        file=sys.stderr,
    )
    return str(n)


def find_job(job_id, board_file=None):
    """Find job by ID."""
    board = load_job_board(board_file)
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            return job
    return None


# OQE 2.0 §11 — citation regex: criterion must reference a §N anchor OR a file.
# Kept in sync with dispatch/dashboard/server.cjs validateJobOqe2() so gate behavior matches.
CITATION_RX = re.compile(r"§\d+|[A-Za-z_-]+\.(md|ts|tsx|js|cjs|mjs|py|json|ps1|bat)(#|\b)")


def _load_criteria_from_file(path):
    """Load criteria from a newline-delimited text file (one per line, blanks ignored).

    JSON arrays are also accepted for callers that prefer structured input.
    """
    data = Path(path).read_text(encoding="utf-8")
    data = data.strip()
    if data.startswith("["):
        items = json.loads(data)
        return [str(x).strip() for x in items if str(x).strip()]
    return [line.strip() for line in data.splitlines() if line.strip() and not line.strip().startswith("#")]


def validate_creation_gate(subject, problem, criteria, oqe_version, worktype):
    """OQE 2.0 creation gate per OQE_DISCIPLINE.md §14.

    Returns (ok, violations). Each violation carries capability + section + detail so the
    caller can surface a specific rule name per §11 linkable_citations_only applied to error output.
    """
    violations = []
    if not subject or not subject.strip():
        violations.append({
            "capability": "subject_required",
            "section": "§14",
            "detail": "subject is empty",
        })
    if not problem or not problem.strip():
        violations.append({
            "capability": "problem_statement_enforced",
            "section": "§11",
            "detail": "problem field is empty or missing — per §11 every job MUST state what is wrong and why it matters",
        })
    if not isinstance(criteria, list):
        criteria = [] if not criteria else [criteria]
    if len(criteria) < 5:
        violations.append({
            "capability": "minimum_5_criteria_enforced",
            "section": "§11",
            "detail": f"criteria count {len(criteria)} < 5 — per §11 the creation gate requires a minimum of 5 testable criteria",
        })
    uncited = [i for i, c in enumerate(criteria) if not CITATION_RX.search(str(c))]
    if uncited:
        violations.append({
            "capability": "linkable_citations_only",
            "section": "§11",
            "detail": f"{len(uncited)} of {len(criteria)} criteria have no §N or file citation — criteria indices: {uncited}",
        })
    if not oqe_version:
        violations.append({
            "capability": "oqe_version_declaration",
            "section": "§12",
            "detail": "oqe_version is missing — per §12 every governed artifact MUST declare its version",
        })
    if not worktype:
        violations.append({
            "capability": "project_worktype_job_ids",
            "section": "§13",
            "detail": "--worktype is required under OQE 2.0 for PROJECT-WORKTYPE-#### IDs",
        })
    return (len(violations) == 0, violations)


def cmd_create(subject, assigned_to=None, priority="P2", depends_on=None, board_file=None,
               worktype=None, problem=None, criteria_file=None, oqe_version="2.0",
               bypass_gate=False):
    """Create a new job.

    OQE 2.0 §14 creation gate — enforces problem, 5-criteria minimum, §N citations,
    oqe_version, and PROJECT-WORKTYPE-#### IDs at author time. Rejects with specific
    capability violations (§11/§12/§13) unless --bypass-gate is set (logged).
    """
    criteria = []
    if criteria_file:
        try:
            criteria = _load_criteria_from_file(criteria_file)
        except Exception as e:
            print(f"ERROR: could not read --criteria-file {criteria_file}: {e}", file=sys.stderr)
            sys.exit(2)

    ok, violations = validate_creation_gate(subject, problem, criteria, oqe_version, worktype)
    if not ok and not bypass_gate:
        print("OQE 2.0 creation gate FAILED — job NOT created.", file=sys.stderr)
        print("Per OQE_DISCIPLINE.md §14 the creation gate blocks non-compliant jobs.", file=sys.stderr)
        for v in violations:
            print(f"  [{v['section']} {v['capability']}] {v['detail']}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Fix the violations above and retry, or pass --bypass-gate to override (logged as non-compliant).", file=sys.stderr)
        sys.exit(3)
    if not ok and bypass_gate:
        print(f"WARN: --bypass-gate set, creating non-compliant job with {len(violations)} violations (logged).", file=sys.stderr)

    job_id = next_job_id(board_file, worktype=worktype)
    job = {
        "id": job_id,
        "oqe_version": oqe_version or "2.0",  # §12 oqe_version_declaration — set at creation time
        "subject": subject,
        "problem": problem or "",  # §11 problem_statement_enforced
        "assigned_to": assigned_to or "unassigned",
        "priority": priority,
        "status": "open",
        "depends_on": depends_on if isinstance(depends_on, list) else ([depends_on] if depends_on else []),
        "criteria": criteria,  # §11 minimum_5_criteria_enforced
        "output_path": None,
        "created_at": datetime.utcnow().isoformat(),
        "accepted_at": None,
        "submitted_at": None,
        "review_history": [],
    }
    if not ok and bypass_gate:
        job["creation_gate_bypassed"] = {
            "at": datetime.utcnow().isoformat(),
            "violations": violations,
            "note": "Created with --bypass-gate; non-compliant per §14. Must be brought to compliance before review gate.",
        }

    board = load_job_board(board_file)
    board["jobs"].append(job)
    save_job_board(board, board_file)

    print(f"Created job {job_id}: {subject}")
    if assigned_to:
        print(f"  Assigned to: {assigned_to}")
    if priority:
        print(f"  Priority: {priority}")
    if ok:
        print(f"  OQE 2.0 creation gate: PASS ({len(criteria)} criteria, all cited, problem present)")
    else:
        print(f"  OQE 2.0 creation gate: BYPASSED — {len(violations)} violations logged on job record")


def cmd_list(status=None, agent=None, board_file=None):
    """List jobs with optional filtering."""
    board = load_job_board(board_file)
    # Remind agents of project boundary on every list
    project = board.get("meta", {}).get("project")
    if project:
        print(f"[{project.upper()} BOARD] You are viewing jobs for the {project} project ONLY.")
        print(f"[{project.upper()} BOARD] Do not act on work outside this project. Route cross-project requests to Dispatch.")
        print()
    jobs = board["jobs"]

    if status:
        jobs = [j for j in jobs if j["status"] == status]
    if agent:
        jobs = [j for j in jobs if j["assigned_to"] == agent]

    if not jobs:
        print("No jobs match criteria.")
        return

    print(f"\n{'ID':<6} {'Status':<15} {'Agent':<15} {'Priority':<5} {'Subject':<50}")
    print("-" * 91)

    for job in sorted(jobs, key=lambda j: int(j["id"])):
        subj = job["subject"][:50]
        print(f"{job['id']:<6} {job['status']:<15} {job['assigned_to']:<15} {job['priority']:<5} {subj:<50}")


def cmd_assign(job_id, agent, board_file=None):
    """Reassign a job to an agent."""
    board = load_job_board(board_file)
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["assigned_to"] = agent
            job["status"] = "assigned"
            save_job_board(board, board_file)
            print(f"Job {job_id} assigned to {agent}")
            return
    print(f"Job not found: {job_id}")


def cmd_accept(job_id, board_file=None):
    """Agent accepts a job (marks in_progress)."""
    board = load_job_board(board_file)
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["status"] = "in_progress"
            job["accepted_at"] = datetime.utcnow().isoformat()
            save_job_board(board, board_file)
            print(f"Job {job_id} accepted (in_progress)")
            return
    print(f"Job not found: {job_id}")


def cmd_submit(job_id, output_path, board_file=None):
    """Agent submits completed job for review.

    Per OQE_DISCIPLINE.md §14 / docs/REVIEW_WORKFLOW.md the Redline gate auto-triggers
    on submit. We write a marker file at state/pending-reviews/<job_id>.json with the
    populated context the redline-review-prompt.md template needs, so an operator or
    watcher dispatch agent can spawn the reviewer with the right job data. The marker
    is removed by cmd_review() on either --pass or --flag.
    """
    board = load_job_board(board_file)
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["status"] = "submitted"
            job["output_path"] = output_path
            submitted_at = datetime.utcnow().isoformat()
            job["submitted_at"] = submitted_at
            save_job_board(board, board_file)

            # Write the auto-Redline queue marker. Only happens after the status
            # transition is persisted, so a missing job ID never produces a marker.
            criteria_list = job.get("criteria", []) or []
            marker = {
                "job_id": job["id"],
                "board_key": _board_key_from_path(board_file),
                "oqe_version": job.get("oqe_version", "1.0"),
                "assigned_to": job.get("assigned_to", "unassigned"),
                "posted_by": job.get("posted_by", ""),
                "problem": job.get("problem", ""),
                "objective": job.get("subject", ""),
                "criteria_count": len(criteria_list),
                "criteria_list": criteria_list,
                "output_path": output_path,
                "submitted_at": submitted_at,
                "redline_prompt_template_path": str(REDLINE_PROMPT_TEMPLATE),
            }
            PENDING_REVIEWS_DIR.mkdir(parents=True, exist_ok=True)
            marker_path = _pending_marker_path(job["id"])
            with open(marker_path, "w") as f:
                json.dump(marker, f, indent=2)

            print(f"Job {job_id} submitted for review")
            print(f"  Output: {output_path}")
            print()
            print("Redline review queued.")
            print(f"  Marker:   state/pending-reviews/{job['id']}.json")
            print(f"  Template: {REDLINE_PROMPT_TEMPLATE}")
            print("  Spawn the reviewer with the job context from the marker file.")
            return
    print(f"Job not found: {job_id}")


def cmd_review(job_id, verdict, note, board_file=None):
    """Reviewer reviews a submitted job (pass or flag)."""
    board = load_job_board(board_file)
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            if job["status"] != "submitted":
                print(f"Job {job_id} is not submitted (status: {job['status']})")
                return

            review_entry = {
                "reviewer": "Reviewer",
                "verdict": verdict,
                "note": note,
                "timestamp": datetime.utcnow().isoformat()
            }
            job["review_history"].append(review_entry)

            if verdict == "pass":
                job["status"] = "closed"
                print(f"Job {job_id} PASSED review and closed")
            elif verdict == "flag":
                job["status"] = "flagged"
                print(f"Job {job_id} FLAGGED and returned to agent")

            if note:
                print(f"  Note: {note}")

            save_job_board(board, board_file)

            # Drain the auto-Redline marker on both pass and flag — the queue must
            # reflect what is actually awaiting review. Missing marker is fine
            # (idempotent), but permission / IO failures must surface so we don't
            # silently leave a stale marker in the queue.
            try:
                os.remove(_pending_marker_path(job["id"]))
            except FileNotFoundError:
                pass
            return

    print(f"Job not found: {job_id}")


def cmd_close(job_id, board_file=None):
    """Close a job with full lifecycle timestamps."""
    board = load_job_board(board_file)
    now = datetime.utcnow().isoformat()
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["status"] = "closed"
            # Auto-populate lifecycle timestamps if missing
            if not job.get("accepted_at"):
                job["accepted_at"] = job.get("created_at", now)
            if not job.get("submitted_at"):
                job["submitted_at"] = now
            if not job.get("completed_at"):
                job["completed_at"] = now
            save_job_board(board, board_file)
            print(f"Job {job_id} closed")
            # Warn if OQE fields are missing (required from Job 48+)
            missing = []
            if not job.get("description"): missing.append("description")
            if not job.get("result"): missing.append("result")
            if not job.get("alternatives_considered"): missing.append("alternatives_considered")
            if not job.get("tags"): missing.append("tags")
            if not job.get("posted_by"): missing.append("posted_by")
            if missing:
                print(f"  WARNING: Missing required fields: {', '.join(missing)}")
                print(f"  See docs/WORKSPACE_GOVERNANCE.md — Job Board Field Requirements")
            return
    print(f"Job not found: {job_id}")


def cmd_show(job_id, board_file=None):
    """Show full details of a job."""
    job = find_job(job_id, board_file)
    if not job:
        print(f"Job not found: {job_id}")
        return

    print(f"\n=== Job {job_id} ===")
    for key, value in job.items():
        if key == "review_history" and isinstance(value, list):
            print(f"{key}:")
            for i, review in enumerate(value, 1):
                print(f"  {i}. {review['verdict'].upper()} — {review.get('note', '(no note)')}")
                print(f"     {review['timestamp']}")
        else:
            print(f"{key:<20} {value}")


def cmd_validate(board_file=None):
    """Validate all jobs for required OQE fields. Reports missing fields per job."""
    board = load_job_board(board_file)
    jobs = board["jobs"]

    create_fields = ["subject", "description", "assigned_to", "priority", "posted_by"]
    close_fields = ["result", "alternatives_considered", "tags", "completed_at"]

    total = len(jobs)
    issues = 0
    clean = 0

    print(f"\n{'ID':<10} {'Status':<10} {'Missing Fields'}")
    print("-" * 80)

    for j in jobs:
        missing = []
        # Check create-time fields on all jobs
        for f in create_fields:
            if not j.get(f):
                missing.append(f)
        # Check close-time fields on closed/completed jobs
        if j.get("status") in ("closed", "completed", "passed", "approved"):
            for f in close_fields:
                if not j.get(f):
                    missing.append(f)
            # Check lifecycle timestamps
            if not j.get("accepted_at"):
                missing.append("accepted_at")
            if not j.get("submitted_at"):
                missing.append("submitted_at")

        jid = str(j.get("id", "?"))
        if not jid.startswith("JOB-"):
            jid = "JOB-" + jid.zfill(4)

        if missing:
            issues += 1
            print(f"{jid:<10} {j.get('status','?'):<10} {', '.join(missing)}")
        else:
            clean += 1

    print(f"\n{'='*80}")
    print(f"TOTAL: {total} jobs | CLEAN: {clean} | ISSUES: {issues}")
    if issues > 0:
        print(f"  {issues} job(s) have missing required fields.")
        print(f"  See docs/WORKSPACE_GOVERNANCE.md — Job Board Field Requirements")
    else:
        print(f"  All jobs pass validation.")
    print()


def main():
    parser = argparse.ArgumentParser(description="MultiDeck Job Board")
    parser.add_argument("--project", default=None,
                        help="Scope to a per-project job board (state/job-board-<project>.json)")
    subparsers = parser.add_subparsers(dest="command", help="Command")

    # create
    create_parser = subparsers.add_parser("create")
    create_parser.add_argument("subject")
    create_parser.add_argument("--assigned-to", default=None)
    create_parser.add_argument("--priority", default="P2", choices=["P0", "P1", "P2", "P3"])
    create_parser.add_argument("--depends-on", default=None)
    create_parser.add_argument(
        "--worktype",
        default=None,
        help=(
            "OQE 2.0 §13: work type code (INFRA, OQE, DOCS, PERSONA, GOV, UI, API, PIPE, DATA, "
            "TPL, MCP, REV, FIX, FEAT, RESEARCH, AUDIT). When set, the generated ID follows "
            "PROJECT-WORKTYPE-#### format. Strongly recommended on all new jobs."
        ),
    )
    create_parser.add_argument(
        "--problem",
        default=None,
        help="OQE 2.0 §11: problem statement — what is wrong and why it matters. Required by creation gate.",
    )
    create_parser.add_argument(
        "--criteria-file",
        default=None,
        help=(
            "OQE 2.0 §11: path to a file with testable criteria (one per line, or a JSON array). "
            "Creation gate requires minimum 5 criteria, each citing a §N anchor or a file path."
        ),
    )
    create_parser.add_argument(
        "--oqe-version",
        default="2.0",
        help="OQE 2.0 §12: version declaration on the job record (default: 2.0).",
    )
    create_parser.add_argument(
        "--bypass-gate",
        action="store_true",
        help="Override the creation gate. Job is still created but marked non-compliant; violations are recorded on the job.",
    )

    # list
    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("--status", default=None)
    list_parser.add_argument("--agent", default=None)

    # assign
    assign_parser = subparsers.add_parser("assign")
    assign_parser.add_argument("job_id")
    assign_parser.add_argument("agent")

    # accept
    accept_parser = subparsers.add_parser("accept")
    accept_parser.add_argument("job_id")

    # submit
    submit_parser = subparsers.add_parser("submit")
    submit_parser.add_argument("job_id")
    submit_parser.add_argument("--output", required=True)

    # review
    review_parser = subparsers.add_parser("review")
    review_parser.add_argument("job_id")
    review_group = review_parser.add_mutually_exclusive_group(required=True)
    review_group.add_argument("--pass", action="store_true")
    review_group.add_argument("--flag", action="store_true")
    review_parser.add_argument("--note", default="")

    # close
    close_parser = subparsers.add_parser("close")
    close_parser.add_argument("job_id")

    # show
    show_parser = subparsers.add_parser("show")
    show_parser.add_argument("job_id")

    # validate
    validate_parser = subparsers.add_parser("validate")

    args = parser.parse_args()
    bf = job_board_path(args.project)

    # Project boundary reminder — printed on every command
    if args.project:
        print(f"[SCOPE: {args.project}] This board is restricted to the {args.project} project.")
        print(f"[SCOPE: {args.project}] Cross-project work must route through the coordinator (Dispatch).")
        print(f"[SCOPE: {args.project}] Do NOT create jobs for other projects on this board.")
        print()

    try:
        if args.command == "create":
            cmd_create(
                args.subject,
                assigned_to=args.assigned_to,
                priority=args.priority,
                depends_on=args.depends_on,
                board_file=bf,
                worktype=args.worktype,
                problem=args.problem,
                criteria_file=args.criteria_file,
                oqe_version=args.oqe_version,
                bypass_gate=args.bypass_gate,
            )
        elif args.command == "list":
            cmd_list(args.status, args.agent, bf)
        elif args.command == "assign":
            cmd_assign(args.job_id, args.agent, bf)
        elif args.command == "accept":
            cmd_accept(args.job_id, bf)
        elif args.command == "submit":
            cmd_submit(args.job_id, args.output, bf)
        elif args.command == "review":
            verdict = "pass" if getattr(args, "pass") else "flag"
            cmd_review(args.job_id, verdict, args.note, bf)
        elif args.command == "close":
            cmd_close(args.job_id, bf)
        elif args.command == "show":
            cmd_show(args.job_id, bf)
        elif args.command == "validate":
            cmd_validate(bf)
        else:
            parser.print_help()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
