# Kokoro Setup: Installation, Voices, and Audition

Kokoro is the text-to-speech engine powering MultiDeck voice announcements. This guide covers installation, voice selection, and voice audition.

---

## Installation

### Prerequisites

- Python 3.9+
- FFmpeg (for audio encoding)
- 2GB free disk space (for voice models)

### Step 1: Install Kokoro

```bash
# Create virtual environment
python3 -m venv kokoro-venv
source kokoro-venv/bin/activate  # or `kokoro-venv\Scripts\activate` on Windows

# Install Kokoro and dependencies
pip install kokoro soundfile torch numpy

# Verify installation
python -c "import kokoro; print('Kokoro installed successfully')"
```

### Step 2: Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) or:
```powershell
choco install ffmpeg
```

Verify:
```bash
ffmpeg -version
```

### Step 3: Download Voice Models

Kokoro downloads voice models on first use. Models are stored in `~/.kokoro/models/`.

First run will download ~500MB of model weights. This happens automatically.

Verify:
```bash
python -c "from kokoro import KokoroTTS; tts = KokoroTTS(); print('Models ready')"
```

---

## Voice Catalog

Kokoro includes 10+ voices. Each voice is identified by a **voice key**.

### Voice Key Naming

Format: `[gender]_[name]`

- Gender: `a` (generic), `m` (male), `f` (female)
- Name: `sky`, `eric`, `emma`, `lewis`, `fable`, `daniel`, `adam`, `michael`, `puck`, `heart`, `george`

### Full Voice List

| Voice Key | Gender | Style | Use Case |
|-----------|--------|-------|----------|
| `af_sky` | Generic | Clear, neutral, warm | Dispatch, coordination, general |
| `am_eric` | Male | Energetic, friendly, approachable | Engineering, positive updates |
| `bf_emma` | Female | Authoritative, measured, professional | Research, serious topics |
| `bm_lewis` | Male | Stern, deliberate, controlled | Quality gates, strict feedback |
| `af_heart` | Generic | Gentle, compassionate | Support, mentoring |
| `am_puck` | Male | Playful, casual | Relaxed teams, informal updates |
| `am_adam` | Male | Warm, balanced | General use, everyone |
| `am_michael` | Male | Deep, serious | Formal announcements |
| `bm_fable` | Male | Narrative, storytelling | Complex explanations |
| `bm_daniel` | Male | Young, energetic | Innovation, startup vibes |
| `bm_george` | Male | Classical, refined | Formal docs, official |

---

## Voice Audition

Before assigning a voice to an agent, listen to it.

### Quick Audition

```bash
python scripts/test-voice.py \
  --voice "af_sky" \
  --message "This is a test of the af_sky voice"
```

Audio file is saved to `tts-output/test-{voice}-{timestamp}.mp3` and auto-plays.

### Full Audition Script

For comparing multiple voices:

```bash
# Create audition directory
mkdir voice-auditions

# Generate test audio for each voice
for voice in af_sky am_eric bf_emma bm_lewis af_heart am_puck am_adam am_michael bm_fable bm_daniel bm_george; do
  python scripts/test-voice.py \
    --voice "$voice" \
    --message "Hello, this is $voice. This voice is designed for professional announcements." \
    --output "voice-auditions/$voice.mp3"
done

# Listen to all voices
# Open voice-auditions/ folder and play each MP3
```

### Personality Matching

When choosing a voice for an agent, match the **role** to the **voice personality**:

| Agent Role | Suggested Voice | Reason |
|------------|-----------------|--------|
| Dispatch (coordinator) | `af_sky` | Clear, neutral, trustworthy |
| Architect (structure) | `af_sky` | Professional, clear |
| Engineer (code) | `am_eric` | Energetic, positive |
| Reviewer (quality gate) | `bm_lewis` | Stern, serious |
| Researcher (investigation) | `bf_emma` | Authoritative, credible |
| Support (help) | `af_heart` | Gentle, compassionate |
| Innovation (new ideas) | `bm_daniel` | Youthful, energetic |

---

## Voice Speed and Pitch Tuning

