#!/usr/bin/env python3
"""
Dispatch Coordination Hook — mark a todo complete.

Usage:
  python hook-complete.py <agent> <todo_id> [message]

Examples:
  python hook-complete.py engineer smoke_test "exits 0, 2.1 MB MP4"
  python hook-complete.py producer vo_render
  python hook-complete.py engineer smoke_mp4 "smoke-alley.mp4 dropped"

Agent IDs:  engineer | producer
Todo IDs per agent:
  engineer: verifier_fix, oom_fix, segfault_fix, device_map,
            smoke_test, full_res, smoke_mp4
  producer: vo_render, sfx_render, music_bed, shot_list,
            await_t2v, ai_beats, rough_cut

Environment:
  DISPATCH_COORD_URL  Override server URL (default: http://localhost:3047)
"""
import sys
import json
import urllib.request
import os

COORD_URL = os.environ.get('DISPATCH_COORD_URL', 'http://localhost:3047')


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    agent   = sys.argv[1]
    todo_id = sys.argv[2]
    message = sys.argv[3] if len(sys.argv) > 3 else ''

    payload = json.dumps({'agent': agent, 'id': todo_id, 'message': message}).encode()
    req = urllib.request.Request(
        f'{COORD_URL}/todo/complete',
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
        print(f'✓ {agent}:{todo_id} — {result.get("todo", "done")}')
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'✗ {e.code} {body}', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f'✗ coordination server unreachable: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
