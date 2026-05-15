#!/usr/bin/env python3
"""
Dispatch Coordination Server — pure stdlib, no external deps.
Runs natively in WSL so all hook scripts can reach localhost:3047.

Start:  python3 server.py
Or:     DISPATCH_COORD_PORT=3047 python3 server.py
"""
import copy
import http.server
import json
import os
import queue
import threading
from datetime import datetime, timezone
from pathlib import Path

PORT       = int(os.environ.get('DISPATCH_COORD_PORT', 3047))
DIR        = Path(__file__).parent
STATE_FILE = DIR / 'coord-state.json'
HTML_FILE  = DIR / 'dashboard.html'

# ── Seed state ─────────────────────────────────────────────────────────────
INITIAL = {
    'updated': datetime.now(timezone.utc).isoformat(),
    'agents': {
        'engineer': {
            'callsign': 'Engineer',
            'job':      'WS-FIX-0003',
            'color':    '#00ff88',
            'todos': [
                {'id': 'verifier_fix', 'label': 'Fix verify-wan-models.py shard false-positive',     'done': False},
                {'id': 'oom_fix',      'label': 'Fix T2V OOM — disable_mmap=True, shard 7',          'done': False},
                {'id': 'segfault_fix', 'label': 'Fix T2V segfault — disable_mmap=False, shard 8',    'done': False},
                {'id': 'device_map',   'label': 'Add --device-map flag with tradeoff docs',           'done': False},
                {'id': 'smoke_test',   'label': 'Smoke test: 33-frame 832x480 exits 0',               'done': False},
                {'id': 'full_res',     'label': 'Full-res run: 81-frame 1280x720 exits 0',            'done': False},
                {'id': 'smoke_mp4',    'label': 'Drop smoke-alley.mp4 to output/raw',                 'done': False},
            ]
        },
        'producer': {
            'callsign': 'Producer',
            'job':      'cyberdeck-spot-2026-05-14',
            'color':    '#ff6b35',
            'todos': [
                {'id': 'vo_render',  'label': 'VO render complete',                                   'done': False},
                {'id': 'sfx_render', 'label': 'SFX render complete',                                  'done': False},
                {'id': 'music_bed',  'label': 'Music bed locked',                                     'done': False},
                {'id': 'shot_list',  'label': 'Shot list finalized',                                   'done': False},
                {'id': 'await_t2v',  'label': 'Await T2V clearance from Engineer',                    'done': False, 'blockedOn': 'engineer:smoke_mp4'},
                {'id': 'ai_beats',   'label': 'Generate 4 AI beats via T2V',                          'done': False, 'blockedOn': 'engineer:smoke_mp4'},
                {'id': 'rough_cut',  'label': 'Assemble rough cut',                                   'done': False},
            ]
        }
    },
    'log': [],
    'resources': {},  # resource_name -> {agent, task, since}
    'messages': [],   # dispatch announce channel -> {ts, from, to, text}
    'lessons': []     # pipeline error lessons -> {ts, from, error, mitigations: [str]}
}

# ── State ──────────────────────────────────────────────────────────────────
_lock = threading.Lock()

def _load():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return copy.deepcopy(INITIAL)

state = _load()

def _save():
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

# ── SSE broadcast ──────────────────────────────────────────────────────────
_queues: list[queue.Queue] = []
_q_lock = threading.Lock()

def _broadcast():
    payload = json.dumps(state)
    dead = []
    with _q_lock:
        for q in _queues:
            try:
                q.put_nowait(payload)
            except queue.Full:
                dead.append(q)
        for q in dead:
            _queues.remove(q)

# ── Block resolution ───────────────────────────────────────────────────────
def _resolve_blocks():
    for agent in state['agents'].values():
        for todo in agent['todos']:
            blocked_on = todo.get('blockedOn')
            if not blocked_on or ':' not in blocked_on:
                continue
            b_agent, b_id = blocked_on.split(':', 1)
            blocker = next(
                (t for t in state['agents'].get(b_agent, {}).get('todos', []) if t['id'] == b_id),
                None
            )
            if blocker and blocker['done']:
                todo['blockedOn'] = None

