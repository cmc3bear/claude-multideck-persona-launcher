#!/usr/bin/env python3
"""
interview-agent.py — hourly cron job that asks each open correction's
originating persona "what have you actually changed since this was logged?"

Invoked by Windows Task Scheduler every hour (see correction-cron-install.ps1).

For each entry in F:/corrections/corrections.jsonl with status="open" and
review_flag="human_validated", builds an interview prompt and spawns a
non-interactive Claude Code subprocess (or a local Ollama model if
INTERVIEWER_BACKEND=local). Parses the response, appends to fix_attempts[],
and flips status to "resolved" if the response cites concrete evidence
that the fix has landed.

Skips entries where review_flag is still "pending_human_review" — Internal
Affairs must validate first, otherwise we burn interviews on false
positives.

Usage:
  python interview-agent.py                   # interview all open+validated
  python interview-agent.py --id CORR-...     # interview a specific entry
  python interview-agent.py --dry-run         # show what would be asked
  python interview-agent.py --backend local   # force local Ollama (default: claude-code)

Environment:
  CORRECTIONS_REGISTRY   path to corrections.jsonl (default F:/corrections/corrections.jsonl)
  INTERVIEWER_BACKEND    "claude-code" (default) or "local"
  INTERVIEWER_LOCAL_MODEL  Ollama tag for local backend (default: qwen3:32b)
  INTERVIEWER_MIN_AGE_MIN  Skip entries younger than N minutes (default: 30)
  INTERVIEWER_MAX_PER_RUN  Cap interviews per run (default: 10)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path

REGISTRY_PATH = Path(os.environ.get("CORRECTIONS_REGISTRY", r"F:\corrections\corrections.jsonl"))
BACKEND = os.environ.get("INTERVIEWER_BACKEND", "claude-code").lower()
LOCAL_MODEL = os.environ.get("INTERVIEWER_LOCAL_MODEL", "qwen3:32b")
MIN_AGE_MIN = int(os.environ.get("INTERVIEWER_MIN_AGE_MIN", "30"))
MAX_PER_RUN = int(os.environ.get("INTERVIEWER_MAX_PER_RUN", "10"))

INTERVIEW_PROMPT_TEMPLATE = """You are being asked to report on a correction that was logged against your prior session.

CORRECTION ID: {id}
LOGGED AT:     {ts}
ORIGINAL ACK:  {ack_phrase}
EXCERPT:
{excerpt}

CONTEXT:
- The session in which this was logged was working in: {cwd}
- The originating persona was: {persona}
- This is interview attempt #{attempt_num}.

YOUR TASK:
Report what has changed since this correction was logged. Be specific. Cite file paths, line numbers, commit hashes, or test results that demonstrate the fix actually landed. If nothing has changed yet, say so plainly.

REQUIRED OUTPUT FORMAT:
```
STATUS: <resolved|in-progress|no-action>
EVIDENCE:
- <file:line or commit hash or test result, one per line>
- ...
NOTES: <one paragraph; what changed, what is still open, what is blocked>
```

