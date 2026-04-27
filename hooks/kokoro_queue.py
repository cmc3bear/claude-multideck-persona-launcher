"""Kokoro TTS priority queue — directory-backed, multi-process safe.

Implements MULTI-FIX-0051 criteria:
  1. Priority lane: P0 announcements never evicted regardless of queue depth.
  2. Spillover: evicted normal items persist in a spillover dir and replay on drain.
  3. Retry: failed playback retried at least once before final discard.
  4. Stats surface: stats.json tracks queue depths + drop counters for /api/kokoro/stats.

Queue layout (under hooks/.kokoro-queue/):
    p0/         Priority-0 items. No depth cap. Never evicted.
    normal/     Normal items. Capped at MAX_NORMAL_DEPTH. Oldest evicted on overflow.
    spillover/  Evicted normal items. Drained after p0 + normal are empty.
    tmp/        Staging area for atomic enqueue (rename from here into target).
    lock/       Drainer mutex (atomic mkdir).
    stats.json  Monotonic counters + current depths.

Each queued item is two sidecar files with a shared stem:
    <stem>.wav     audio payload
    <stem>.meta.json  { callsign, priority, retry_count, enqueued_at, session_id }

Stem format: <ms-timestamp>-<session>-<uniq> so lexical sort gives FIFO.
"""
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid

QUEUE_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.kokoro-queue')
P0_DIR = os.path.join(QUEUE_ROOT, 'p0')
NORMAL_DIR = os.path.join(QUEUE_ROOT, 'normal')
SPILLOVER_DIR = os.path.join(QUEUE_ROOT, 'spillover')
TMP_DIR = os.path.join(QUEUE_ROOT, 'tmp')
LOCK_DIR = os.path.join(QUEUE_ROOT, 'lock')
EVENTS_DIR = os.path.join(QUEUE_ROOT, 'events')
STATS_PATH = os.path.join(QUEUE_ROOT, 'stats.json')

# Monotonic counters are stored as one empty marker file per event in events/<counter>/.
# This avoids the read-modify-write race on stats.json under concurrent enqueue.
COUNTER_NAMES = ('enqueued', 'played', 'spilled', 'retried', 'dropped', 'p0_dropped')

MAX_NORMAL_DEPTH = 12
MAX_RETRIES = 1
LOCK_STALE_SECS = 600


def _ensure_dirs():
    for d in (QUEUE_ROOT, P0_DIR, NORMAL_DIR, SPILLOVER_DIR, TMP_DIR, EVENTS_DIR):
        os.makedirs(d, exist_ok=True)
    for name in COUNTER_NAMES:
        os.makedirs(os.path.join(EVENTS_DIR, name), exist_ok=True)


def _wavs_in(d):
    try:
        return sorted(f for f in os.listdir(d) if f.endswith('.wav'))
    except FileNotFoundError:
        return []


def _depths():
    return {
        'p0': len(_wavs_in(P0_DIR)),
        'normal': len(_wavs_in(NORMAL_DIR)),
        'spillover': len(_wavs_in(SPILLOVER_DIR)),
    }


def _count_markers(name):
    try:
        return len(os.listdir(os.path.join(EVENTS_DIR, name)))
    except FileNotFoundError:
        return 0


def _record_events(deltas):
    """Drop marker files for each counter increment. Lossless under concurrency.

    Uses os.open with O_CREAT|O_EXCL so two processes can never collide on the
    same marker name (uuid-based).
    """
    if not deltas:
        return
    _ensure_dirs()
    ts_prefix = f"{int(time.time() * 1000):013d}"
    for name, n in deltas.items():
        if n <= 0:
            continue
        bucket = os.path.join(EVENTS_DIR, name)
        for _ in range(n):
            marker = os.path.join(bucket, f"{ts_prefix}-{uuid.uuid4().hex}")
            try:
                fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
            except FileExistsError:
                # uuid collision is astronomically unlikely; fall through silently.
                pass