# ── HTTP handler ───────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # silence access log

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')

    def _json(self, code: int, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        n = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(n) if n else b'{}'
        return json.loads(raw)

    # OPTIONS preflight
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        p = self.path.split('?')[0]

        if p == '/':
            body = HTML_FILE.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif p == '/state.json':
            with _lock:
                body = json.dumps(state, indent=2).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif p == '/resources':
            with _lock:
                body = json.dumps(state.get('resources', {}), indent=2).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif p == '/messages':
            with _lock:
                body = json.dumps(state.get('messages', []), indent=2).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif p == '/lessons':
            with _lock:
                body = json.dumps(state.get('lessons', []), indent=2).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif p == '/events':
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()

            q: queue.Queue = queue.Queue(maxsize=30)
            with _q_lock:
                _queues.append(q)

            # send current state immediately
            with _lock:
                seed = json.dumps(state)
            try:
                self.wfile.write(f'data: {seed}\n\n'.encode())
                self.wfile.flush()
            except Exception:
                with _q_lock:
                    if q in _queues:
                        _queues.remove(q)
                return

            # stream events until client disconnects
            while True:
                try:
                    data = q.get(timeout=20)
                    self.wfile.write(f'data: {data}\n\n'.encode())
                    self.wfile.flush()
                except queue.Empty:
                    try:  # keepalive
                        self.wfile.write(b': ping\n\n')
                        self.wfile.flush()
                    except Exception:
                        break
                except Exception:
                    break

            with _q_lock:
                if q in _queues:
                    _queues.remove(q)

        else:
            self._json(404, {'error': 'not found'})

    def do_POST(self):
        p = self.path.split('?')[0]
        try:
            d = self._read_body()
        except Exception:
            self._json(400, {'error': 'bad json'})
            return

        if p == '/todo/complete':
            with _lock:
                ag = state['agents'].get(d.get('agent', ''))
                if not ag:
                    self._json(404, {'error': 'unknown agent'})
                    return
                todo = next((t for t in ag['todos'] if t['id'] == d.get('id')), None)
                if not todo:
                    self._json(404, {'error': 'unknown todo'})
                    return
                todo['done'] = True
                now = datetime.now(timezone.utc).isoformat()
                state['updated'] = now
                state['log'].insert(0, {
                    'ts':      now,
                    'agent':   ag['callsign'],
                    'todo':    todo['label'],
                    'message': d.get('message', ''),
                })
                state['log'] = state['log'][:50]
                _resolve_blocks()
                _save()
            _broadcast()
            self._json(200, {'ok': True, 'todo': todo['label']})

        elif p == '/todo/add':
            with _lock:
                ag = state['agents'].get(d.get('agent', ''))
                if not ag:
                    self._json(404, {'error': 'unknown agent'})
                    return
                entry = {'id': d['id'], 'label': d['label'], 'done': False}
                if d.get('blockedOn'):
                    entry['blockedOn'] = d['blockedOn']
                ag['todos'].append(entry)
                state['updated'] = datetime.now(timezone.utc).isoformat()
                _save()
            _broadcast()
            self._json(200, {'ok': True})

        elif p == '/resource/claim':
            ag_name  = d.get('agent', '')
            resource = d.get('resource', '')
            task     = d.get('task', '')
            if not resource:
                self._json(400, {'error': 'resource required'})
                return
            with _lock:
                existing = state['resources'].get(resource)
                if existing and existing.get('agent') != ag_name:
                    self._json(409, {'conflict': True, 'holder': existing})
                    return
                now = datetime.now(timezone.utc).isoformat()
                state['resources'][resource] = {'agent': ag_name, 'task': task, 'since': now}
                state['updated'] = now
                state['log'].insert(0, {'ts': now, 'agent': ag_name,
                                        'todo': f'CLAIM {resource.upper()}', 'message': task})
                state['log'] = state['log'][:50]
                _save()
            _broadcast()
            self._json(200, {'ok': True})

        elif p == '/resource/release':
            ag_name  = d.get('agent', '')
            resource = d.get('resource', '')
            with _lock:
                existing = state['resources'].get(resource)
                if existing and existing.get('agent') == ag_name:
                    del state['resources'][resource]
                    now = datetime.now(timezone.utc).isoformat()
                    state['updated'] = now
                    state['log'].insert(0, {'ts': now, 'agent': ag_name,
                                            'todo': f'RELEASE {resource.upper()}', 'message': ''})
                    state['log'] = state['log'][:50]
                    _save()
            _broadcast()
            self._json(200, {'ok': True})

        elif p == '/announce':
            sender = d.get('from', 'dispatch')
            text   = d.get('text', '').strip()
            to     = d.get('to', 'all')
            if not text:
                self._json(400, {'error': 'text required'})
                return
            with _lock:
                now = datetime.now(timezone.utc).isoformat()
                entry = {'ts': now, 'from': sender, 'to': to, 'text': text}
                state.setdefault('messages', []).insert(0, entry)
                state['messages'] = state['messages'][:50]
                state['updated'] = now
                state['log'].insert(0, {
                    'ts':      now,
                    'agent':   sender.upper(),
                    'todo':    f'[ANNOUNCE → {to.upper()}]',
                    'message': text,
                })
                state['log'] = state['log'][:50]
                _save()
            _broadcast()
            self._json(200, {'ok': True, 'entry': entry})

        elif p == '/lesson':
            # Pipeline error lesson — persisted separately from announce traffic.
            # Payload: {from, error, mitigations: [str]}
            # Agents GET /lessons to pull the full list as context.
            sender      = d.get('from', 'watcher')
            error_text  = d.get('error', '').strip()
            mitigations = d.get('mitigations', [])
            if not error_text:
                self._json(400, {'error': 'error field required'})
                return
            with _lock:
                now = datetime.now(timezone.utc).isoformat()
                entry = {
                    'ts':          now,
                    'from':        sender,
                    'error':       error_text,
                    'mitigations': mitigations,
                }
                state.setdefault('lessons', []).insert(0, entry)
                state['lessons'] = state['lessons'][:100]
                state['updated'] = now
                state['log'].insert(0, {
                    'ts':      now,
                    'agent':   sender.upper(),
                    'todo':    '[LESSON]',
                    'message': error_text[:120],
                })
                state['log'] = state['log'][:50]
                _save()
            _broadcast()
            self._json(200, {'ok': True, 'entry': entry})

        elif p == '/reset':
            with _lock:
                state.clear()
                state.update(copy.deepcopy(INITIAL))
                _save()
            _broadcast()
            self._json(200, {'ok': True})

        else:
            self._json(404, {'error': 'not found'})


if __name__ == '__main__':
    srv = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Dispatch Coordination  →  http://localhost:{PORT}')
    print()
    print('  POST /todo/complete     {"agent":"engineer","id":"smoke_test","message":"optional"}')
    print('  POST /todo/add          {"agent":"producer","id":"my_id","label":"New task"}')
    print('  POST /resource/claim    {"agent":"engineer","resource":"gpu","task":"T2V smoke test"}')
    print('  POST /resource/release  {"agent":"engineer","resource":"gpu"}')
    print('  POST /announce          {"from":"dispatch","to":"all","text":"Stand by"}')
    print('  POST /lesson            {"from":"watcher","error":"what happened","mitigations":["...", "..."]}')
    print('  POST /reset             Wipe state back to seed')
    print('  GET  /resources         Active resource claims')
    print('  GET  /messages          Dispatch announce channel')
    print('  GET  /lessons           Pipeline error lessons (agents pull for context)')
    print('  GET  /events            SSE stream')
    print('  GET  /state.json        Snapshot')
    print()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nShutdown.')
        srv.server_close()
