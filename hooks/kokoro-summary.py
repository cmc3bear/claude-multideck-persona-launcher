"""Kokoro TTS — generate a long-form summary MP3 and drop it into tts-output for audio feed autoplay.

Usage:
  python kokoro-summary.py <voice_key> <text_file>
  python kokoro-summary.py <voice_key> --stdin
  python kokoro-summary.py <voice_key> --text "Your summary text here"

Reads text, synthesizes via Kokoro with the persona's voice, writes a timestamped MP3
into DISPATCH_TTS_OUTPUT (default: ../tts-output relative to hooks/).
The audio feed at /audio-feed polls that directory and autoplays new files.

Designed for summaries longer than one minute — progress updates print to stderr.
"""
import sys
import os
import re
import tempfile
import subprocess
import time
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
FRAMEWORK_ROOT = SCRIPT_DIR.parent
TTS_OUTPUT_DIR = Path(os.environ.get("DISPATCH_TTS_OUTPUT", FRAMEWORK_ROOT / "tts-output"))

VOICE_MAP = {
    "dispatch":            {"voice": "af_sky",    "lang": "a", "speed": 0.95, "callsign": "Dispatch"},
    "architect":           {"voice": "bm_daniel", "lang": "b", "speed": 1.05, "callsign": "Architect"},
    "engineer":            {"voice": "am_eric",   "lang": "a", "speed": 1.05, "callsign": "Engineer"},
    "reviewer":            {"voice": "bm_lewis",  "lang": "b", "speed": 1.05, "callsign": "Reviewer"},
    "researcher":          {"voice": "bf_emma",   "lang": "b", "speed": 1.05, "callsign": "Researcher"},
    "launcher-engineer":   {"voice": "am_michael","lang": "a", "speed": 1.05, "callsign": "Launcher Engineer"},
    "voice-technician":    {"voice": "bf_alice",  "lang": "b", "speed": 1.0,  "callsign": "Voice Technician"},
    "persona-author":      {"voice": "am_adam",   "lang": "a", "speed": 1.0,  "callsign": "Persona Author"},
    "commercial-producer": {"voice": "bf_lily",   "lang": "b", "speed": 0.95, "callsign": "Commercial Producer"},
    "default":             {"voice": "am_puck",   "lang": "a", "speed": 1.05, "callsign": ""},
}

CUSTOM_VOICES = {}


def scrub_text(text: str) -> str:
    text = text.replace("\u2014", ", ")
    text = text.replace("\u2013", ", ")
    text = text.replace("\u2015", ", ")
    text = text.replace("`", "")
    text = text.replace("~", " ")
    text = text.replace("|", ", ")
    text = text.replace("[", "").replace("]", "")
    text = text.replace("{", "").replace("}", "")
    text = text.replace("<", "").replace(">", "")
    text = text.replace("*", "")
    text = text.replace("#", "")
    text = text.replace("_", " ")
    text = text.replace("-", " ")
    text = text.replace("/", " ")
    text = text.replace("\\", " ")
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def wav_to_mp3(wav_path: str, mp3_path: str) -> bool:
    CREATE_NO_WINDOW = 0x08000000
    flags = CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "check": True}
        if os.name == "nt":
            kwargs["creationflags"] = flags
        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3_path],
            **kwargs,
        )
        return os.path.exists(mp3_path)
    except Exception:
        return False


def main():
    if len(sys.argv) < 3:
        print("Usage: kokoro-summary.py <voice_key> <text_file|--stdin|--text 'text'>", file=sys.stderr)
        sys.exit(1)

    voice_key = sys.argv[1].lower()

    if sys.argv[2] == "--stdin":
        text = sys.stdin.read()
    elif sys.argv[2] == "--text":
        text = " ".join(sys.argv[3:])
    else:
        text_file = sys.argv[2]
        if not os.path.exists(text_file):
            print(f"Text file not found: {text_file}", file=sys.stderr)
            sys.exit(1)
        with open(text_file, "r", encoding="utf-8") as f:
            text = f.read()

    text = scrub_text(text)
    if not text.strip():
        print("Text is empty after scrubbing", file=sys.stderr)
        sys.exit(1)

    config = VOICE_MAP.get(voice_key, VOICE_MAP["default"])
    voice = config["voice"]
    lang = config["lang"]
    speed = config["speed"]
    callsign = config.get("callsign", "")

    if callsign:
        text = f"{callsign}. {text}"

    custom_cfg = CUSTOM_VOICES.get(voice)
    if custom_cfg:
        lang = custom_cfg["lang"]
        speed = custom_cfg["speed"]

    word_count = len(text.split())
    est_seconds = word_count / 2.5
    print(f"Generating summary: ~{word_count} words, ~{est_seconds:.0f}s of audio", file=sys.stderr)
    print(f"Voice: {voice} ({voice_key}), speed: {speed}", file=sys.stderr)

    from kokoro import KPipeline
    import soundfile as sf
    import numpy as np
    import torch

    pipeline = KPipeline(lang_code=lang)

    if custom_cfg and os.path.exists(custom_cfg.get("voice_pt", "")):
        voice_tensor = torch.load(custom_cfg["voice_pt"], weights_only=True)
        generator = pipeline(text, voice=voice_tensor, speed=speed)
    else:
        generator = pipeline(text, voice=voice, speed=speed)

    audio_parts = []
    segment_count = 0
    t0 = time.time()
    for gs, ps, audio in generator:
        audio_parts.append(audio)
        segment_count += 1
        if segment_count % 10 == 0:
            elapsed = time.time() - t0
            print(f"  {segment_count} segments synthesized ({elapsed:.1f}s elapsed)", file=sys.stderr)

    if not audio_parts:
        print("No audio generated", file=sys.stderr)
        sys.exit(1)

    full_audio = np.concatenate(audio_parts)
    duration = len(full_audio) / 24000
    elapsed = time.time() - t0
    print(f"Synthesis complete: {segment_count} segments, {duration:.1f}s audio in {elapsed:.1f}s", file=sys.stderr)

    session_id = os.environ.get("CLAUDE_CODE_SSE_PORT", str(os.getpid()))
    wav_path = os.path.join(tempfile.gettempdir(), f"dispatch-summary-{session_id}.wav")
    sf.write(wav_path, full_audio, 24000)

    TTS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_key = re.sub(r"[^a-z0-9-]", "", voice_key)
    output_filename = f"summary-{safe_key}-{timestamp}.mp3"
    output_path = TTS_OUTPUT_DIR / output_filename

    if not wav_to_mp3(wav_path, str(output_path)):
        print(f"Failed to convert WAV to MP3", file=sys.stderr)
        try:
            os.remove(wav_path)
        except OSError:
            pass
        sys.exit(1)

    try:
        os.remove(wav_path)
    except OSError:
        pass

    print(f"Summary MP3: {output_path}", file=sys.stderr)
    print(f"Duration: {duration:.1f}s ({duration/60:.1f} min)", file=sys.stderr)
    print(str(output_path))


if __name__ == "__main__":
    main()
