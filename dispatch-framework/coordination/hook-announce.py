#!/usr/bin/env python3
"""
Dispatch announce hook — POST a message to the coordination channel.

Usage:
  python3 hook-announce.py <from> <text> [--to <agent|all>]

Examples:
  python3 hook-announce.py dispatch "Stand by — routing query incoming"
  python3 hook-announce.py dispatch "Engineer: pause T2V run" --to engineer
  python3 hook-announce.py engineer "T2V smoke test complete — Producer unblocked" --to all
"""
import json, sys, urllib.request, os

# Force UTF-8 on stdio so the Unicode arrow in the success line doesn't crash
# under Windows' default cp1252 codec when callers don't set PYTHONIOENCODING.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

PORT = int(os.environ.get('DISPATCH_COORD_PORT', 3047))
URL  = f'http://localhost:{PORT}/announce'

def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print('Usage: hook-announce.py <from> <text> [--to <agent|all>]', file=sys.stderr)
        sys.exit(1)

    sender = args[0]
    text   = args[1]
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
