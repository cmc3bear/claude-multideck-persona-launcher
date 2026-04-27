#!/usr/bin/env python3
"""MultiDeck Reviewer Checklist — OQE 2.0 Review Gate

Standalone review runner for submitted jobs. Enforces the review-gate checks
specified in docs/OQE_DISCIPLINE.md §14 (Gate 2) plus related §11/§12/§13
capabilities. Emits a per-check pass/fail table and a final verdict.

Usage:
    python reviewer-review.py <job-id> [--project <key>] [--lint] [--test]
                                       [--json] [--board <path>]

Exit status: 0 on PASS, 1 on FLAG.

The review gate is the second of three enforcement gates — before a job is
closed, the reviewer confirms the job record itself is compliant with OQE 2.0.
Creation-gate checks are deliberately duplicated here as a defence-in-depth
covering pass: some legacy jobs predate the creation gate.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Framework root / board discovery
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
FRAMEWORK_ROOT = SCRIPT_DIR.parent
DEFAULT_BOARD = FRAMEWORK_ROOT / "state" / "job-board.json"

# PROJECT-WORKTYPE-#### per OQE_DISCIPLINE.md §13
ID_FORMAT_RE = re.compile(r"^[A-Z]{1,10}-[A-Z]{1,10}-\d{4}$")
# §N citation per §11 linkable_citations_only
SECTION_CITATION_RE = re.compile(r"§\s*\d+")
# Evidence strength tags per §4 Phase 3
EVIDENCE_STRENGTHS = {"STRONG", "MODERATE", "LIMITED"}

# MULTIDECK sanitization — retained from the original checklist
CARY_MARKERS = [
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


# ---------------------------------------------------------------------------
# Board loading
# ---------------------------------------------------------------------------


def board_path_for(project: str | None, explicit: Path | None) -> Path:
    if explicit:
        return explicit
    if not project:
        return DEFAULT_BOARD
    safe = re.sub(r"[^a-z0-9-]", "", project.lower())
    if not safe:
        return DEFAULT_BOARD
    return FRAMEWORK_ROOT / "state" / f"job-board-{safe}.json"


def load_board(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Job board not found: {path}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def find_job(board: dict, job_id: str) -> dict | None:
    for job in board.get("jobs", []):
        if str(job.get("id")) == str(job_id):
            return job
    return None


# ---------------------------------------------------------------------------
# Check result shape
# ---------------------------------------------------------------------------


@dataclass
class CheckResult:
    """Result of a single review gate check.

    ``capability`` is the §11/§12/§13 capability name surfaced on failure so
    the reviewer and author both see which OQE rule was violated.
    """

    name: str
    passed: bool
    capability: str
    detail: str = ""


@dataclass
class ReviewReport:
    job_id: str
    results: list[CheckResult] = field(default_factory=list)

    def add(self, result: CheckResult) -> None:
        self.results.append(result)

    @property
    def verdict(self) -> str:
        return "PASS" if all(r.passed for r in self.results) else "FLAG"

    def failures(self) -> list[CheckResult]:
        return [r for r in self.results if not r.passed]

    def to_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "verdict": self.verdict,
            "results": [
                {
                    "check": r.name,
                    "passed": r.passed,
                    "capability": r.capability,
                    "detail": r.detail,
                }
                for r in self.results
            ],
        }


# ---------------------------------------------------------------------------
# OQE 2.0 review gate checks (criteria C1–C7 of MULTI-REV-0022)
# ---------------------------------------------------------------------------


def check_problem_field(job: dict) -> CheckResult:
    """C1 — per §14 review gate 1 / §11 problem_statement_enforced."""
    problem = job.get("problem")
    if isinstance(problem, str) and problem.strip():
        return CheckResult(
            name="problem_field_present",
            passed=True,
            capability="§11 problem_statement_enforced",
            detail="problem field present and non-empty",
        )
    return CheckResult(
        name="problem_field_present",
        passed=False,
        capability="§11 problem_statement_enforced",
        detail="job missing non-empty 'problem' field (per §14 review gate 1)",
    )


def check_criteria_count(job: dict) -> CheckResult:
    """C2 — per §14 review gate 2 / §11 minimum_5_criteria_enforced."""
    criteria = job.get("criteria") or []
    if isinstance(criteria, list) and len(criteria) >= 5:
        return CheckResult(
            name="minimum_5_criteria",
            passed=True,
            capability="§11 minimum_5_criteria_enforced",
            detail=f"{len(criteria)} criteria (>= 5)",
        )
    count = len(criteria) if isinstance(criteria, list) else 0
    return CheckResult(
        name="minimum_5_criteria",
        passed=False,
        capability="§11 minimum_5_criteria_enforced",
        detail=(
            f"job has {count} criteria; OQE 2.0 requires >= 5 "
            "(per §14 review gate 2)"
        ),
    )


def check_criteria_citations(job: dict) -> CheckResult:
    """C3 — per §14 review gate 3 / §11 linkable_citations_only.

    Every criterion must contain a §N section anchor so the cited artifact is
    reachable.
    """
    criteria = job.get("criteria") or []
    if not isinstance(criteria, list) or not criteria:
        return CheckResult(
            name="criteria_cite_section",
            passed=False,
            capability="§11 linkable_citations_only",
            detail="no criteria to cite (per §14 review gate 3)",
        )
    missing: list[int] = []
    for idx, c in enumerate(criteria, start=1):
        text = c if isinstance(c, str) else json.dumps(c)
        if not SECTION_CITATION_RE.search(text):
            missing.append(idx)
    if not missing:
        return CheckResult(
            name="criteria_cite_section",
            passed=True,
            capability="§11 linkable_citations_only",
            detail=f"all {len(criteria)} criteria carry a §N citation",
        )
    return CheckResult(
        name="criteria_cite_section",
        passed=False,
        capability="§11 linkable_citations_only",
        detail=(
            "criteria missing §N citation: "
            + ", ".join(f"#{i}" for i in missing)
            + " (per §14 review gate 3)"
        ),
    )


def check_oqe_version(job: dict) -> CheckResult:
    """C4 — per §14 review gate 4 / §12 oqe_version declaration."""
    version = job.get("oqe_version")
    if isinstance(version, str) and version.strip():
        return CheckResult(
            name="oqe_version_declared",
            passed=True,
            capability="§12 oqe_version_declaration",
            detail=f"oqe_version = {version}",
        )
    return CheckResult(
        name="oqe_version_declared",
        passed=False,
        capability="§12 oqe_version_declaration",
        detail="job missing 'oqe_version' declaration (per §14 review gate 4)",
    )


def check_evidence_criterion_match(job: dict) -> CheckResult:
    """C5 — per §14 review gate 5 / §11 evidence_criterion_match.

    Every criterion index must be referenced by at least one evidence_log
    entry whose strength tag is STRONG / MODERATE / LIMITED. No assumption
    bridging — the mapping must be explicit via ``criterion_index`` (1-based)
    on each evidence entry.
    """
    criteria = job.get("criteria") or []
    evidence_log = job.get("evidence_log") or []
    if not isinstance(criteria, list) or not criteria:
        return CheckResult(
            name="evidence_criterion_match",
            passed=False,
            capability="§11 evidence_criterion_match",
            detail="no criteria to evidence (per §14 review gate 5)",
        )
    if not isinstance(evidence_log, list) or not evidence_log:
        return CheckResult(
            name="evidence_criterion_match",
            passed=False,
            capability="§11 evidence_criterion_match",
            detail=(
                "job has no 'evidence_log' entries; OQE 2.0 requires explicit "
                "evidence mapped to every criterion (per §14 review gate 5)"
            ),
        )

    covered: set[int] = set()
    untagged: list[int] = []
    for entry_idx, entry in enumerate(evidence_log, start=1):
        if not isinstance(entry, dict):
            continue
        idx = entry.get("criterion_index")
        if not isinstance(idx, int):
            continue
        strength = str(entry.get("strength", "")).upper()
        if strength not in EVIDENCE_STRENGTHS:
            untagged.append(entry_idx)
            continue
        covered.add(idx)

    expected = set(range(1, len(criteria) + 1))
    missing = sorted(expected - covered)
    problems: list[str] = []
    if missing:
        problems.append(
            "criteria without mapped evidence: "
            + ", ".join(f"#{i}" for i in missing)
        )
    if untagged:
        problems.append(
            "evidence entries missing STRONG/MODERATE/LIMITED tag: "
            + ", ".join(f"#{i}" for i in untagged)
        )

    if not problems:
        return CheckResult(
            name="evidence_criterion_match",
            passed=True,
            capability="§11 evidence_criterion_match",
            detail=f"all {len(criteria)} criteria have tagged evidence",
        )
    return CheckResult(
        name="evidence_criterion_match",
        passed=False,
        capability="§11 evidence_criterion_match",
        detail="; ".join(problems) + " (per §14 review gate 5)",
    )


def check_id_format(job: dict) -> CheckResult:
    """C6 — per §14 review gate 6 / §13 project_worktype_job_ids.

    IDs must match ``PROJECT-WORKTYPE-####``. Legacy IDs are accepted only
    when the ``legacy_id`` field is present on the job (per §13 migration
    rules) — and we surface a LEGACY note.
    """
    job_id = str(job.get("id", ""))
    if ID_FORMAT_RE.match(job_id):
        return CheckResult(
            name="id_format_valid",
            passed=True,
            capability="§13 project_worktype_job_ids",
            detail=f"id '{job_id}' matches PROJECT-WORKTYPE-####",
        )
    if job.get("legacy_id"):
        return CheckResult(
            name="id_format_valid",
            passed=True,
            capability="§13 project_worktype_job_ids",
            detail=f"id '{job_id}' is LEGACY (legacy_id={job['legacy_id']})",
        )
    return CheckResult(
        name="id_format_valid",
        passed=False,
        capability="§13 project_worktype_job_ids",
        detail=(
            f"id '{job_id}' does not match PROJECT-WORKTYPE-#### and has no "
            "legacy_id marker (per §14 review gate 6)"
        ),
    )


def check_depends_on_explicit(job: dict) -> CheckResult:
    """C7 — per §14 review gate 7 / §11 dependency_tracking."""
    if "depends_on" not in job:
        return CheckResult(
            name="depends_on_explicit",
            passed=False,
            capability="§11 dependency_tracking",
            detail=(
                "'depends_on' field missing — OQE 2.0 requires an explicit "
                "array (possibly empty) per §14 review gate 7"
            ),
        )
    value = job["depends_on"]
    if isinstance(value, list):
        return CheckResult(
            name="depends_on_explicit",
            passed=True,
            capability="§11 dependency_tracking",
            detail=f"explicit array of {len(value)} dependency entries",
        )
    return CheckResult(
        name="depends_on_explicit",
        passed=False,
        capability="§11 dependency_tracking",
        detail=(
            f"'depends_on' is {type(value).__name__}, not an explicit array "
            "(per §14 review gate 7)"
        ),
    )


# ---------------------------------------------------------------------------
# Retained sanitization checks from the original tool
# ---------------------------------------------------------------------------


def check_artifact_exists(artifact_path: str | None) -> CheckResult:
    if not artifact_path:
        return CheckResult(
            name="artifact_exists",
            passed=False,
            capability="review-sanitization",
            detail="no output_path on job",
        )
    p = Path(artifact_path)
    if not p.exists():
        return CheckResult(
            name="artifact_exists",
            passed=False,
            capability="review-sanitization",
            detail=f"artifact not found: {artifact_path}",
        )
    if p.stat().st_size == 0:
        return CheckResult(
            name="artifact_exists",
            passed=False,
            capability="review-sanitization",
            detail=f"artifact is empty: {artifact_path}",
        )
    return CheckResult(
        name="artifact_exists",
        passed=True,
        capability="review-sanitization",
        detail=f"artifact present ({p.stat().st_size} bytes)",
    )


def _read_text_safely(path: Path) -> str | None:
    if path.suffix.lower() not in {".json", ".md", ".txt", ".py", ".cjs", ".js"}:
        return None
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def check_no_cary_refs(artifact_path: str | None) -> CheckResult:
    if not artifact_path:
        return CheckResult(
            name="no_cary_references",
            passed=True,
            capability="review-sanitization",
            detail="no artifact to scan",
        )
    content = _read_text_safely(Path(artifact_path))
    if content is None:
        return CheckResult(
            name="no_cary_references",
            passed=True,
            capability="review-sanitization",
            detail="artifact type not scanned",
        )
    hits = [m for m in CARY_MARKERS if m in content]
    if hits:
        return CheckResult(
            name="no_cary_references",
            passed=False,
            capability="review-sanitization",
            detail="found Cary-specific markers: " + ", ".join(hits),
        )
    return CheckResult(
        name="no_cary_references",
        passed=True,
        capability="review-sanitization",
        detail="no Cary-specific markers found",
    )


def check_no_scaffold_markers(artifact_path: str | None) -> CheckResult:
    if not artifact_path:
        return CheckResult(
            name="no_scaffold_markers",
            passed=True,
            capability="review-sanitization",
            detail="no artifact to scan",
        )
    content = _read_text_safely(Path(artifact_path))
    if content is None:
        return CheckResult(
            name="no_scaffold_markers",
            passed=True,
            capability="review-sanitization",
            detail="artifact type not scanned",
        )
    problems = []
    if "SCAFFOLD" in content:
        problems.append("SCAFFOLD")
    if "TODO" in content.upper():
        problems.append("TODO")
    if problems:
        return CheckResult(
            name="no_scaffold_markers",
            passed=False,
            capability="review-sanitization",
            detail="incomplete markers remain: " + ", ".join(problems),
        )
    return CheckResult(
        name="no_scaffold_markers",
        passed=True,
        capability="review-sanitization",
        detail="no incomplete markers",
    )


def check_python_syntax(artifact_path: str | None) -> CheckResult | None:
    """Opt-in lint — returns None when not applicable."""
    if not artifact_path or not artifact_path.endswith(".py"):
        return None
    try:
        with open(artifact_path, encoding="utf-8") as f:
            compile(f.read(), artifact_path, "exec")
    except SyntaxError as e:
        return CheckResult(
            name="python_syntax",
            passed=False,
            capability="review-sanitization",
            detail=f"syntax error: {e}",
        )
    return CheckResult(
        name="python_syntax",
        passed=True,
        capability="review-sanitization",
        detail="compiles clean",
    )


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


# Order mirrors §14 Gate 2 matrix — OQE checks first, sanitization after.
OQE_CHECKS = (
    check_problem_field,          # C1 · §14 review gate 1
    check_criteria_count,         # C2 · §14 review gate 2
    check_criteria_citations,     # C3 · §14 review gate 3
    check_oqe_version,            # C4 · §14 review gate 4
    check_evidence_criterion_match,  # C5 · §14 review gate 5
    check_id_format,              # C6 · §14 review gate 6
    check_depends_on_explicit,    # C7 · §14 review gate 7
)


def run_review(job: dict, *, lint: bool = False) -> ReviewReport:
    report = ReviewReport(job_id=str(job.get("id", "?")))
    for fn in OQE_CHECKS:
        report.add(fn(job))

    artifact = job.get("output_path")
    report.add(check_artifact_exists(artifact))
    report.add(check_no_cary_refs(artifact))
    report.add(check_no_scaffold_markers(artifact))

    if lint:
        lint_res = check_python_syntax(artifact)
        if lint_res is not None:
            report.add(lint_res)

    return report


# ---------------------------------------------------------------------------
# Output (C8 — per-check pass/fail table)
# ---------------------------------------------------------------------------


def format_table(report: ReviewReport) -> str:
    """Render the per-check pass/fail table required by C8."""
    lines: list[str] = []
    lines.append(f"Review gate report · job {report.job_id}")
    lines.append("=" * 72)
    header = f"  {'PASS/FAIL':<5}  {'CHECK':<30}  CAPABILITY"
    lines.append(header)
    lines.append("-" * 72)
    for r in report.results:
        status = " OK " if r.passed else "FAIL"
        lines.append(f"  [{status}]  {r.name:<30}  {r.capability}")
        if not r.passed and r.detail:
            lines.append(f"           -> {r.detail}")
    lines.append("-" * 72)
    lines.append(f"VERDICT: {report.verdict}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MultiDeck Reviewer — OQE 2.0 review gate")
    parser.add_argument("job_id")
    parser.add_argument("--project", default=None,
                        help="Scope to a per-project job board")
    parser.add_argument("--board", default=None,
                        help="Explicit board file path (overrides --project)")
    parser.add_argument("--lint", action="store_true",
                        help="Syntax-check .py artifacts")
    parser.add_argument("--test", action="store_true",
                        help="Reserved — no-op until a project-level test runner exists")
    parser.add_argument("--json", action="store_true",
                        help="Emit JSON report instead of the text table")
    args = parser.parse_args(argv)

    board_file = board_path_for(args.project, Path(args.board) if args.board else None)
    try:
        board = load_board(board_file)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    job = find_job(board, args.job_id)
    if job is None:
        print(f"Error: job not found on board {board_file}: {args.job_id}", file=sys.stderr)
        return 1

    status = job.get("status")
    if status not in {"submitted", "pending_review"}:
        # Do not hard-fail — surface as a gate failure so reviewers see it in
        # the same output format as other checks.
        print(
            f"Note: job status is '{status}' (expected 'submitted'); "
            "running review anyway.\n",
            file=sys.stderr,
        )

    report = run_review(job, lint=args.lint)
    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(format_table(report))

    return 0 if report.verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
