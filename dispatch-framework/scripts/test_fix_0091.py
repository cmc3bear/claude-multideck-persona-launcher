#!/usr/bin/env python3
"""
MULTI-FIX-0091 test harness  (OQE 2.0)

Asserts all 5 criteria using proper unittest assertions.
No console.log-only paths — every outcome captured by assert or fail().

Run from the dispatch-framework root:
    python -m unittest scripts.test_fix_0091 -v

Or from scripts/:
    python -m unittest test_fix_0091 -v

OQE anchors (§11 linkable_citations_only):
  C1  — coordination/hook-announce.py  _resolve_coord_host()
        §11 dependency_tracking: fix must not regress Windows-hosted server path
  C2  — coordination/hook-complete.py  _resolve_coord_host()
        coordination/hook-resource.py  _resolve_coord_host()
  C3  — docs/CLAUDE_DISPATCH_INTEGRATION.md  Transport Matrix
        §11 linkable_citations_only citing the transport matrix section
  C4  — coordination/hook-announce.py  module docstring
        dispatch-framework/docs/VOICE_RULES.md forward-slash rule
  C5  — coordination/hook-announce.py  round-trip POST /announce
        §4 Evidence collection: STRONG (direct observation)
"""
from __future__ import annotations

import importlib.util
import json
import os
import socket
import subprocess
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPTS_DIR    = Path(__file__).parent
FRAMEWORK_ROOT = SCRIPTS_DIR.parent
COORD_DIR      = FRAMEWORK_ROOT / 'coordination'
DOCS_DIR       = FRAMEWORK_ROOT / 'docs'

HOOK_ANNOUNCE  = COORD_DIR / 'hook-announce.py'
HOOK_COMPLETE  = COORD_DIR / 'hook-complete.py'
HOOK_RESOURCE  = COORD_DIR / 'hook-resource.py'
DOC_INTEGRATION = DOCS_DIR / 'CLAUDE_DISPATCH_INTEGRATION.md'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _load_module(path: Path, name: str):
    """Load a .py file by path regardless of filename (hyphens OK)."""
    spec = importlib.util.spec_from_file_location(name, path)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class _CaptureHandler(BaseHTTPRequestHandler):
    """Minimal HTTP handler that captures one POST body then signals done."""

    captured: list[dict]  # shared by test instance
    event: threading.Event

    def log_message(self, *_):  # silence access log
        pass

    def do_POST(self):
        n    = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n) if n else b'{}'
        try:
            obj = json.loads(body)
        except Exception:
            obj = {'_raw': body.decode(errors='replace')}
        self.__class__.captured.append({'path': self.path, 'body': obj})
        resp = json.dumps({'ok': True}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)
        self.__class__.event.set()


