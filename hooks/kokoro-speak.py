"""Kokoro TTS speech worker — reads voice config + text from file, generates audio, plays via ffplay.

Updates v2:
- Voice announcements: prepends callsign to the text so each persona introduces itself
- Playback queueing: uses an atomic mkdir lock so multiple Claude sessions don't overlap audio

MultiDeck framework: sanitized for public distribution. No custom voice tensors by default.
Users can add their own tensors via the CUSTOM_VOICES pattern in kokoro-speak.py.
"""
import sys, os, json, tempfile, subprocess, time

# Custom voice configs with post-processing chains
# Add your custom voice tensors here. Example:
# "my_voice": {
#     "voice_pt": "/path/to/my_voice.pt",
#     "lang": "a",
#     "speed": 1.0,
#     "ffmpeg_dry": "...",
#     "ffmpeg_reverb": "...",
#     "reverb_mix": 0.2,
# }
CUSTOM_VOICES = {}

# Atomic mutex via mkdir — prevents overlapping audio across parallel Claude sessions
LOCK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".kokoro-speak-lock")

def acquire_playback_lock(timeout=600):
    """Atomic mkdir-based mutex. Returns when lock acquired, raises on timeout."""
    start = time.time()
    while True:
        try:
            os.mkdir(LOCK_DIR)
            return
        except FileExistsError:
            elapsed = time.time() - start
            if elapsed > timeout:
                # Stale lock — force acquire
                try:
                    os.rmdir(LOCK_DIR)
                except OSError:
                    pass
                try:
                    os.mkdir(LOCK_DIR)
                    return
                except OSError:
                    pass
            time.sleep(0.2)

def release_playback_lock():
    try:
        os.rmdir(LOCK_DIR)
    except OSError:
        pass

