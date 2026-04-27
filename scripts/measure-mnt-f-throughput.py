"""Measure /mnt/f write performance at realistic TTS cadence.

MULTI-OQE-0062 criterion 3: the feasibility report (state/feasibility-MULTI-FEAT-0055-tmux-transport.md sec 4 R2)
described /mnt/f write performance as "acceptable" without measurement. This probe
characterises throughput and write-latency p50/p95 for ~100KB MP3-shaped blobs at
TTS cadence (one write per 2-5 seconds), and additionally runs a back-to-back stress
mode for worst-case bound. Compares against a native-Linux ext4 path (e.g. /tmp) on
the same machine for relative magnitude.

Usage:
  python3 scripts/measure-mnt-f-throughput.py --target /mnt/f/03-INFRASTRUCTURE/dispatch-framework/tts-output --duration 60
  python3 scripts/measure-mnt-f-throughput.py --target /tmp --duration 60

Outputs JSON to stdout summarising bytes_written, mb_per_s, p50_ms, p95_ms, n_writes.

Cadence modes:
  --mode tts         realistic: one write every uniform(2.0, 5.0) seconds
  --mode stress      back-to-back: write as fast as filesystem permits
"""
import argparse
import json
import os
import random
import statistics
import sys
import time


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument('--target', required=True, help='directory to write into (must exist)')
    ap.add_argument('--duration', type=float, default=60.0, help='seconds to run')
    ap.add_argument('--blob-bytes', type=int, default=102400, help='size of each blob (default 100KB)')
    ap.add_argument('--mode', choices=['tts', 'stress'], default='tts')
    return ap.parse_args()


def fsync_path(fd):
    os.fsync(fd)


def main():
    args = parse_args()
    target = args.target
    if not os.path.isdir(target):
        sys.exit(f'target directory does not exist: {target}')

    blob = os.urandom(args.blob_bytes)
    latencies_ms = []
    bytes_written = 0
    started = time.time()
    deadline = started + args.duration
    n = 0
    pid = os.getpid()

    while time.time() < deadline:
        path = os.path.join(target, f'.throughput-probe-{pid}-{n}.bin')
        t0 = time.time()
        with open(path, 'wb') as f:
            f.write(blob)
            f.flush()
            fsync_path(f.fileno())
        t1 = time.time()
        latencies_ms.append((t1 - t0) * 1000.0)
        bytes_written += args.blob_bytes
        n += 1
        try:
            os.unlink(path)
        except OSError:
            pass
        if args.mode == 'tts':
            time.sleep(random.uniform(2.0, 5.0))

    elapsed = time.time() - started
    mb = bytes_written / (1024.0 * 1024.0)
    out = {
        'target': target,
        'mode': args.mode,
        'duration_s': round(elapsed, 3),
        'n_writes': n,
        'blob_bytes': args.blob_bytes,
        'bytes_written': bytes_written,
        'mb_per_s': round(mb / elapsed, 4) if elapsed > 0 else 0.0,
        'p50_ms': round(statistics.median(latencies_ms), 3) if latencies_ms else 0.0,
        'p95_ms': round(sorted(latencies_ms)[max(0, int(len(latencies_ms) * 0.95) - 1)], 3) if latencies_ms else 0.0,
        'p99_ms': round(sorted(latencies_ms)[max(0, int(len(latencies_ms) * 0.99) - 1)], 3) if latencies_ms else 0.0,
        'min_ms': round(min(latencies_ms), 3) if latencies_ms else 0.0,
        'max_ms': round(max(latencies_ms), 3) if latencies_ms else 0.0,
    }
    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