def _start_mock_server(port: int) -> tuple[HTTPServer, threading.Event, list[dict]]:
    """Start a mock coord server on localhost:<port>. Returns (server, done_event, captures)."""
    captured: list[dict] = []
    done    = threading.Event()

    # inject shared state into the handler class via a fresh subclass per call
    handler = type(
        '_H',
        (_CaptureHandler,),
        {'captured': captured, 'event': done},
    )
    srv = HTTPServer(('127.0.0.1', port), handler)
    t   = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, done, captured


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
class TestFix0091(unittest.TestCase):

    # ── C1: DISPATCH_COORD_SERVER_LOCAL flag ──────────────────────────────────

    def test_c1_local_flag_returns_localhost(self):
        """
        C1 — §11 dependency_tracking:
        _resolve_coord_host() returns 'localhost' when DISPATCH_COORD_SERVER_LOCAL
        is set, regardless of /proc/version WSL detection.
        """
        # Load fresh; module-level _resolve_coord_host() may run in WSL context —
        # that's fine; we test the *function* call with the flag set.
        mod = _load_module(HOOK_ANNOUNCE, 'hook_announce_c1')
        orig = os.environ.get('DISPATCH_COORD_SERVER_LOCAL')
        try:
            os.environ['DISPATCH_COORD_SERVER_LOCAL'] = '1'
            result = mod._resolve_coord_host()
        finally:
            if orig is None:
                os.environ.pop('DISPATCH_COORD_SERVER_LOCAL', None)
            else:
                os.environ['DISPATCH_COORD_SERVER_LOCAL'] = orig

        self.assertEqual(
            result, 'localhost',
            'C1 FAIL: _resolve_coord_host() must return "localhost" when '
            'DISPATCH_COORD_SERVER_LOCAL=1 (§11 dependency_tracking)',
        )

    def test_c1_windows_path_not_regressed(self):
        """
        C1 regression — §11 dependency_tracking:
        Without DISPATCH_COORD_SERVER_LOCAL, the function still runs its
        /proc/version branch (returns gateway IP in WSL, or localhost elsewhere).
        Either way it must NOT return empty string or raise.
        """
        mod = _load_module(HOOK_ANNOUNCE, 'hook_announce_c1r')
        # Ensure the flag is absent
        orig = os.environ.pop('DISPATCH_COORD_SERVER_LOCAL', None)
        try:
            result = mod._resolve_coord_host()
        finally:
            if orig is not None:
                os.environ['DISPATCH_COORD_SERVER_LOCAL'] = orig

        self.assertIsInstance(result, str, 'C1-regression: must return a string')
        self.assertTrue(len(result) > 0, 'C1-regression: must return a non-empty host')

    # ── C2: hook-complete and hook-resource have the same fix ─────────────────

    def test_c2_hook_complete_has_resolve_coord_host(self):
        """
        C2 — coordination/hook-complete.py must expose _resolve_coord_host()
        and it must honour DISPATCH_COORD_SERVER_LOCAL=1.
        """
        mod = _load_module(HOOK_COMPLETE, 'hook_complete_c2')
        self.assertTrue(
            hasattr(mod, '_resolve_coord_host'),
            'C2 FAIL: hook-complete.py missing _resolve_coord_host() '
            '[coordination/hook-complete.py]',
        )
        orig = os.environ.get('DISPATCH_COORD_SERVER_LOCAL')
        try:
            os.environ['DISPATCH_COORD_SERVER_LOCAL'] = '1'
            result = mod._resolve_coord_host()
        finally:
            if orig is None:
                os.environ.pop('DISPATCH_COORD_SERVER_LOCAL', None)
            else:
                os.environ['DISPATCH_COORD_SERVER_LOCAL'] = orig

        self.assertEqual(
            result, 'localhost',
            'C2 FAIL: hook-complete.py _resolve_coord_host() must return "localhost" '
            'when DISPATCH_COORD_SERVER_LOCAL=1 [coordination/hook-complete.py]',
        )

    def test_c2_hook_resource_has_resolve_coord_host(self):
        """
        C2 — coordination/hook-resource.py must expose _resolve_coord_host()
        and it must honour DISPATCH_COORD_SERVER_LOCAL=1.
        """
        mod = _load_module(HOOK_RESOURCE, 'hook_resource_c2')
        self.assertTrue(
            hasattr(mod, '_resolve_coord_host'),
            'C2 FAIL: hook-resource.py missing _resolve_coord_host() '
            '[coordination/hook-resource.py]',
        )
        orig = os.environ.get('DISPATCH_COORD_SERVER_LOCAL')
        try:
            os.environ['DISPATCH_COORD_SERVER_LOCAL'] = '1'
            result = mod._resolve_coord_host()
        finally:
            if orig is None:
                os.environ.pop('DISPATCH_COORD_SERVER_LOCAL', None)
            else:
                os.environ['DISPATCH_COORD_SERVER_LOCAL'] = orig

        self.assertEqual(
            result, 'localhost',
            'C2 FAIL: hook-resource.py _resolve_coord_host() must return "localhost" '
            'when DISPATCH_COORD_SERVER_LOCAL=1 [coordination/hook-resource.py]',
        )

    # ── C3: doc transport matrix updated ─────────────────────────────────────

    def test_c3_doc_transport_matrix_wsl_hosted_row(self):
        """
        C3 — docs/CLAUDE_DISPATCH_INTEGRATION.md transport matrix must contain
        a WSL+server-in-WSL row referencing DISPATCH_COORD_SERVER_LOCAL.
        §11 linkable_citations_only citing transport matrix section.
        """
        self.assertTrue(
            DOC_INTEGRATION.exists(),
            f'C3 FAIL: {DOC_INTEGRATION} not found',
        )
        text = DOC_INTEGRATION.read_text(encoding='utf-8')

        self.assertIn(
            'DISPATCH_COORD_SERVER_LOCAL',
            text,
            'C3 FAIL: CLAUDE_DISPATCH_INTEGRATION.md must document '
            'DISPATCH_COORD_SERVER_LOCAL [docs/CLAUDE_DISPATCH_INTEGRATION.md]',
        )
        self.assertIn(
            'server in WSL',
            text,
            'C3 FAIL: transport matrix must include a "server in WSL" row '
            '[docs/CLAUDE_DISPATCH_INTEGRATION.md]',
        )
        self.assertIn(
            'server on Windows',
            text,
            'C3 FAIL: transport matrix must retain "server on Windows" row — '
            'regression check [docs/CLAUDE_DISPATCH_INTEGRATION.md]',
        )

    # ── C4: hook-announce.py docstring updated ────────────────────────────────

    def test_c4_docstring_mentions_local_flag(self):
        """
        C4 — coordination/hook-announce.py docstring must document
        DISPATCH_COORD_SERVER_LOCAL and use forward slashes only in path examples
        (§ VOICE_RULES.md forward-slash rule).
        """
        self.assertTrue(HOOK_ANNOUNCE.exists(), f'C4 FAIL: {HOOK_ANNOUNCE} not found')
        src = HOOK_ANNOUNCE.read_text(encoding='utf-8')
        # Extract the module docstring: find the opening triple-quote then the closing one
        ds_open  = src.find('"""')
        ds_close = src.find('"""', ds_open + 3) if ds_open != -1 else -1
        docstring = src[ds_open:ds_close + 3] if (ds_open != -1 and ds_close != -1) else src

        self.assertIn(
            'DISPATCH_COORD_SERVER_LOCAL',
            docstring,
            'C4 FAIL: hook-announce.py docstring must document DISPATCH_COORD_SERVER_LOCAL '
            '[coordination/hook-announce.py]',
        )
        # Forward-slash rule: docstring examples must not contain Windows backslash paths
        import re
        # Match backslash-paths like dispatch-framework\state but not escape sequences
        backslash_path = re.search(r'[A-Za-z0-9_\-]+\\[A-Za-z0-9_\-]', docstring)
        self.assertIsNone(
            backslash_path,
            f'C4 FAIL: docstring contains backslash path: '
            f'{backslash_path.group() if backslash_path else ""} '
            f'(VOICE_RULES.md forward-slash rule) [coordination/hook-announce.py]',
        )

    # ── C5: round-trip announce ───────────────────────────────────────────────

    def test_c5_round_trip_announce_with_local_flag(self):
        """
        C5 — §4 Evidence: STRONG (direct observation).
        Start a mock coord server, set DISPATCH_COORD_SERVER_LOCAL=1 and
        DISPATCH_COORD_PORT=<port> (no DISPATCH_COORD_URL), run hook-announce.py
        as a subprocess, assert:
          • subprocess exits 0
          • server received POST /announce
          • payload contains expected sender and text
        This proves _resolve_coord_host() chose localhost when the flag is set.
        """
        port = _free_port()
        srv, done, captures = _start_mock_server(port)
        try:
            env = os.environ.copy()
            env['DISPATCH_COORD_SERVER_LOCAL'] = '1'
            env['DISPATCH_COORD_PORT']          = str(port)
            env.pop('DISPATCH_COORD_URL', None)  # must not override resolution

            result = subprocess.run(
                [sys.executable, str(HOOK_ANNOUNCE),
                 'engineer', 'C5 round-trip test', '--to', 'all'],
                capture_output=True,
                text=True,
                env=env,
                timeout=10,
            )

            # Give the server thread a moment to process
            done.wait(timeout=3)

        finally:
            srv.shutdown()
            srv.server_close()

        self.assertEqual(
            result.returncode, 0,
            f'C5 FAIL: hook-announce.py exited {result.returncode}\n'
            f'stderr: {result.stderr}\nstdout: {result.stdout}',
        )
        self.assertTrue(
            captures,
            'C5 FAIL: mock server received no POST — hook did not reach localhost '
            '(§4 Evidence: STRONG — direct observation) [coordination/hook-announce.py]',
        )
        hit = captures[0]
        self.assertEqual(
            hit['path'], '/announce',
            f'C5 FAIL: expected POST /announce, got {hit["path"]}',
        )
        self.assertEqual(
            hit['body'].get('from'), 'engineer',
            f'C5 FAIL: announce "from" wrong: {hit["body"]}',
        )
        self.assertIn(
            'C5 round-trip', hit['body'].get('text', ''),
            f'C5 FAIL: announce "text" wrong: {hit["body"]}',
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
