#!/usr/bin/env python3
"""
Dispatch Resource Hook — announce and release shared resource claims.

Before using a shared resource, claim it. If another agent holds it, you'll
be told who and why so you can coordinate rather than collide.

Usage:
  python hook-resource.py claim   <agent> <resource> [task]
  python hook-resource.py release <agent> <resource>

Examples:
  python hook-resource.py claim   engineer gpu "T2V smoke test 33-frame 832x480"
  python hook-resource.py release engineer gpu

  python hook-resource.py claim   producer ffmpeg "audio mixdown render"
  python hook-resource.py release producer ffmpeg

Common resources:
  gpu               — VRAM-intensive local inference (Wan, SD, any model load)
  local_inference   — CPU/RAM-heavy inference (LLaMA, Whisper, etc.)
  ffmpeg            — High-CPU video or audio encoding
  disk_io           — Large sequential writes (model downloads, video export)
  network_bandwidth — Large downloads or uploads

Exit codes:
  0 — success
  2 — conflict (resource held by another agent — check stderr for details)
  1 — server unreachable or error

Environment:
  DISPATCH_COORD_URL  Override server URL (default: http://localhost:3047)
"""
import json
import os
import sys
import urllib.error
import urllib.request

COORD_URL = os.environ.get('DISPATCH_COORD_URL', 'http://localhost:3047')


def _post(path: str, payload: dict) -> tuple[dict | None, str | None]:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'{COORD_URL}/{path}',
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read()), None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            obj = json.loads(body)
        except Exception:
            obj = {'raw': body}
        return obj, f'HTTP {e.code}'
    except Exception as e:
        return None, str(e)


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    verb     = sys.argv[1].lower()
    agent    = sys.argv[2]
    resource = sys.argv[3]
    task     = sys.argv[4] if len(sys.argv) > 4 else ''

    if verb == 'claim':
        result, err = _post('resource/claim', {'agent': agent, 'resource': resource, 'task': task})
        if err == 'HTTP 409' and result and result.get('conflict'):
            holder = result['holder']
            since  = holder.get('since', '')[:19].replace('T', ' ')
            print(f'⚠  {resource.upper()} is held by {holder["agent"]}', file=sys.stderr)
            print(f'   Task: {holder.get("task", "(none)")}', file=sys.stderr)
            print(f'   Since: {since}', file=sys.stderr)
            print(f'   Wait for release or coordinate with {holder["agent"]} before proceeding.', file=sys.stderr)
            sys.exit(2)
        if err:
            print(f'✗ {err}', file=sys.stderr)
            sys.exit(1)
        label = f' — {task}' if task else ''
        print(f'✓ {agent} claimed {resource}{label}')

    elif verb == 'release':
        result, err = _post('resource/release', {'agent': agent, 'resource': resource})
        if err:
            print(f'✗ {err}', file=sys.stderr)
            sys.exit(1)
        print(f'✓ {agent} released {resource}')

    else:
        print(f'Unknown verb: {verb!r}. Use claim or release.', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