Rules:
- STATUS=resolved requires at least one STRONG evidence item (verifiable file path, commit hash, or test output). Do not claim resolved without it.
- If you cannot verify anything has changed, return STATUS=no-action with NOTES explaining why (e.g. "the correction described a one-off response with no code artifact to fix").
- Do not make up file paths or commit hashes. If you would have to invent evidence, return STATUS=in-progress instead.
"""


def _read_registry() -> list[dict]:
    if not REGISTRY_PATH.is_file():
        return []
    entries = []
    with REGISTRY_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def _write_registry(entries: list[dict]) -> None:
    """Atomic-ish rewrite of the entire registry. Reads-then-writes — callers
    must avoid concurrent invocations (the cron schedule ensures one at a time
    via Task Scheduler's MultipleInstances=IgnoreNew). Manual invocations
    that race with the cron will silently lose the first writer's appended
    fix_attempts[] entries."""
    # NOTE: Path.with_suffix() REPLACES the existing suffix, so on
    # `corrections.jsonl` it produces `corrections.tmp` (losing .jsonl).
    # Build the sibling name explicitly instead.
    tmp = REGISTRY_PATH.parent / (REGISTRY_PATH.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    tmp.replace(REGISTRY_PATH)


def _should_interview(entry: dict, now: datetime, min_age_min: int) -> tuple[bool, str]:
    if entry.get("status") != "open":
        return False, "not-open"
    if entry.get("review_flag") != "human_validated":
        return False, "awaiting-human-validation"
    ts_str = entry.get("ts")
    if not ts_str:
        return False, "no-ts"
    try:
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except ValueError:
        return False, "bad-ts"
    if (now - ts) < timedelta(minutes=min_age_min):
        return False, "too-recent"
    return True, ""


def _build_prompt(entry: dict) -> str:
    return INTERVIEW_PROMPT_TEMPLATE.format(
        id=entry.get("id", "?"),
        ts=entry.get("ts", "?"),
        ack_phrase=entry.get("ack_phrase", "?"),
        excerpt=entry.get("excerpt", "?"),
        cwd=entry.get("cwd", "?"),
        persona=entry.get("persona", "?"),
        attempt_num=len(entry.get("fix_attempts", [])) + 1,
    )


def _run_claude_code(prompt: str, cwd: str | None) -> tuple[str, str | None]:
    """Spawn `claude -p` non-interactive. Returns (stdout, err)."""
    try:
        # claude -p reads the prompt from argv and writes the reply to stdout.
        # We capture stdout. We DO NOT trust this to perform tool calls in cron
        # since interactive auth may not be present; we treat it as a text query.
        cmd = ["claude", "-p", prompt]
        # cwd lets the model use its tools (Read/Grep) on the originating project.
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
            cwd=cwd if cwd and Path(cwd).is_dir() else None,
        )
        if proc.returncode != 0:
            return proc.stdout or "", f"claude exit={proc.returncode} stderr={proc.stderr[:400]}"
        return proc.stdout or "", None
    except FileNotFoundError:
        return "", "claude binary not found on PATH"
    except subprocess.TimeoutExpired:
        return "", "claude interview timed out at 180s"
    except Exception as e:
        return "", f"{type(e).__name__}: {e}"


def _run_local(prompt: str) -> tuple[str, str | None]:
    """Spawn ollama run <model> < prompt. Returns (stdout, err)."""
    try:
        proc = subprocess.run(
            ["ollama", "run", LOCAL_MODEL, prompt],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if proc.returncode != 0:
            return proc.stdout or "", f"ollama exit={proc.returncode} stderr={proc.stderr[:400]}"
        return proc.stdout or "", None
    except FileNotFoundError:
        return "", "ollama binary not found on PATH"
    except subprocess.TimeoutExpired:
        return "", "ollama interview timed out at 300s"
    except Exception as e:
        return "", f"{type(e).__name__}: {e}"


_STATUS_RE = re.compile(r"STATUS:\s*(resolved|in-progress|no-action)", re.IGNORECASE)
_EVIDENCE_RE = re.compile(r"EVIDENCE:\s*\n((?:-\s*.+\n?)+)", re.IGNORECASE)
_NOTES_RE = re.compile(r"NOTES:\s*(.+?)(?:\n\n|\Z)", re.IGNORECASE | re.DOTALL)


def _parse_response(text: str) -> dict:
    status_match = _STATUS_RE.search(text)
    status = status_match.group(1).lower() if status_match else "unparseable"
    evidence_match = _EVIDENCE_RE.search(text)
    evidence_lines: list[str] = []
    if evidence_match:
        for line in evidence_match.group(1).splitlines():
            line = line.strip().lstrip("-").strip()
            if line:
                evidence_lines.append(line)
    notes_match = _NOTES_RE.search(text)
    notes = notes_match.group(1).strip() if notes_match else ""
    return {
        "status": status,
        "evidence": evidence_lines,
        "notes": notes,
        "raw_response_excerpt": text[:1500],
    }


def _interview_one(entry: dict, backend: str, dry_run: bool) -> dict:
    prompt = _build_prompt(entry)
    now_iso = datetime.now(timezone.utc).isoformat()
    if dry_run:
        return {
            "ts": now_iso,
            "backend": backend,
            "status": "dry-run",
            "evidence": [],
            "notes": "Dry run — prompt printed below.",
            "raw_response_excerpt": prompt[:1500],
        }
    if backend == "local":
        out, err = _run_local(prompt)
    else:
        out, err = _run_claude_code(prompt, entry.get("cwd"))
    if err:
        return {
            "ts": now_iso,
            "backend": backend,
            "status": "interview-failed",
            "evidence": [],
            "notes": err,
            "raw_response_excerpt": (out or "")[:1500],
        }
    parsed = _parse_response(out)
    parsed["ts"] = now_iso
    parsed["backend"] = backend
    return parsed


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--id", help="Interview a specific correction id and exit.")
    p.add_argument("--dry-run", action="store_true", help="Print prompts; do not call any LLM.")
    p.add_argument("--backend", choices=("claude-code", "local"), help="Override INTERVIEWER_BACKEND.")
    args = p.parse_args()

    backend = (args.backend or BACKEND).lower()
    entries = _read_registry()
    if not entries:
        print("[interview] registry empty, nothing to do")
        return 0

    now = datetime.now(timezone.utc)
    targets: list[int] = []
    for i, e in enumerate(entries):
        if args.id:
            if e.get("id") == args.id:
                targets.append(i)
            continue
        ok, reason = _should_interview(e, now, MIN_AGE_MIN)
        if ok:
            targets.append(i)
    targets = targets[:MAX_PER_RUN]

    if not targets:
        print(f"[interview] no eligible entries (backend={backend} min_age={MIN_AGE_MIN}m)")
        return 0

    print(f"[interview] backend={backend} eligible={len(targets)} max_per_run={MAX_PER_RUN}")
    for i in targets:
        entry = entries[i]
        print(f"  -> {entry.get('id')} persona={entry.get('persona')} attempts={len(entry.get('fix_attempts', []))}")
        attempt = _interview_one(entry, backend, args.dry_run)
        entry.setdefault("fix_attempts", []).append(attempt)
        # Only flip status if the interview returned `resolved` AND at least
        # one evidence line. Anything else stays open for the next hour or
        # for Internal Affairs to look at.
        if attempt["status"] == "resolved" and attempt.get("evidence"):
            entry["status"] = "resolved"
            entry["resolved_at"] = attempt["ts"]
            entry["resolution"] = attempt.get("notes", "")
            print(f"     RESOLVED — {len(attempt['evidence'])} evidence items")
        else:
            print(f"     {attempt['status']} — {len(attempt.get('evidence', []))} evidence items")

    if not args.dry_run:
        _write_registry(entries)
    return 0


if __name__ == "__main__":
    sys.exit(main())
