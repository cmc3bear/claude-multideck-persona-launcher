#!/usr/bin/env python3
"""MultiDeck Reviewer Checklist

Standalone review runner for job artifacts. Takes a job ID, loads the job's output,
runs a checklist, and emits PASS or FLAG with notes.

Usage: python reviewer-review.py <job-id> [--lint] [--test]

Called by the Reviewer agent.
"""
import sys
import os
import json
import argparse
from pathlib import Path

# Find framework root
SCRIPT_DIR = Path(__file__).resolve().parent
FRAMEWORK_ROOT = SCRIPT_DIR.parent
JOB_BOARD_FILE = FRAMEWORK_ROOT / "state" / "job-board.json"


def load_job_board():
    """Load job board from file."""
    if not JOB_BOARD_FILE.exists():
        return {"meta": {"version": 1, "next_job_id": 1}, "jobs": []}
    with open(JOB_BOARD_FILE) as f:
        return json.load(f)


def find_job(job_id):
    """Find job by ID."""
    board = load_job_board()
    for job in board["jobs"]:
        if job["id"] == str(job_id):
            return job
    return None


def check_artifact_exists(artifact_path):
    """Check if output artifact exists and has reasonable size."""
    p = Path(artifact_path)
    if not p.exists():
        return False, f"Artifact not found: {artifact_path}"
    if p.stat().st_size == 0:
        return False, f"Artifact is empty: {artifact_path}"
    return True, None


def check_for_cary_references(artifact_path):
    """Check for Cary-specific references in sanitized content."""
    try:
        p = Path(artifact_path)
        if p.suffix in [".json", ".md", ".txt"]:
            with open(p) as f:
                content = f.read()
            # Check for common Cary-specific markers
            cary_markers = [
                "Cary",
                "cmc3b",
                "OQE Labs",
                "Sentinel",
                "Ledger",
                "Relay",
                "Broadside",
                "Redline",
                "Prism",
                "Framelock",
                "Ficsit",
                "Smith",
                "Tailscale",
                "100.79.177.54",
                "100.88.110.19",
            ]
            for marker in cary_markers:
                if marker in content:
                    return False, f"Found Cary-specific reference: '{marker}'"
        return True, None
    except Exception as e:
        return False, f"Could not check content: {e}"


def check_no_scaffold_markers(artifact_path):
    """Check that SCAFFOLD markers have been removed."""
    try:
        p = Path(artifact_path)
        if p.suffix in [".json", ".md", ".txt", ".py", ".cjs"]:
            with open(p) as f:
                content = f.read()
            if "SCAFFOLD" in content or "TODO" in content.upper():
                return False, "Found incomplete SCAFFOLD or TODO markers"
        return True, None
    except Exception as e:
        return False, f"Could not check markers: {e}"


def run_checklist(job_id, lint=False, test=False):
    """Run the review checklist and return (verdict, notes)."""
    job = find_job(job_id)
    if not job:
        return "FLAG", f"Job not found: {job_id}"

    if job["status"] != "submitted":
        return "FLAG", f"Job is not submitted (status: {job['status']})"

    artifact_path = job.get("output_path")
    if not artifact_path:
        return "FLAG", "No output artifact specified in job"

    issues = []

    # Check 1: Artifact exists and is reasonable size
    ok, msg = check_artifact_exists(artifact_path)
    if not ok:
        issues.append(msg)

    # Check 2: No Cary-specific references
    ok, msg = check_for_cary_references(artifact_path)
    if not ok:
        issues.append(msg)

    # Check 3: No SCAFFOLD markers
    ok, msg = check_no_scaffold_markers(artifact_path)
    if not ok:
        issues.append(msg)

    # Optional: lint (if applicable)
    if lint and artifact_path.endswith(".py"):
        # Simple syntax check
        try:
            with open(artifact_path) as f:
                compile(f.read(), artifact_path, "exec")
        except SyntaxError as e:
            issues.append(f"Python syntax error: {e}")

    # Optional: test (if applicable)
    if test:
        issues.append("Test suite not implemented yet (placeholder)")

    # Verdict
    if issues:
        verdict = "FLAG"
        notes = "Issues found:\n" + "\n".join(f"  - {issue}" for issue in issues)
    else:
        verdict = "PASS"
        notes = "All checks passed."

    return verdict, notes


def main():
    parser = argparse.ArgumentParser(description="MultiDeck Reviewer Checklist")
    parser.add_argument("job_id")
    parser.add_argument("--lint", action="store_true", help="Run lint checks (Python files)")
    parser.add_argument("--test", action="store_true", help="Run tests (if available)")

    args = parser.parse_args()

    try:
        verdict, notes = run_checklist(args.job_id, args.lint, args.test)
        print(f"VERDICT: {verdict}")
        print(f"NOTES:\n{notes}")
        sys.exit(0 if verdict == "PASS" else 1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
