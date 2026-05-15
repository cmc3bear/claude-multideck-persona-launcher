#!/usr/bin/env python3
"""OQE 2.0 Standing Gate Scan.

Scans every discoverable job board under the workspace and counts non-compliant
jobs per §11/§12/§13 capability. Emits a JSON summary suitable for the morning
pipeline to surface in the daily briefing (per OQE_DISCIPLINE.md §14 standing
gate requirement).

Boards scanned:
  * dispatch/state/job-board.json (WORKSPACE, declared oqe_version)
  * dispatch-framework/state/job-board*.json (MULTIDECK, PLANEX, etc.)
  * 01-ACTIVE/**/coordination/JOB_BOARD.json (project-level boards)

Usage:
  python oqe-standing-scan.py                  # print summary to stdout
  python oqe-standing-scan.py --json           # emit raw JSON
  python oqe-standing-scan.py --write-state    # also write dispatch/state/oqe-compliance.json

Rule set: the script checks the same capabilities as the /api/launch-job
validator and the job-board.py creation gate, so the three enforcement
surfaces (creation / review / standing) agree on what "compliant" means.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Roots to scan. Add new ones here when you spin up a new project board.
DEFAULT_ROOTS = [
    Path(r"F:\03-INFRASTRUCTURE\dispatch\state"),
    Path(r"F:\03-INFRASTRUCTURE\dispatch-framework\state"),
    Path(r"F:\01-ACTIVE\oqe-labs-signals\dashboards\coordination"),
]

CITATION_RX = re.compile(r"§\d+|[A-Za-z_-]+\.(md|ts|tsx|js|cjs|mjs|py|json|ps1|bat)(#|\b)")
LEGACY_ID_RX = re.compile(r"^[A-Z]+-\d+$")
ACTIVE_STATUSES = {"pending", "accepted", "in_progress", "blocked", "submitted", "open", "assigned", "flagged"}


def discover_boards(roots):
    found = []
    for root in roots:
        if not root.exists():
            continue
        for p in root.rglob("*.json"):
            name = p.name.lower()
            if name == "job_board.json" or (name.startswith("job-board") and not name.endswith(".bak.json")):
                if ".bak" in name:
                    continue
                found.append(p)
    return found


def scan_board(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return {"path": str(path), "error": f"parse failed: {e}"}

    jobs = data.get("jobs", []) or []
    meta = data.get("meta", {}) or {}
    board_oqe_version = meta.get("oqe_version") or data.get("oqe_version")

    per_cap = {
        "problem_statement_enforced": 0,
        "minimum_5_criteria_enforced": 0,
        "linkable_citations_only": 0,
        "oqe_version_declaration": 0,
        "project_worktype_job_ids": 0,
    }
    active_jobs = []
    non_compliant_job_ids = []
    for j in jobs:
        status = j.get("status", "")
        if status not in ACTIVE_STATUSES:
            continue
        active_jobs.append(j.get("id"))
        violations = []
        if not (j.get("problem") or "").strip():
            per_cap["problem_statement_enforced"] += 1
            violations.append("problem_statement_enforced")
        crit = j.get("criteria") or []
        if len(crit) < 5:
            per_cap["minimum_5_criteria_enforced"] += 1
            violations.append("minimum_5_criteria_enforced")
        uncited = sum(1 for c in crit if not CITATION_RX.search(str(c)))
        if uncited > 0:
            per_cap["linkable_citations_only"] += 1
            violations.append(f"linkable_citations_only ({uncited} uncited)")
        if not j.get("oqe_version"):
            per_cap["oqe_version_declaration"] += 1
            violations.append("oqe_version_declaration")
        if LEGACY_ID_RX.match(str(j.get("id", ""))):
            per_cap["project_worktype_job_ids"] += 1
            violations.append("project_worktype_job_ids (legacy)")
        if violations:
            non_compliant_job_ids.append({"id": j.get("id"), "violations": violations})

    return {
        "path": str(path),
        "board_oqe_version": board_oqe_version,
        "strict_mode": (board_oqe_version or "").startswith("2"),
        "jobs_total": len(jobs),
        "jobs_active": len(active_jobs),
        "non_compliant_active": len(non_compliant_job_ids),
        "violations_by_capability": per_cap,
        "non_compliant_job_ids": non_compliant_job_ids,
    }


def roll_up(results):
    total_active = sum(r.get("jobs_active", 0) for r in results if "error" not in r)
    total_nc = sum(r.get("non_compliant_active", 0) for r in results if "error" not in r)
    caps = {}
    for r in results:
        if "error" in r:
            continue
        for k, v in r.get("violations_by_capability", {}).items():
            caps[k] = caps.get(k, 0) + v
    return {
        "boards_scanned": sum(1 for r in results if "error" not in r),
        "boards_failed_to_parse": sum(1 for r in results if "error" in r),
        "active_jobs_total": total_active,
        "non_compliant_active_total": total_nc,
        "compliance_rate": (1 - (total_nc / total_active)) if total_active else 1.0,
        "violations_by_capability": caps,
    }


def main():
    ap = argparse.ArgumentParser(description="OQE 2.0 Standing Gate scan")
    ap.add_argument("--json", action="store_true", help="Emit raw JSON only")
    ap.add_argument("--write-state", action="store_true", help="Write summary to dispatch/state/oqe-compliance.json")
    args = ap.parse_args()

    boards = discover_boards(DEFAULT_ROOTS)
    results = [scan_board(p) for p in boards]
    summary = {
        "oqe_version": "2.0",
        "spec_source": "state/oqe-version.json",
        "scanned_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "rollup": roll_up(results),
        "boards": results,
    }

    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        r = summary["rollup"]
        print(f"OQE 2.0 Standing Gate — {summary['scanned_at']}")
        print(f"  Boards scanned:           {r['boards_scanned']} ({r['boards_failed_to_parse']} failed to parse)")
        print(f"  Active jobs total:        {r['active_jobs_total']}")
        print(f"  Non-compliant active:     {r['non_compliant_active_total']}")
        print(f"  Compliance rate:          {r['compliance_rate']*100:.1f}%")
        print(f"  Violations by capability:")
        for k, v in r["violations_by_capability"].items():
            tag = " §11" if k in ("problem_statement_enforced", "minimum_5_criteria_enforced", "linkable_citations_only") else (" §12" if k == "oqe_version_declaration" else " §13")
            print(f"    {k + tag:<48} {v}")
        print(f"  Per-board:")
        for b in summary["boards"]:
            if "error" in b:
                print(f"    {b['path']}: ERROR {b['error']}")
                continue
            mode = "STRICT" if b["strict_mode"] else "soft-warn (no meta.oqe_version >= 2)"
            print(f"    {Path(b['path']).name:<45} active={b['jobs_active']:<3} nc={b['non_compliant_active']:<3} [{mode}]")

    if args.write_state:
        out = Path(r"F:\03-INFRASTRUCTURE\dispatch\state\oqe-compliance.json")
        out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        if not args.json:
            print(f"\nWrote summary: {out}")


if __name__ == "__main__":
    main()
