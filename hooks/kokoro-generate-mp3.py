"""Kokoro TTS — generate an MP3 file (no playback). Used by Dispatch to produce audio attachments.

Usage: python kokoro-generate-mp3.py <text_file> <voice_key> <output_mp3_path>

Reads text from <text_file> (UTF-8). Looks up <voice_key> in VOICE_MAP or CUSTOM_VOICES.
Prepends the persona callsign to the text so the voice introduces itself.
Generates audio via Kokoro, applies post-processing for custom voices, writes to <output_mp3_path> as MP3.

Prints the output path on success, nonzero exit on error.

MultiDeck framework: sanitized for public distribution. See set-voice.py for how to add custom voices.
"""
import sys
import os
import tempfile
import subprocess
import re

# Mirror of the voice registry — keep in sync with set-voice.py VOICE_MAP
VOICE_MAP = {
    "dispatch":   {"voice": "af_sky",    "lang": "a", "speed": 0.95, "callsign": "Dispatch"},
    "architect":  {"voice": "bm_daniel", "lang": "b", "speed": 1.05, "callsign": "Architect"},
    "engineer":   {"voice": "am_eric",   "lang": "a", "speed": 1.05, "callsign": "Engineer"},
    "reviewer":   {"voice": "bm_lewis",  "lang": "b", "speed": 1.05, "callsign": "Reviewer"},
    "researcher": {"voice": "bf_emma",   "lang": "b", "speed": 1.05, "callsign": "Researcher"},
    "default":    {"voice": "am_puck",   "lang": "a", "speed": 1.05, "callsign": ""},
}

# Mirror of custom voice configs from kokoro-speak.py
# Add custom voice tensors here if needed
CUSTOM_VOICES = {}


def scrub_text(text: str) -> str:
    """Strip TTS-hostile characters before synthesis."""
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
    text = text.replace("/", " ")
    text = text.replace("\\", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def apply_post_processing(wav_path, custom_cfg, session_id):
    """Apply ffmpeg post-processing chain (dry + reverb mix). Returns the final path."""
    tmp = tempfile.gettempdir()
    suffix = f"-{session_id}" if session_id else ""
    dry_path = os.path.join(tmp, f"dispatch-mp3-dry{suffix}.wav")
    reverb_path = os.path.join(tmp, f"dispatch-mp3-reverb{suffix}.wav")
    final_path = os.path.join(tmp, f"dispatch-mp3-final{suffix}.wav")

    CREATE_NO_WINDOW = 0x08000000
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-af", custom_cfg["ffmpeg_dry"], dry_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
        )
        subprocess.run(
            ["ffmpeg", "-y", "-i", dry_path, "-af", custom_cfg["ffmpeg_reverb"], reverb_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
        )
        mix_weight = custom_cfg.get("reverb_mix", 0.2)
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", dry_path, "-i", reverb_path,
                "-filter_complex",
                f"[0:a][1:a]amix=inputs=2:weights=1 {mix_weight}:duration=longest,alimiter=limit=0.95",
                final_path,
            ],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
        )
    except Exception:
        return wav_path
    finally:
        for p in [dry_path, reverb_path]:
            try:
                os.remove(p)
            except OSError:
                pass

    if os.path.exists(final_path):
        try:
            os.remove(wav_path)
        except OSError:
            pass
        return final_path
    return wav_path


def wav_to_mp3(wav_path: str, mp3_path: str) -> bool:
    """Convert a WAV file to MP3 via ffmpeg. Returns True on success."""
    CREATE_NO_WINDOW = 0x08000000
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
            check=True,
        )
        return os.path.exists(mp3_path)
    except Exception:
        return False


def main():
    if len(sys.argv) < 4:
        print("Usage: kokoro-generate-mp3.py <text_file> <voice_key> <output_mp3_path>", file=sys.stderr)
        sys.exit(1)

    text_file = sys.argv[1]
    voice_key = sys.argv[2].lower()
    output_mp3 = sys.argv[3]

    if not os.path.exists(text_file):
        print(f"Text file not found: {text_file}", file=sys.stderr)
        sys.exit(1)

    with open(text_file, "r", encoding="utf-8") as f:
        text = f.read()

    text = scrub_text(text)
    if not text.strip():
        print("Text is empty after scrubbing", file=sys.stderr)
        sys.exit(1)

    # Resolve voice config
    config = VOICE_MAP.get(voice_key, VOICE_MAP["default"])
    voice = config["voice"]
    lang = config["lang"]
    speed = config["speed"]
    callsign = config.get("callsign", "")

    # Prepend callsign so the voice introduces itself
    if callsign:
        text = f"{callsign}. {text}"

    custom_cfg = CUSTOM_VOICES.get(voice)
    if custom_cfg:
        lang = custom_cfg["lang"]
        speed = custom_cfg["speed"]

    # Import Kokoro lazily — it's heavy
    from kokoro import KPipeline
    import soundfile as sf
    import numpy as np
    import torch

    pipeline = KPipeline(lang_code=lang)

    if custom_cfg and os.path.exists(custom_cfg["voice_pt"]):
        voice_tensor = torch.load(custom_cfg["voice_pt"], weights_only=True)
        generator = pipeline(text, voice=voice_tensor, speed=speed)
    else:
        generator = pipeline(text, voice=voice, speed=speed)

    audio_parts = []
    for gs, ps, audio in generator:
        audio_parts.append(audio)

    if not audio_parts:
        print("No audio generated", file=sys.stderr)
        sys.exit(1)

    full_audio = np.concatenate(audio_parts)

    # Write WAV to temp
    session_id = os.environ.get("CLAUDE_CODE_SSE_PORT", str(os.getpid()))
    wav_path = os.path.join(tempfile.gettempdir(), f"dispatch-mp3-output-{session_id}.wav")
    sf.write(wav_path, full_audio, 24000)

    # Apply post-processing for custom voices
    if custom_cfg:
        wav_path = apply_post_processing(wav_path, custom_cfg, session_id)

    # Ensure output directory exists
    output_dir = os.path.dirname(output_mp3)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    # Convert WAV to MP3
    if not wav_to_mp3(wav_path, output_mp3):
        print(f"Failed to convert WAV to MP3: {output_mp3}", file=sys.stderr)
        try:
            os.remove(wav_path)
        except OSError:
            pass
        sys.exit(1)

    # Cleanup temp WAV
    try:
        os.remove(wav_path)
    except OSError:
        pass

    print(output_mp3)


if __name__ == "__main__":
    main()
