#!/usr/bin/env python3
"""
Dispatch Coordination Hook — post a pipeline error lesson.

Called by the pending-reviews watcher (and any other persistent pipeline)
when it catches an error condition. Lessons are stored separately from
announce traffic so agents can pull them as standing context via GET /lessons.

Usage:
  python3 hook-lesson.py <from> <error> --mitigation "text" [--mitigation "text" ...]

Examples:
  python3 hook-lesson.py watcher \
      "MULTI-INFRA-0071 sat in submitted for 47 min with no Reviewer spawned" \
      --mitigation "Announce to Dispatch at submit time — do not rely on watcher alone" \
      --mitigation "Check state/pending-reviews/ at session start for stale markers" \
      --mitigation "Watcher process must be running before job-board submit is called"

  python3 hook-lesson.py watcher \
      "hook-announce.py timed out — coordination server was not running" \
      --mitigation "Start coordination server before launching personas" \
      --mitigation "Treat announce failure as a warning, not a blocker"

Exit codes: 0 on success, 1 on failure (non-fatal when called from watcher).
"""
import json
import sys
import urllib.request
import os

PORT = int(os.environ.get('DISPATCH_COORD_PORT', 3047))
URL  = f'http://localhost:{PORT}/lesson'


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(
            'Usage: hook-lesson.py <from> <error> --mitigation "text" [...]',
            file=sys.stderr,
        )
        sys.exit(1)

    sender     = args[0]
    error_text = args[1]
    mitigations = []

    i = 2
    while i < len(args):
        if args[i] == '--mitigation' and i + 1 < len(args):
            mitigations.append(args[i + 1])
            i += 2
        else:
            i += 1

    payload = json.dumps({
        'from':        sender,
        'error':       error_text,
        'mitigations': mitigations,
    }).encode()

    req = urllib.request.Request(
        URL, data=payload, headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            json.loads(r.read())
            print(f'[lesson] {sender}: {error_text[:80]}')
            if mitigations:
                for m in mitigations:
                    print(f'         mitigation: {m}')
            sys.exit(0)
    except Exception as e:
        print(f'[lesson] failed: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
