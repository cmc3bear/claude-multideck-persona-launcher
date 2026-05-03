#!/usr/bin/env python3
"""
MultiDeck VS-mode comparator.

Pairs two completed jobs that ran the same spec under different runtimes
(claude vs opencode) and produces a per-criterion scorecard. Writes results
to state/vs-scoreboard.json. The scoreboard is the operator's evidence trail
for "is OpenCode competent enough yet?"

VS jobs are tagged with `runtime: vs` plus matching `vs_pair_id`. The
runtime-specific outputs are stored as separate completed jobs with
`runtime: claude` or `runtime: opencode` and the same `vs_pair_id`.

Usage:
    python vs-comparator.py compare <claude-job-id> <opencode-job-id>
        Run a single comparison. Job IDs come from `job-board.py list`.

    python vs-comparator.py auto
        Find all unpaired vs_pair_id entries, compare each, write scoreboard.

    python vs-comparator.py board
        Print the current scoreboard summary.

Scoring is structural in v1 (criteria coverage + evidence presence). The
--judge flag optionally invokes a runtime to render a written verdict on
each criterion, but the structural score is always computed.

Per OQE 2.0 (docs/OQE_DISCIPLINE.md §11): each job carries 5+ testable
criteria. Each criterion is scored MET / PARTIAL / MISSING per runtime.
The MET count and the evidence-tag distribution drive the verdict.
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
FRAMEWORK_ROOT = SCRIPT_DIR.parent
STATE_DIR = FRAMEWORK_ROOT / "state"
SCOREBOARD_PATH = STATE_DIR / "vs-scoreboard.json"

EVIDENCE_TAGS = ("STRONG", "MODERATE", "LIMITED", "MISSING")


def load_job_board(project=None):
    """Load the appropriate job-board JSON. Mirrors job-board.py path resolution."""
    if project:
        safe = re.sub(r"[^a-z0-9-]", "", project.lower())
        candidate = STATE_DIR / f"job-board-{safe}.json"
    else:
        candidate = STATE_DIR / "job-board.json"
    if not candidate.exists():
        raise FileNotFoundError(f"job board not found at {candidate}")
    with candidate.open(encoding="utf-8") as f:
        return json.load(f), candidate


def find_job(board, job_id):
    """Locate a job by id in the loaded board structure."""
    jobs = board.get("jobs") or []
    for j in jobs:
        if j.get("id") == job_id:
            return j
    raise KeyError(f"job {job_id} not in board")


def read_output_artifact(job):
    """Read the submitted output artifact for a job, if present."""
    out_path = job.get("output")
    if not out_path:
        return ""
    p = Path(out_path)
    if not p.is_absolute():
        p = FRAMEWORK_ROOT / out_path
    if not p.exists():
        return f"<output artifact missing: {p}>"
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return f"<failed to read artifact: {e}>"


def score_criterion(criterion: str, artifact: str) -> dict:
    """Cheap structural score: criterion mentioned + evidence-tag presence near it.

    Returns {match, evidence_tag, snippet}. Honest-but-naive — the LLM judge
    pass below is what produces a defensible verdict. This is a fast filter
    that surfaces the obvious gaps (criterion not addressed at all).
    """
    if not artifact:
        return {"match": False, "evidence_tag": "MISSING", "snippet": ""}
    norm_crit = criterion.lower().strip()
    # Pull a few keywords from the criterion for fuzzy match — first 3 nouns/verbs.
    tokens = [t for t in re.findall(r"[A-Za-z][A-Za-z_-]{3,}", norm_crit) if t.lower() not in {"that", "must", "with", "from", "this", "have", "should", "when", "then"}]
    tokens = tokens[:4]
    if not tokens:
        return {"match": False, "evidence_tag": "MISSING", "snippet": ""}
    artifact_lower = artifact.lower()
    hit_count = sum(1 for tok in tokens if tok.lower() in artifact_lower)
    matched = hit_count >= max(1, len(tokens) // 2)
    if not matched:
        return {"match": False, "evidence_tag": "MISSING", "snippet": ""}
    # Find a 200-char window around the strongest hit
    pos = -1
    for tok in tokens:
        p = artifact_lower.find(tok.lower())
        if p != -1 and (pos == -1 or p < pos):
            pos = p
    snippet = artifact[max(0, pos - 80): pos + 220].replace("\n", " ").strip() if pos >= 0 else ""
    # Look for an evidence tag near the snippet
    tag = "MODERATE"
    for t in EVIDENCE_TAGS:
        if t in snippet:
            tag = t
            break
    return {"match": True, "evidence_tag": tag, "snippet": snippet}


def score_pair(claude_job, opencode_job):
    criteria = claude_job.get("criteria") or opencode_job.get("criteria") or []
    if not criteria:
        return {"criteria_scores": [], "warning": "no criteria on either job — OQE 2.0 violation"}
    claude_art = read_output_artifact(claude_job)
    opencode_art = read_output_artifact(opencode_job)
    rows = []
    for c in criteria:
        text = c if isinstance(c, str) else c.get("text", str(c))
        rows.append({
            "criterion": text,
            "claude": score_criterion(text, claude_art),
            "opencode": score_criterion(text, opencode_art),
        })
    return {"criteria_scores": rows}


def verdict_from_rows(rows):
    """Verdict: who hit more criteria with stronger evidence."""
    if not rows:
        return "inconclusive", {"claude": 0, "opencode": 0}
    weight = {"STRONG": 3, "MODERATE": 2, "LIMITED": 1, "MISSING": 0}
    scores = {"claude": 0, "opencode": 0}
    for r in rows:
        for runtime in ("claude", "opencode"):
            cell = r.get(runtime, {})
            if cell.get("match"):
                scores[runtime] += weight.get(cell.get("evidence_tag", "MODERATE"), 0)
    if scores["claude"] > scores["opencode"]:
        v = "claude"
    elif scores["opencode"] > scores["claude"]:
        v = "opencode"
    else:
        v = "tie"
    return v, scores


def invoke_judge(rows, judge_runtime: str, project_root: Path) -> str:
    """Optionally have a runtime render a written verdict on the comparison.

    judge_runtime: 'claude' or 'opencode'. The judge sees the criteria + both
    runtimes' snippets and produces a paragraph verdict. Skipped silently on
    failure — the structural score still applies.
    """
    if judge_runtime not in ("claude", "opencode"):
        return ""
    prompt_lines = [
        "You are judging a head-to-head comparison of two AI runtimes that handled the same MultiDeck job under OQE 2.0 discipline.",
        "For each criterion, you see what each runtime produced as evidence. Render a one-paragraph verdict.",
        "Be specific about where one runtime held discipline better and where they drifted.",
        "",
    ]
    for i, r in enumerate(rows, 1):
        prompt_lines.append(f"Criterion {i}: {r['criterion']}")
        prompt_lines.append(f"  Claude: tag={r['claude']['evidence_tag']} snippet={r['claude']['snippet'][:240]}")
        prompt_lines.append(f"  OpenCode: tag={r['opencode']['evidence_tag']} snippet={r['opencode']['snippet'][:240]}")
        prompt_lines.append("")
    prompt = "\n".join(prompt_lines)
    if judge_runtime == "claude":
        cmd = ["claude", "-p", prompt, "--dangerously-skip-permissions"]
    else:
        cmd = ["opencode", "run", "--dangerously-skip-permissions", prompt]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return (out.stdout or "").strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        return f"<judge invocation failed: {e}>"


def write_scoreboard(entry):
    SCOREBOARD_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SCOREBOARD_PATH.exists():
        with SCOREBOARD_PATH.open(encoding="utf-8") as f:
            board = json.load(f)
    else:
        board = {"comparisons": []}
    board["comparisons"].append(entry)
    with SCOREBOARD_PATH.open("w", encoding="utf-8") as f:
        json.dump(board, f, indent=2)


def cmd_compare(args):
    board, board_path = load_job_board(args.project)
    cj = find_job(board, args.claude_job)
    oj = find_job(board, args.opencode_job)
    if cj.get("runtime") and cj.get("runtime") != "claude":
        print(f"WARN: job {args.claude_job} runtime is {cj.get('runtime')}, expected claude", file=sys.stderr)
    if oj.get("runtime") and oj.get("runtime") != "opencode":
        print(f"WARN: job {args.opencode_job} runtime is {oj.get('runtime')}, expected opencode", file=sys.stderr)
    scored = score_pair(cj, oj)
    rows = scored.get("criteria_scores", [])
    verdict, points = verdict_from_rows(rows)
    judge_text = invoke_judge(rows, args.judge, FRAMEWORK_ROOT) if args.judge else ""
    entry = {
        "pair_id": cj.get("vs_pair_id") or oj.get("vs_pair_id") or f"{args.claude_job}+{args.opencode_job}",
        "subject": cj.get("subject") or oj.get("subject") or "",
        "claude_job_id": args.claude_job,
        "opencode_job_id": args.opencode_job,
        "criteria_scores": rows,
        "points": points,
        "verdict": verdict,
        "judge_runtime": args.judge or None,
        "judge_text": judge_text,
        "warning": scored.get("warning"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    write_scoreboard(entry)
    print(json.dumps({k: v for k, v in entry.items() if k != "criteria_scores"}, indent=2))
    print(f"\nScoreboard updated: {SCOREBOARD_PATH}")
    print(f"Verdict: {verdict} (claude={points['claude']}, opencode={points['opencode']})")


def cmd_auto(args):
    board, _ = load_job_board(args.project)
    jobs = board.get("jobs", [])
    by_pair = {}
    for j in jobs:
        pid = j.get("vs_pair_id")
        if not pid or j.get("status") not in ("closed", "passed", "submitted"):
            continue
        by_pair.setdefault(pid, []).append(j)
    paired = [(pid, group) for pid, group in by_pair.items() if len(group) == 2]
    if not paired:
        print("no complete pairs found")
        return
    # Skip pairs already in scoreboard
    seen = set()
    if SCOREBOARD_PATH.exists():
        with SCOREBOARD_PATH.open(encoding="utf-8") as f:
            seen = {c["pair_id"] for c in json.load(f).get("comparisons", [])}
    for pid, group in paired:
        if pid in seen:
            continue
        cj = next((j for j in group if j.get("runtime") == "claude"), None)
        oj = next((j for j in group if j.get("runtime") == "opencode"), None)
        if not cj or not oj:
            print(f"  skip {pid}: missing runtime tag on a member")
            continue
        sub = argparse.Namespace(
            claude_job=cj["id"], opencode_job=oj["id"],
            project=args.project, judge=args.judge,
        )
        cmd_compare(sub)


def cmd_board(args):
    if not SCOREBOARD_PATH.exists():
        print("no scoreboard yet")
        return
    with SCOREBOARD_PATH.open(encoding="utf-8") as f:
        board = json.load(f)
    comps = board.get("comparisons", [])
    if not comps:
        print("scoreboard empty")
        return
    tallies = {"claude": 0, "opencode": 0, "tie": 0, "inconclusive": 0}
    for c in comps:
        tallies[c.get("verdict", "inconclusive")] = tallies.get(c.get("verdict", "inconclusive"), 0) + 1
    print(f"VS scoreboard: {len(comps)} comparison(s)")
    for k in ("claude", "opencode", "tie", "inconclusive"):
        print(f"  {k}: {tallies[k]}")
    print()
    for c in comps[-10:]:
        print(f"  {c.get('timestamp', '?'):30s} {c.get('verdict', '?'):14s} {c.get('subject', '')[:60]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", help="job board project key (default = state/job-board.json)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    comp = sub.add_parser("compare", help="compare two specific job IDs")
    comp.add_argument("claude_job")
    comp.add_argument("opencode_job")
    comp.add_argument("--judge", choices=["claude", "opencode"], help="optional LLM judge for written verdict")
    comp.set_defaults(func=cmd_compare)

    auto = sub.add_parser("auto", help="auto-find unpaired vs_pair_id jobs and compare")
    auto.add_argument("--judge", choices=["claude", "opencode"])
    auto.set_defaults(func=cmd_auto)

    bd = sub.add_parser("board", help="print scoreboard summary")
    bd.set_defaults(func=cmd_board)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