def _stats_snapshot():
    counters = {name: _count_markers(name) for name in COUNTER_NAMES}
    return {
        'queue_depth': _depths(),
        'counters': counters,
        'last_updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }


def _refresh_stats_file():
    """Write a snapshot to stats.json for readers that don't have Python (dashboard)."""
    _ensure_dirs()
    snap = _stats_snapshot()
    tmp = os.path.join(TMP_DIR, f'stats-{uuid.uuid4().hex}.json')
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(snap, f, indent=2)
        os.replace(tmp, STATS_PATH)
    except OSError:
        # Non-fatal: the dashboard helper also recomputes depths from the filesystem.
        try: os.remove(tmp)
        except OSError: pass


def _update_stats(counter_deltas=None):
    _record_events(counter_deltas or {})
    _refresh_stats_file()


def _stem():
    return f"{int(time.time() * 1000):013d}-{os.getpid()}-{uuid.uuid4().hex[:8]}"


def _target_dir(priority):
    return P0_DIR if priority == 'p0' else NORMAL_DIR


def _evict_if_over_capacity():
    """If normal/ exceeds MAX_NORMAL_DEPTH, move oldest wavs to spillover/.
    Returns count actually evicted."""
    wavs = _wavs_in(NORMAL_DIR)
    overflow = len(wavs) - MAX_NORMAL_DEPTH
    evicted = 0
    for name in wavs[:max(0, overflow)]:
        stem = name[:-4]
        for suffix in ('.wav', '.meta.json'):
            src = os.path.join(NORMAL_DIR, stem + suffix)
            dst = os.path.join(SPILLOVER_DIR, stem + suffix)
            try:
                os.replace(src, dst)
            except FileNotFoundError:
                # another drainer/enqueuer moved it already
                pass
        evicted += 1
    return evicted


def enqueue(wav_path, callsign='', priority='normal', session_id=''):
    """Enqueue a rendered WAV for playback. Returns the queue stem.

    wav_path must exist and will be MOVED into the queue (atomic rename on
    same filesystem). If priority='p0', never evicted. If 'normal' and the
    normal queue depth would exceed MAX_NORMAL_DEPTH, the oldest normal item
    is moved to spillover/.
    """
    if priority not in ('p0', 'normal'):
        raise ValueError(f"invalid priority: {priority!r}")
    _ensure_dirs()

    stem = _stem()
    target = _target_dir(priority)
    dst_wav = os.path.join(target, stem + '.wav')
    dst_meta = os.path.join(target, stem + '.meta.json')

    meta = {
        'callsign': callsign,
        'priority': priority,
        'retry_count': 0,
        'enqueued_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'session_id': session_id,
    }
    tmp_meta = os.path.join(TMP_DIR, stem + '.meta.json')
    with open(tmp_meta, 'w', encoding='utf-8') as f:
        json.dump(meta, f)

    # Rename wav + meta into target atomically
    os.replace(wav_path, dst_wav)
    os.replace(tmp_meta, dst_meta)

    spilled = 0
    if priority == 'normal':
        spilled = _evict_if_over_capacity()

    _update_stats({'enqueued': 1, 'spilled': spilled})
    return stem


def _acquire_lock(timeout=LOCK_STALE_SECS):
    """Return True if we hold the drainer lock now. Non-blocking fast path."""
    _ensure_dirs()
    try:
        os.mkdir(LOCK_DIR)
        return True
    except FileExistsError:
        pass
    # Stale-lock recovery: if the lock dir is older than timeout, force-acquire.
    try:
        age = time.time() - os.path.getmtime(LOCK_DIR)
    except OSError:
        age = 0
    if age > timeout:
        try:
            os.rmdir(LOCK_DIR)
            os.mkdir(LOCK_DIR)
            return True
        except OSError:
            return False
    return False


def _release_lock():
    try:
        os.rmdir(LOCK_DIR)
    except OSError:
        pass


def _next_item(skip=None):
    """Return (src_dir, stem) of the next item to play, or None if queues empty.
    Priority order: p0, normal, spillover. Items whose stem is in `skip` are
    not returned (used by drain to avoid retrying the same item within a
    single call)."""
    skip = skip or frozenset()
    for d in (P0_DIR, NORMAL_DIR, SPILLOVER_DIR):
        for name in _wavs_in(d):
            stem = name[:-4]
            if stem not in skip:
                return d, stem
    return None


def _read_meta(src_dir, stem):
    try:
        with open(os.path.join(src_dir, stem + '.meta.json'), 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {'callsign': '', 'priority': 'normal', 'retry_count': 0}


def _delete_item(src_dir, stem):
    for suffix in ('.wav', '.meta.json'):
        try:
            os.remove(os.path.join(src_dir, stem + suffix))
        except OSError:
            pass


def _increment_retry(src_dir, stem, meta):
    meta['retry_count'] = meta.get('retry_count', 0) + 1
    try:
        with open(os.path.join(src_dir, stem + '.meta.json'), 'w', encoding='utf-8') as f:
            json.dump(meta, f)
    except OSError:
        pass


def drain(play_fn, stop_after=None):
    """Drain the queues. Non-blocking if another process holds the drainer lock.

    play_fn(wav_path, meta) -> None on success, raises on failure.
    stop_after: optional int cap on items to process (for tests). None = drain to empty.

    Returns dict with counts actually played, retried, dropped on this call.
    """
    summary = {'played': 0, 'retried': 0, 'dropped': 0, 'p0_dropped': 0}
    if not _acquire_lock():
        return summary

    processed = 0
    # Each item gets at most one attempt per drain call. Retries are deferred
    # to the next drain invocation — the failure mode that motivated the retry
    # (busy audio device, file lock) is unlikely to clear within the same drain.
    seen_this_call = set()
    try:
        while True:
            if stop_after is not None and processed >= stop_after:
                break
            nxt = _next_item(skip=seen_this_call)
            if not nxt:
                break
            src_dir, stem = nxt
            seen_this_call.add(stem)
            meta = _read_meta(src_dir, stem)
            wav = os.path.join(src_dir, stem + '.wav')
            if not os.path.exists(wav):
                # Someone else cleaned it up (shouldn't happen with lock held, but safe)
                continue
            try:
                play_fn(wav, meta)
            except Exception:
                if meta.get('retry_count', 0) < MAX_RETRIES:
                    _increment_retry(src_dir, stem, meta)
                    summary['retried'] += 1
                    _update_stats({'retried': 1})
                    processed += 1
                    continue
                # Final discard
                _delete_item(src_dir, stem)
                summary['dropped'] += 1
                if meta.get('priority') == 'p0':
                    summary['p0_dropped'] += 1
                    _update_stats({'dropped': 1, 'p0_dropped': 1})
                else:
                    _update_stats({'dropped': 1})
                processed += 1
                continue
            # Success
            _delete_item(src_dir, stem)
            summary['played'] += 1
            _update_stats({'played': 1})
            processed += 1
    finally:
        _release_lock()
    return summary


def play_ffplay(wav_path, meta):
    """Default play_fn: runs ffplay synchronously. Raises on non-zero exit."""
    CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
    proc = subprocess.run(
        ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet', wav_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=CREATE_NO_WINDOW,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffplay exit {proc.returncode}")


def reset():
    """Wipe the queue (for tests). Removes QUEUE_ROOT and re-creates."""
    if os.path.isdir(QUEUE_ROOT):
        shutil.rmtree(QUEUE_ROOT, ignore_errors=True)
    _ensure_dirs()
    _update_stats()


def read_stats():
    """Public accessor for the dashboard route and tests.

    Always recomputes from filesystem (depths from queue dirs, counters from
    event marker files). stats.json is a best-effort mirror for cross-language
    consumers that don't want to walk directories.
    """
    return _stats_snapshot()