def apply_post_processing(wav_path, custom_cfg, session_id):
    """Apply ffmpeg post-processing chain for custom voices (dry + reverb layer mix)."""
    tmp = tempfile.gettempdir()
    suffix = f'-{session_id}' if session_id else ''
    dry_path = os.path.join(tmp, f'claude-tts-dry{suffix}.wav')
    reverb_path = os.path.join(tmp, f'claude-tts-reverb{suffix}.wav')
    final_path = os.path.join(tmp, f'claude-tts-final{suffix}.wav')

    CREATE_NO_WINDOW = 0x08000000
    try:
        subprocess.run(
            ['ffmpeg', '-y', '-i', wav_path, '-af', custom_cfg['ffmpeg_dry'], dry_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=CREATE_NO_WINDOW
        )
        subprocess.run(
            ['ffmpeg', '-y', '-i', dry_path, '-af', custom_cfg['ffmpeg_reverb'], reverb_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=CREATE_NO_WINDOW
        )
        mix_weight = custom_cfg.get('reverb_mix', 0.2)
        subprocess.run(
            ['ffmpeg', '-y', '-i', dry_path, '-i', reverb_path, '-filter_complex',
             f'[0:a][1:a]amix=inputs=2:weights=1 {mix_weight}:duration=longest,alimiter=limit=0.95',
             final_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=CREATE_NO_WINDOW
        )
    except Exception:
        return wav_path
    finally:
        for p in [dry_path, reverb_path]:
            try: os.remove(p)
            except: pass

    if os.path.exists(final_path):
        try: os.remove(wav_path)
        except: pass
        return final_path
    return wav_path

def main():
    text_file = sys.argv[1]
    session_id = sys.argv[2] if len(sys.argv) > 2 else None

    with open(text_file, 'r', encoding='utf-8') as f:
        text = f.read().strip()

    if not text:
        return

    # Scrub special characters that TTS reads aloud
    import re
    text = text.replace('\u2014', ', ')
    text = text.replace('\u2013', ', ')
    text = text.replace('\u2015', ', ')
    text = text.replace('—', ', ')
    text = text.replace('–', ', ')
    text = text.replace('~', ' ')
    text = text.replace('`', '')
    text = text.replace('|', ', ')
    text = text.replace('[', '').replace(']', '')
    text = text.replace('{', '').replace('}', '')
    text = text.replace('<', '').replace('>', '')
    text = text.replace('*', '')
    text = text.replace('#', '')
    text = text.replace('/', ' ')
    text = text.replace('\\', ' ')
    text = text.replace('_', ' ')
    text = text.replace('-', ' ')
    text = re.sub(r'\s+', ' ', text).strip()

    # Read voice config — try session-specific first, then shared fallback
    hooks_dir = os.path.dirname(os.path.abspath(__file__))
    config = None
    if session_id:
        session_config = os.path.join(hooks_dir, f'voice-config-{session_id}.json')
        try:
            with open(session_config, 'r') as f:
                config = json.load(f)
        except:
            pass
    if config is None:
        try:
            with open(os.path.join(hooks_dir, 'voice-config.json'), 'r') as f:
                config = json.load(f)
        except:
            config = {'voice': 'am_puck', 'lang': 'a', 'speed': 1.05}

    voice = config.get('voice', 'am_puck')
    lang = config.get('lang', 'a')
    speed = config.get('speed', 1.05)
    callsign = config.get('callsign', '')

    # Prepend persona announcement — helps users learn which voice belongs to which persona
    if callsign:
        text = f"{callsign}. {text}"

    # Check if this is a custom voice with post-processing
    custom_cfg = CUSTOM_VOICES.get(voice)

    from kokoro import KPipeline
    import soundfile as sf
    import numpy as np
    import torch

    if custom_cfg:
        lang = custom_cfg['lang']
        speed = custom_cfg['speed']

    pipeline = KPipeline(lang_code=lang)

    if custom_cfg and os.path.exists(custom_cfg['voice_pt']):
        voice_tensor = torch.load(custom_cfg['voice_pt'], weights_only=True)
        generator = pipeline(text, voice=voice_tensor, speed=speed)
    else:
        generator = pipeline(text, voice=voice, speed=speed)

    audio_parts = []
    for gs, ps, audio in generator:
        audio_parts.append(audio)

    if not audio_parts:
        return

    full_audio = np.concatenate(audio_parts)

    wav_suffix = f'-{session_id}' if session_id else ''
    wav_path = os.path.join(tempfile.gettempdir(), f'claude-tts-output{wav_suffix}.wav')
    sf.write(wav_path, full_audio, 24000)

    if custom_cfg:
        wav_path = apply_post_processing(wav_path, custom_cfg, session_id)

    # Save a copy to tts-output/ for the audio feed dashboard
    save_to_feed(wav_path, callsign)

    # Acquire the playback mutex — this is the critical section that serializes audio
    acquire_playback_lock()
    try:
        CREATE_NO_WINDOW = 0x08000000
        subprocess.run(
            ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet', wav_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW
        )
    finally:
        release_playback_lock()
        try:
            os.remove(wav_path)
            os.remove(text_file)
        except:
            pass


def save_to_feed(wav_path, callsign):
    """Convert WAV to MP3 and save to tts-output/ for the audio feed. Prune files older than 24h."""
    hooks_dir = os.path.dirname(os.path.abspath(__file__))
    dispatch_root = os.environ.get('DISPATCH_ROOT', os.path.dirname(hooks_dir))
    tts_dir = os.environ.get('DISPATCH_TTS_OUTPUT', os.path.join(dispatch_root, 'tts-output'))
    os.makedirs(tts_dir, exist_ok=True)

    # Generate timestamped filename with callsign
    tag = callsign.lower().replace(' ', '-') if callsign else 'unknown'
    ts = time.strftime('%Y%m%d-%H%M%S')
    mp3_name = f'{ts}-{tag}.mp3'
    mp3_path = os.path.join(tts_dir, mp3_name)

    try:
        CREATE_NO_WINDOW = 0x08000000
        subprocess.run(
            ['ffmpeg', '-y', '-i', wav_path, '-codec:a', 'libmp3lame', '-b:a', '128k', '-loglevel', 'quiet', mp3_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW, timeout=30
        )
    except Exception:
        pass

    # Prune files older than 24 hours
    prune_feed(tts_dir, max_age_hours=24)


def prune_feed(tts_dir, max_age_hours=24):
    """Delete MP3 files in tts-output/ older than max_age_hours."""
    cutoff = time.time() - (max_age_hours * 3600)
    try:
        for f in os.listdir(tts_dir):
            if not f.endswith('.mp3'):
                continue
            full = os.path.join(tts_dir, f)
            try:
                if os.path.getmtime(full) < cutoff:
                    os.remove(full)
            except OSError:
                pass
    except OSError:
        pass


if __name__ == '__main__':
    main()
