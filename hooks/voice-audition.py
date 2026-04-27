"""Generate voice samples for all English Kokoro voices

Usage: python voice-audition.py [output_dir]

Generates a sample WAV file for each available Kokoro voice. Useful for comparing voices
before selecting persona mappings in VOICE_MAP (set-voice.py).

Output files are stored in output_dir (default: ./voice-samples/).
"""
import os, subprocess, sys
from kokoro import KPipeline
import soundfile as sf
import numpy as np

output_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voice-samples')
os.makedirs(output_dir, exist_ok=True)

text = """Well, here's the thing. I've been thinking about this for a while now,
and honestly? It's kind of hilarious when you step back and look at it.
We spend so much time worrying about the small stuff, when the big picture
is staring us right in the face. But hey, that's just how it goes, isn't it?"""

voices = [
    ('am_adam', 'American Male'),
    ('am_michael', 'American Male'),
    ('am_fenrir', 'American Male'),
    ('am_onyx', 'American Male'),
    ('am_puck', 'American Male'),
    ('am_eric', 'American Male'),
    ('bm_george', 'British Male'),
    ('bm_fable', 'British Male'),
    ('bm_daniel', 'British Male'),
    ('bm_lewis', 'British Male'),
    ('af_nicole', 'American Female'),
    ('af_sky', 'American Female'),
    ('af_heart', 'American Female'),
    ('af_nova', 'American Female'),
    ('bf_emma', 'British Female'),
    ('bf_lily', 'British Female'),
    ('bf_alice', 'British Female'),
    ('bf_isabella', 'British Female'),
]

pipeline_a = KPipeline(lang_code='a')
pipeline_b = KPipeline(lang_code='b')

for voice_id, desc in voices:
    print(f"Generating: {voice_id} ({desc})...")
    pipeline = pipeline_b if voice_id.startswith('b') else pipeline_a

    try:
        generator = pipeline(text, voice=voice_id, speed=1.0)
        audio_parts = []
        for gs, ps, audio in generator:
            audio_parts.append(audio)

        if audio_parts:
            full_audio = np.concatenate(audio_parts)
            wav_path = os.path.join(output_dir, f'{voice_id}.wav')
            sf.write(wav_path, full_audio, 24000)
            print(f"  Saved: {wav_path}")
        else:
            print(f"  No audio generated")
    except Exception as e:
        print(f"  Error: {e}")

print(f"\nAll samples saved to: {output_dir}")
print("Ready to play or compare!")
