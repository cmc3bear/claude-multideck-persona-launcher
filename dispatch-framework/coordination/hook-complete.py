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
  DISPATCH_COORD_URL          Override server URL (default: auto-derived)
  DISPATCH_COORD_PORT         Override port only (default: 3047)
  DISPATCH_COORD_SERVER_LOCAL Set to 1 when server.py runs in WSL — skips
                              Windows gateway derivation and uses localhost.
"""
import sys
import json
import urllib.request
import os
import subprocess


def _resolve_coord_host() -> str:
    # §11 dependency_tracking: DISPATCH_COORD_SERVER_LOCAL skips gateway
    # derivation for WSL sessions where server.py runs inside WSL, not Windows.
    if os.environ.get('DISPATCH_COORD_SERVER_LOCAL'):
        return 'localhost'
    # WSL2: coord server runs on Windows; localhost doesn't cross the bridge.
    try:
        with open('/proc/version') as _f:
            if 'microsoft' in _f.read().lower():
                out = subprocess.check_output(['ip', 'route'], text=True, timeout=2)
                for line in out.splitlines():
                    if line.startswith('default'):
                        return line.split()[2]
    except Exception:
        pass
    return 'localhost'


_PORT = int(os.environ.get('DISPATCH_COORD_PORT', 3047))
_default_url = f'http://{_resolve_coord_host()}:{_PORT}'
COORD_URL = os.environ.get('DISPATCH_COORD_URL', _default_url)


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
