"""Load test harness for the Kokoro queue (MULTI-FIX-0051 criterion 4).

Exercises the queue without synthesizing audio or invoking ffplay. Creates
tiny placeholder WAV files and uses a fake play_fn so the test is fast and
deterministic.

Three scenarios run in sequence:

  A. Eviction invariants (single-process):
     - Enqueue 20 normal + 10 p0.
     - Assert normal dir has exactly MAX_NORMAL_DEPTH items.
     - Assert spillover dir has 20 - MAX_NORMAL_DEPTH items.
     - Assert p0 dir has all 10 p0 items (none evicted).

  B. 30-concurrent enqueue (multi-process):
     - Fork 30 subprocesses, each enqueues once (mixed p0/normal).
     - Assert counts match: enqueued == 30, p0_dropped == 0.
     - Drain with a fake play_fn that always succeeds.
     - Assert every enqueued item was played.

  C. Retry-then-drop:
     - Enqueue 3 items.
     - Drain with a play_fn that always raises.
     - Assert: first pass marks them as retried, second pass drops them.

Exits 0 on pass, nonzero with a diff on failure.
"""
import json
import os
import struct
import subprocess
import sys
import time
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import kokoro_queue as kq  # noqa: E402


SILENT_WAV_BYTES = None  # cached


def make_silent_wav(path, ms=20):
    """Write a tiny silent WAV so the queue has something real to move around."""
    global SILENT_WAV_BYTES
    if SILENT_WAV_BYTES is None:
        sample_rate = 24000
        samples = int(sample_rate * ms / 1000)
        data = b'\x00\x00' * samples
        chunk_size = 36 + len(data)
        SILENT_WAV_BYTES = b''.join([
            b'RIFF', struct.pack('<I', chunk_size), b'WAVE',
            b'fmt ', struct.pack('<IHHIIHH', 16, 1, 1, sample_rate, sample_rate * 2, 2, 16),
            b'data', struct.pack('<I', len(data)), data,
        ])
    with open(path, 'wb') as f:
        f.write(SILENT_WAV_BYTES)


def enqueue_one(priority):
    """Top-level so ProcessPoolExecutor can pickle it."""
    import kokoro_queue as q  # re-import in child for Windows spawn
    import os as _os
    tmp_wav = _os.path.join(q.TMP_DIR, f'payload-{_os.getpid()}-{uuid.uuid4().hex}.wav')
    _os.makedirs(q.TMP_DIR, exist_ok=True)
    make_silent_wav(tmp_wav)
    return q.enqueue(tmp_wav, callsign='Test', priority=priority, session_id='load-test')


def assert_eq(label, actual, expected):
    if actual != expected:
        print(f"FAIL [{label}]: expected {expected!r}, got {actual!r}")
        sys.exit(2)
    print(f"pass [{label}]: {actual}")


def scenario_a_eviction():
    print("\n=== Scenario A: eviction invariants ===")
    kq.reset()
    for _ in range(20):
        p = os.path.join(kq.TMP_DIR, f'a-{uuid.uuid4().hex}.wav')
        make_silent_wav(p)
        kq.enqueue(p, callsign='A', priority='normal')
    for _ in range(10):
        p = os.path.join(kq.TMP_DIR, f'a-p0-{uuid.uuid4().hex}.wav')
        make_silent_wav(p)
        kq.enqueue(p, callsign='A', priority='p0')
    stats = kq.read_stats()
    assert_eq('A.normal depth <= MAX', stats['queue_depth']['normal'] <= kq.MAX_NORMAL_DEPTH, True)
    assert_eq('A.normal depth == MAX', stats['queue_depth']['normal'], kq.MAX_NORMAL_DEPTH)
    assert_eq('A.spillover depth', stats['queue_depth']['spillover'], 20 - kq.MAX_NORMAL_DEPTH)
    assert_eq('A.p0 depth (all retained)', stats['queue_depth']['p0'], 10)
    assert_eq('A.spilled counter', stats['counters']['spilled'], 20 - kq.MAX_NORMAL_DEPTH)
    assert_eq('A.enqueued counter', stats['counters']['enqueued'], 30)
    assert_eq('A.p0_dropped', stats['counters']['p0_dropped'], 0)


def scenario_b_concurrent_30():
    print("\n=== Scenario B: 30-concurrent enqueue ===")
    kq.reset()
    # Mix: 10 p0, 20 normal
    priorities = ['p0'] * 10 + ['normal'] * 20
    with ProcessPoolExecutor(max_workers=30) as pool:
        futures = [pool.submit(enqueue_one, p) for p in priorities]
        for _ in as_completed(futures):
            pass
    stats = kq.read_stats()
    assert_eq('B.enqueued counter', stats['counters']['enqueued'], 30)
    assert_eq('B.p0 depth (never evicted)', stats['queue_depth']['p0'], 10)
    assert_eq('B.normal depth <= MAX', stats['queue_depth']['normal'] <= kq.MAX_NORMAL_DEPTH, True)
    assert_eq('B.p0_dropped', stats['counters']['p0_dropped'], 0)
    total_after_enqueue = (
        stats['queue_depth']['p0']
        + stats['queue_depth']['normal']
        + stats['queue_depth']['spillover']
    )
    assert_eq('B.items persisted (enqueued - none lost)', total_after_enqueue, 30)

    # Drain with a fake play_fn that always succeeds.
    played_order = []
    def fake_play(wav_path, meta):
        played_order.append(meta.get('priority', '?'))
    summary = kq.drain(fake_play)
    assert_eq('B.drain played all', summary['played'], 30)
    assert_eq('B.drain dropped', summary['dropped'], 0)
    # P0 must drain first
    first_10 = played_order[:10]
    assert_eq('B.first 10 drained are all p0', all(p == 'p0' for p in first_10), True)
    final = kq.read_stats()
    assert_eq('B.played counter', final['counters']['played'], 30)
    assert_eq('B.all queues empty', sum(final['queue_depth'].values()), 0)


def scenario_c_retry_then_drop():
    print("\n=== Scenario C: retry then drop ===")
    kq.reset()
    for _ in range(3):
        p = os.path.join(kq.TMP_DIR, f'c-{uuid.uuid4().hex}.wav')
        make_silent_wav(p)
        kq.enqueue(p, callsign='C', priority='normal')
    def always_fail(wav_path, meta):
        raise RuntimeError('synthetic failure')
    # First pass: every item retries; nothing dropped yet.
    pass1 = kq.drain(always_fail)
    assert_eq('C.pass1 retried', pass1['retried'], 3)
    assert_eq('C.pass1 dropped', pass1['dropped'], 0)
    # Second pass: retry budget exhausted, all drop.
    pass2 = kq.drain(always_fail)
    assert_eq('C.pass2 dropped', pass2['dropped'], 3)
    assert_eq('C.pass2 retried', pass2['retried'], 0)
    final = kq.read_stats()
    assert_eq('C.retried total', final['counters']['retried'], 3)
    assert_eq('C.dropped total', final['counters']['dropped'], 3)


def main():
    t0 = time.time()
    scenario_a_eviction()
    scenario_b_concurrent_30()
    scenario_c_retry_then_drop()
    elapsed = time.time() - t0
    print(f"\nALL PASSED in {elapsed:.2f}s")
    # Print final stats snapshot for evidence capture
    print("\nFinal stats.json:")
    print(json.dumps(kq.read_stats(), indent=2))


if __name__ == '__main__':
    main()
