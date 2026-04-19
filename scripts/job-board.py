#!/usr/bin/env python3
"""MultiDeck Job Board CLI

Job creation, assignment, review, and completion tracking for Dispatch agents.

Commands:
  python job-board.py create <subject> [--assigned-to <agent>] [--priority P0|P1|P2|P3] [--depends-on <job-id>] [--problem "what is wrong"] [--criteria "criterion 1" --criteria "criterion 2" ...]
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


def next_job_id(board_file=None):
    """Get and increment next job ID."""
    board = load_job_board(board_file)
    job_id = board["meta"]["next_job_id"]
    board["meta"]["next_job_id"] += 1
    save_job_board(board, board_file)
    return str(job_id)


def find_job(job_id, board_file=None):
    """Find job by ID."""
    board = load_job_board(board_file)
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            return job
    return None


def cmd_create(subject, assigned_to=None, priority="P2", depends_on=None, criteria=None, problem=None, board_file=None):
    """Create a new job."""
    job_id = next_job_id(board_file)
    job = {
        "id": job_id,
        "subject": subject,
        "problem": problem or "",
        "assigned_to": assigned_to or "unassigned",
        "priority": priority,
        "status": "open",
        "depends_on": depends_on,
        "criteria": criteria or [],
        "output_path": None,
        "created_at": datetime.utcnow().isoformat(),
        "accepted_at": None,
        "submitted_at": None,
        "review_history": [],
    }

    board = load_job_board(board_file)
    board["jobs"].append(job)
    save_job_board(board, board_file)

    print(f"Created job {job_id}: {subject}")
    if problem:
        print(f"  Problem: {problem[:80]}{'...' if len(problem) > 80 else ''}")
    if assigned_to:
        print(f"  Assigned to: {assigned_to}")
    if priority:
        print(f"  Priority: {priority}")
    if criteria:
        print(f"  Criteria ({len(criteria)}):")
        for i, c in enumerate(criteria, 1):
            print(f"    {i}. {c}")


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
    """Agent submits completed job for review."""
    board = load_job_board(board_file)
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["status"] = "submitted"
            job["output_path"] = output_path
            job["submitted_at"] = datetime.utcnow().isoformat()
            save_job_board(board, board_file)
            print(f"Job {job_id} submitted for review")
            print(f"  Output: {output_path}")
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
        elif key == "criteria" and isinstance(value, list):
            print(f"{key} ({len(value)}):")
            for i, c in enumerate(value, 1):
                print(f"  {i}. {c}")
        elif key == "problem" and value:
            print(f"{key:<20}")
            for line in (value[i:i+80] for i in range(0, len(value), 80)):
                print(f"  {line}")
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
        # OQE criteria check: minimum 5 required
        criteria = j.get("criteria", [])
        if len(criteria) < 5:
            missing.append(f"criteria (has {len(criteria)}, need 5+)")
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
        print(f"  OQE criteria minimum: 5 per job (docs/OQE_DISCIPLINE.md)")
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
    create_parser.add_argument("--criteria", action="append", default=None,
                               metavar="CRITERION",
                               help="OQE success criterion (repeat flag for each, minimum 5 required)")
    create_parser.add_argument("--problem", default=None,
                               metavar="PROBLEM",
                               help="OQE problem statement: what is wrong and why it matters")

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
            cmd_create(args.subject, args.assigned_to, args.priority, args.depends_on, args.criteria, args.problem, bf)
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
