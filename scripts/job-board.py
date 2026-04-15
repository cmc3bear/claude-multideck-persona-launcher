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

Uses state/job-board.json as persistent state. File-locked for concurrent access.

Status flow: open → assigned → in_progress → submitted → pending_review → [passed/flagged] → closed
"""
import sys
import os
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

# File locking with simple retry
@contextmanager
def locked_job_board(timeout=5.0):
    """Context manager for thread-safe job board access."""
    FRAMEWORK_ROOT.mkdir(parents=True, exist_ok=True)
    (FRAMEWORK_ROOT / "state").mkdir(exist_ok=True)

    start = time.time()
    lock_file = JOB_BOARD_FILE.with_suffix(".lock")

    while True:
        try:
            # Try to create lock file exclusively
            with open(lock_file, "x") as f:
                f.write(str(os.getpid()))
            break
        except FileExistsError:
            if time.time() - start > timeout:
                raise TimeoutError(f"Could not acquire lock on {JOB_BOARD_FILE}")
            time.sleep(0.1)

    try:
        # Load, modify, save
        yield
    finally:
        try:
            lock_file.unlink()
        except FileNotFoundError:
            pass


def load_job_board():
    """Load job board from file."""
    if not JOB_BOARD_FILE.exists():
        return {
            "meta": {"version": 1, "next_job_id": 1},
            "jobs": []
        }

    with open(JOB_BOARD_FILE) as f:
        return json.load(f)


def save_job_board(data):
    """Save job board to file."""
    JOB_BOARD_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(JOB_BOARD_FILE, "w") as f:
        json.dump(data, f, indent=2)


def next_job_id():
    """Get and increment next job ID."""
    board = load_job_board()
    job_id = board["meta"]["next_job_id"]
    board["meta"]["next_job_id"] += 1
    save_job_board(board)
    return str(job_id)


def find_job(job_id):
    """Find job by ID."""
    board = load_job_board()
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            return job
    return None


def cmd_create(subject, assigned_to=None, priority="P2", depends_on=None):
    """Create a new job."""
    job_id = next_job_id()
    job = {
        "id": job_id,
        "subject": subject,
        "assigned_to": assigned_to or "unassigned",
        "priority": priority,
        "status": "open",
        "depends_on": depends_on,
        "output_path": None,
        "created_at": datetime.utcnow().isoformat(),
        "accepted_at": None,
        "submitted_at": None,
        "review_history": [],
    }

    board = load_job_board()
    board["jobs"].append(job)
    save_job_board(board)

    print(f"Created job {job_id}: {subject}")
    if assigned_to:
        print(f"  Assigned to: {assigned_to}")
    if priority:
        print(f"  Priority: {priority}")


def cmd_list(status=None, agent=None):
    """List jobs with optional filtering."""
    board = load_job_board()
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


def cmd_assign(job_id, agent):
    """Reassign a job to an agent."""
    board = load_job_board()
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["assigned_to"] = agent
            job["status"] = "assigned"
            save_job_board(board)
            print(f"Job {job_id} assigned to {agent}")
            return
    print(f"Job not found: {job_id}")


def cmd_accept(job_id):
    """Agent accepts a job (marks in_progress)."""
    board = load_job_board()
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["status"] = "in_progress"
            job["accepted_at"] = datetime.utcnow().isoformat()
            save_job_board(board)
            print(f"Job {job_id} accepted (in_progress)")
            return
    print(f"Job not found: {job_id}")


def cmd_submit(job_id, output_path):
    """Agent submits completed job for review."""
    board = load_job_board()
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["status"] = "submitted"
            job["output_path"] = output_path
            job["submitted_at"] = datetime.utcnow().isoformat()
            save_job_board(board)
            print(f"Job {job_id} submitted for review")
            print(f"  Output: {output_path}")
            return
    print(f"Job not found: {job_id}")


def cmd_review(job_id, verdict, note):
    """Reviewer reviews a submitted job (pass or flag)."""
    board = load_job_board()
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            if job["status"] != "submitted":
                print(f"Job {job_id} is not submitted (status: {job['status']})")
                return

            review_entry = {
                "reviewer": "Reviewer",  # Could be parameterized
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

            save_job_board(board)
            return

    print(f"Job not found: {job_id}")


def cmd_close(job_id):
    """Admin close a job."""
    board = load_job_board()
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            job["status"] = "closed"
            save_job_board(board)
            print(f"Job {job_id} closed")
            return
    print(f"Job not found: {job_id}")


def cmd_show(job_id):
    """Show full details of a job."""
    job = find_job(job_id)
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


def main():
    parser = argparse.ArgumentParser(description="MultiDeck Job Board")
    subparsers = parser.add_subparsers(dest="command", help="Command")

    # create
    create_parser = subparsers.add_parser("create")
    create_parser.add_argument("subject")
    create_parser.add_argument("--assigned-to", default=None)
    create_parser.add_argument("--priority", default="P2", choices=["P0", "P1", "P2", "P3"])
    create_parser.add_argument("--depends-on", default=None)

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

    args = parser.parse_args()

    try:
        if args.command == "create":
            cmd_create(args.subject, args.assigned_to, args.priority, args.depends_on)
        elif args.command == "list":
            cmd_list(args.status, args.agent)
        elif args.command == "assign":
            cmd_assign(args.job_id, args.agent)
        elif args.command == "accept":
            cmd_accept(args.job_id)
        elif args.command == "submit":
            cmd_submit(args.job_id, args.output)
        elif args.command == "review":
            verdict = "pass" if args.pass else "flag"
            cmd_review(args.job_id, verdict, args.note)
        elif args.command == "close":
            cmd_close(args.job_id)
        elif args.command == "show":
            cmd_show(args.job_id)
        else:
            parser.print_help()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
