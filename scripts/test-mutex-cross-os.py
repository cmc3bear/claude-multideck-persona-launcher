"""Cross-OS mkdir-mutex probe for kokoro_queue.

Run this from BOTH Windows-native Python and WSL Linux Python concurrently to
prove the LOCK_DIR mkdir is atomic across the OS boundary. This is the
foundation of MULTI-FEAT-0055 criterion 6 (audio feed serialization across
tmux-spawned WSL personas and wt-spawned Windows personas writing to the
same DISPATCH_TTS_OUTPUT directory).

Mode 'attempt': try to acquire the lock immediately, report result, exit.
Mode 'cleanup': remove the lock dir if held (after a winning attempt).

The orchestrator (test-mutex-cross-os.sh) runs N rounds of two parallel
attempts and tallies wins.

Output: one JSON line on stdout per invocation:
  {"role": "win|lose|stale|err", "side": "windows|wsl", "ts": <epoch>,
   "lock_path": "...", "detail": "..."}
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
HOOKS = os.path.normpath(os.path.join(HERE, '..', 'hooks'))
sys.path.insert(0, HOOKS)

import kokoro_queue as kq  # noqa: E402


def _emit(role, side, detail=''):
    print(json.dumps({
        'role': role,
        'side': side,
        'ts': time.time(),
        'lock_path': kq.LOCK_DIR,
        'detail': detail,
    }), flush=True)


def main():
    args = sys.argv[1:]
    side = 'windows' if sys.platform.startswith('win') else 'wsl'
    if not args:
        sys.exit('usage: test-mutex-cross-os.py attempt|cleanup [hold-secs] [--barrier-ts <epoch>]')

    if args[0] == 'cleanup':
        kq._release_lock()
        _emit('cleanup', side, 'released if held')
        return

    if args[0] != 'attempt':
        sys.exit(f'unknown mode: {args[0]}')

    # Optional --barrier-ts <epoch>: spinwait until that wall-clock instant
    # before racing for the lock. Eliminates cold-start asymmetry between
    # WSL Linux Python and powershell-spawned Windows Python (criterion 2 of
    # MULTI-OQE-0062). Both sides must be running by target_ts; the
    # orchestrator picks target_ts = now + ~1s to give both interpreters
    # time to import kokoro_queue.
    barrier_ts = None
    pos_args = []
    i = 1
    while i < len(args):
        if args[i] == '--barrier-ts' and i + 1 < len(args):
            barrier_ts = float(args[i + 1])
            i += 2
        else:
            pos_args.append(args[i])
            i += 1

    hold = float(pos_args[0]) if pos_args else 0.5

    kq._ensure_dirs()

    if barrier_ts is not None:
        # Pre-warm: ensure all imports + filesystem touch are done before the
        # gate opens. Then busy-wait so both sides cross the gate at the
        # same instant regardless of cold-start cost.
        _ = kq.LOCK_DIR  # touch
        wait = barrier_ts - time.time()
        if wait > 0:
            # Coarse sleep until ~5ms before target, then spinwait for precision.
            if wait > 0.01:
                time.sleep(wait - 0.005)
            while time.time() < barrier_ts:
                pass

    acquired = kq._acquire_lock(timeout=kq.LOCK_STALE_SECS)
    if acquired:
        _emit('win', side, f'will hold {hold}s')
        time.sleep(hold)
        kq._release_lock()
        _emit('release', side, '')
    else:
        # Distinguish stale recovery from contention:
        # _acquire_lock returned False because the lock existed and was younger
        # than LOCK_STALE_SECS. The competing winner is still holding it.
        _emit('lose', side, 'lock held by other process')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # pragma: no cover
        print(json.dumps({'role': 'err', 'side': 'unknown', 'ts': time.time(),
                          'detail': str(e)}), flush=True)
        sys.exit(1)