Voices can be adjusted for speed and pitch:

```json
{
  "dispatch": {
    "voice_key": "af_sky",
    "speed": 0.95,      // 0.5 (slow) to 2.0 (fast)
    "pitch": 1.0        // 0.5 (lower) to 2.0 (higher)
  }
}
```

Set in `voice-config-${CLAUDE_CODE_SSE_PORT}.json`.

**Typical settings:**
- **Speed 0.9–1.0** — Clear, professional
- **Speed 1.1–1.3** — Energetic, upbeat
- **Speed 0.8** — Slow, emphatic
- **Pitch 1.0** — Natural
- **Pitch 0.85–0.95** — Deeper, more serious
- **Pitch 1.1–1.2** — Higher, more energetic

---

## Troubleshooting

### No Audio Output

1. **Check speakers:**
```bash
python -c "import sounddevice; print(sounddevice.default_device)"
```

Should show your audio device. If not, select one:

```json
{
  "kokoro": {
    "device": 0  // or device number from list
  }
}
```

2. **Check permissions:**
On Linux, user may need to be in `audio` group:
```bash
sudo usermod -a -G audio $USER
```

3. **Test audio directly:**
```bash
# Generate test audio
python -c "from kokoro import KokoroTTS; tts = KokoroTTS(voice='af_sky'); tts.save('test.wav', 'Hello world')"

# Play with ffmpeg
ffplay test.wav
```

### Model Download Issues

If models fail to download:

1. **Check disk space:**
```bash
df -h ~/.kokoro/models/
```

Need at least 500MB free.

2. **Manual download:**
```bash
# Models are hosted at huggingface.co
# If auto-download fails, manually download and place in ~/.kokoro/models/
```

3. **Offline mode:**
If no internet, copy models from another machine:
```bash
cp -r ~/.kokoro/models/* /path/to/other/machine/.kokoro/models/
```

### Voice Sounds Robotic

- Slow down: `"speed": 0.85`
- Add slight pitch variation: `"pitch": 0.98`
- Use voice with more character (e.g., `am_eric` instead of `af_sky`)

### Voice Barely Audible

- Increase system volume
- Check audio device is not muted
- Increase TTS output volume: Ensure `sounddevice` output level is high

---

## Per-Session Voice Isolation

MultiDeck isolates voices per Claude Code session using the Server-Sent Events port as a key.

**How it works:**

1. Claude Code session starts on port 3051 (example)
2. Voice config is written to `voice-config-3051.json`
3. Voice daemon reads the correct config for that session's voice
4. Multiple sessions can run simultaneously with different voices

**Set voice for a session:**

```bash
python hooks/set-voice.py architect af_sky
```

This:
- Reads `${CLAUDE_CODE_SSE_PORT}` from environment
- Writes to `voice-config-${PORT}.json`
- Does NOT affect other sessions

**Benefits:**
- Dispatch can speak in one voice while Engineer speaks in another
- No voice config collisions
- Easy to test different voice combinations

---

## Advanced: Custom Voice Blending

(Future feature)

Kokoro allows blending multiple voices to create custom personalities.

```python
from kokoro import KokoroTTS, blend_voices

tts = KokoroTTS()
custom_voice = blend_voices(
    voices=["af_sky", "af_heart"],
    weights=[0.7, 0.3]  # 70% sky, 30% heart
)
audio = tts.synthesize("Custom voice test", voice=custom_voice)
```

Custom voice blends are saved to `voice-models/custom/`.

---

## Voice Rules Reminder

When writing text for TTS output, follow `docs/VOICE_RULES.md`:

- No em dashes (use commas)
- No tildes or backticks
- Numbers spelled out
- No URLs read aloud
- Commas for pauses

Example:
```
Bad: "Module refactored — performance improved 40%."
Good: "Module refactored, performance improved 40 percent."
```

---

## Further Reading

- `docs/VOICE_RULES.md` — Writing for TTS
- `docs/CLAUDE_DISPATCH_INTEGRATION.md` — How voices are queued and played
- `docs/PERSONA_SYSTEM.md` — Voice assignment to agents
