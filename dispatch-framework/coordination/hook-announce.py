#!/usr/bin/env python3
"""
Dispatch announce hook — POST a message to the coordination channel.

Usage:
  python3 hook-announce.py <from> <text> [--to <agent|all>]

Environment:
  DISPATCH_COORD_URL  Override server URL (default: http://localhost:3047)
                      Set this when the server is not reachable via localhost.
  DISPATCH_COORD_PORT Override port only (ignored when DISPATCH_COORD_URL is set)

Transport-specific setup:
  Windows Terminal (native):
    No setup needed — coord server is at localhost:3047.

  WSL + tmux:
    Coord server runs on Windows host; WSL loopback does not cross the bridge.
    Derive the Windows-host IP from the default route before calling:

      WIN_IP=$(ip route | grep default | awk '{print $3}')
      export DISPATCH_COORD_URL=http://${WIN_IP}:3047

    This hook auto-detects WSL by reading /proc/version and derives the gateway
    if DISPATCH_COORD_URL is unset. Exporting explicitly is recommended so that
    hook-complete.py and hook-resource.py also reach the server.

  Steam Deck + Tailscale:
    export DISPATCH_COORD_URL=http://<windows-host-tailscale-ip>:3047

Examples:
  python3 hook-announce.py dispatch "Stand by — routing query incoming"
  python3 hook-announce.py dispatch "Engineer: pause T2V run" --to engineer
  python3 hook-announce.py engineer "T2V smoke test complete — Producer unblocked" --to all

Note: avoid backslashes in message text — use forward slashes for path references.
  Wrong:  "artifact at dispatch-framework\\state\\output.md"
  Correct: "artifact at dispatch-framework/state/output.md"
  (This hook sanitizes backslashes automatically, but other callers must do it manually.)
"""
import json, sys, urllib.request, os, subprocess

# Force UTF-8 on stdio so the Unicode arrow in the success line doesn't crash
# under Windows' default cp1252 codec when callers don't set PYTHONIOENCODING.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

PORT = int(os.environ.get('DISPATCH_COORD_PORT', 3047))


def _resolve_coord_host() -> str:
    # WSL2: coord server runs on Windows; localhost doesn't cross the bridge.
    # Derive the Windows-host IP from the default route instead.
    try:
        with open('/proc/version') as _f:
            if 'microsoft' in _f.read().lower():
                out = subprocess.check_output(
                    ['ip', 'route'], text=True, timeout=2
                )
                for line in out.splitlines():
                    if line.startswith('default'):
                        return line.split()[2]  # e.g. 172.25.208.1
    except Exception:
        pass
    return 'localhost'


_default_url = f'http://{_resolve_coord_host()}:{PORT}'
COORD_URL = os.environ.get('DISPATCH_COORD_URL', _default_url)
URL  = f'{COORD_URL}/announce'

def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print('Usage: hook-announce.py <from> <text> [--to <agent|all>]', file=sys.stderr)
        sys.exit(1)

    sender = args[0]
    text   = args[1].replace('\\', '/')  # server Content-Length parser rejects raw backslashes
    to     = 'all'

    i = 2
    while i < len(args):
        if args[i] == '--to' and i + 1 < len(args):
            to = args[i + 1]
            i += 2
        else:
            i += 1

    payload = json.dumps({'from': sender, 'text': text, 'to': to}).encode()
    req = urllib.request.Request(URL, data=payload,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            result = json.loads(r.read())
            print(f'[announce] {sender} → {to}: {text}')
            sys.exit(0)
    except Exception as e:
        print(f'[announce] failed: {e}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
