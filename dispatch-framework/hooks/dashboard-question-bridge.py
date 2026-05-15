#!/usr/bin/env python3
"""
PreToolUse hook for AskUserQuestion → MultiDeck dashboard glyph modal.

Flow:
  1. Claude calls AskUserQuestion. Claude Code fires PreToolUse hook with this
     script. Hook input arrives on stdin as JSON:
       { "session_id": "...", "tool_name": "AskUserQuestion",
         "tool_input": { "questions": [...] }, ... }

  2. Hook writes $DISPATCH_STATE_DIR/pending-questions/<session_id>.json with
     the question payload. The dashboard SSE endpoint (/events/questions) sees
     the new file and emits an event to any subscribed browser tab.

  3. The browser renders a glyph-button modal. When the operator picks options,
     the browser POSTs to /questions/<session_id>/answer which writes
     <session_id>.answer.json into the same directory.

  4. This hook polls for the .answer.json file (200ms interval, 60s timeout)
     and on arrival prints to stdout the official PreToolUse permissionDecision
     payload with the answers, so Claude treats the question as answered
     without ever rendering its native UI.

Failure modes (all degrade gracefully — exit 0 with empty output → Claude
falls back to its native AskUserQuestion UI):
  - tool_name is not AskUserQuestion (passthrough)
  - DISPATCH_STATE_DIR not set or directory not writable (passthrough)
  - Timeout waiting for operator (returns permissionDecision=deny with
    message so Claude can adapt)
  - Any other unexpected exception (passthrough, log to stderr)

Reference: dispatch-framework/coordination/research-question-detection.md
"""

import json
import os
import sys
import time
from pathlib import Path

POLL_INTERVAL_S = 0.2
TIMEOUT_S = 60.0


def passthrough(reason: str = "") -> None:
    """Exit 0 with empty output. Claude shows its native UI."""
    if reason:
        sys.stderr.write(f"[dashboard-question-bridge] passthrough: {reason}\n")
    sys.exit(0)


def emit_decision(payload: dict) -> None:
    """Print the PreToolUse hook output and exit 0."""
    sys.stdout.write(json.dumps(payload))
    sys.stdout.write("\n")
    sys.exit(0)


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        passthrough("empty stdin")

    try:
        data = json.loads(raw)
    except Exception as e:
        passthrough(f"stdin not JSON: {e}")
        return

    tool_name = data.get("tool_name") or data.get("toolName") or ""
    if tool_name != "AskUserQuestion":
        passthrough(f"tool_name={tool_name!r}")

    session_id = (data.get("session_id") or data.get("sessionId") or "").strip()
    if not session_id:
        passthrough("missing session_id")

    safe = "".join(c for c in session_id if c.isalnum() or c in "-_")
    if safe != session_id or not (1 <= len(safe) <= 128):
        passthrough(f"unsafe session_id: {session_id!r}")

    tool_input = data.get("tool_input") or data.get("toolInput") or {}
    questions = tool_input.get("questions") if isinstance(tool_input, dict) else None
    if not isinstance(questions, list) or not questions:
        passthrough("no questions array")

    state_dir = os.environ.get("DISPATCH_STATE_DIR", "").strip()
    if not state_dir:
        dispatch_root = os.environ.get("DISPATCH_ROOT", "").strip()
        if not dispatch_root:
            passthrough("DISPATCH_STATE_DIR and DISPATCH_ROOT both unset")
        state_dir = str(Path(dispatch_root) / "state")

    q_dir = Path(state_dir) / "pending-questions"
    try:
        q_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        passthrough(f"mkdir failed: {e}")

    pending_path = q_dir / f"{session_id}.json"
    answer_path = q_dir / f"{session_id}.answer.json"

    try:
        pending_path.write_text(json.dumps({
            "questions": questions,
            "created_at": time.time(),
            "session_id": session_id,
        }, indent=2), encoding="utf-8")
    except Exception as e:
        passthrough(f"write pending failed: {e}")

    deadline = time.monotonic() + TIMEOUT_S
    answers = None
    while time.monotonic() < deadline:
        if answer_path.exists():
            try:
                ans_body = json.loads(answer_path.read_text(encoding="utf-8"))
                answers = ans_body.get("answers")
                if isinstance(answers, dict):
                    break
            except Exception:
                pass
        time.sleep(POLL_INTERVAL_S)

    try:
        if pending_path.exists():
            pending_path.unlink()
    except Exception:
        pass
    try:
        if answer_path.exists():
            answer_path.unlink()
    except Exception:
        pass

    if answers is None:
        emit_decision({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    "Operator did not respond within "
                    f"{int(TIMEOUT_S)} seconds. Proceed with best judgment "
                    "based on prior context, or call AskUserQuestion again "
                    "if the answer is load-bearing."
                ),
            }
        })

    emit_decision({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": {
                "questions": questions,
                "answers": answers,
            },
        }
    })


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        sys.stderr.write(f"[dashboard-question-bridge] unexpected: {e}\n")
        sys.exit(0)
