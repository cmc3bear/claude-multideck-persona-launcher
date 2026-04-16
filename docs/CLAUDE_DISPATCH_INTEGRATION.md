# Claude Dispatch Integration

**Claude Dispatch Integration** is a three-part system that makes agent coordination possible without constant screen-watching.

1. **Kokoro voice queueing** — Agents announce completion via TTS
2. **Persona callsign announcements** — You always know who's talking
3. **Auto-play audio feed dashboard** — Leave a browser tab open, listen passively

Together, they turn agent orchestration into an **ambient** experience—you can coordinate work while doing other things.

---

## Part 1: Kokoro Voice Queueing

### The Problem

When multiple Claude Code tabs are running in parallel, they all want to produce voice output. Without coordination:
- Voices step on each other
- Multiple Kokoro processes fight for the audio device
- Audio files get corrupted
- Users can't tell which agent is talking

### The Solution: Filesystem-Based Mutex

MultiDeck uses **atomic filesystem operations** for TTS queueing.

**How it works:**

1. Agent completes a job and wants to announce: "Engineer reporting: module refactored"
2. Agent calls `announce-completion.py`, which queues the message in `tts-queue.json`
3. A background daemon (`voice-queueing-daemon.py`) watches this queue
4. When the queue is empty, daemon:
   - Locks with `mkdir .kokoro-speak-lock/job-{UUID}/` (atomic on POSIX systems)
   - Generates TTS audio via Kokoro
   - Plays audio through OS audio device
   - Removes lock
   - Moves to next queued message
5. Other agents see the lock, add themselves to queue, wait their turn

**Result:** Voices play sequentially, clearly, without interference.

### Configuration

Voice queueing is configured in `state/tts-config.json`:

```json
{
  "voice_daemon": {
    "enabled": true,
    "queue_file": "state/tts-queue.json",
    "lock_dir": ".kokoro-speak-lock/",
    "max_queue_size": 100,
    "timeout_seconds": 300
  }
}
```

### Per-Session Voice Isolation

Voice configuration is **per-session**, stored in `voice-config-${CLAUDE_CODE_SSE_PORT}.json`.

When you start a new Claude Code tab, it gets a unique Server-Sent Events port. The voice daemon reads the port from the environment and uses the corresponding voice config file.

**Result:** Three Claude Code tabs can run simultaneously with three different voices without conflict.

---

## Part 2: Persona Callsign Announcements

### The Pattern

Every spoken message from an agent opens with the agent's **callsign**:

```
"Architect calling. Quickstart guide complete and approved."
```

Not:

```
"Quickstart guide complete and approved."
```

### Why This Matters

When listening to the audio feed (see Part 3), voice-only mode can be ambiguous. Callsign announcements make it unambiguous:

- "Dispatch calling" — something is being routed
- "Engineer reporting" — code work is done
- "Reviewer flagging" — quality gate feedback
- "Researcher noting" — investigation update

### Implementation

In the persona file (`personas/ARCHITECT_AGENT.md`), the voice output rules specify:

```
Voice Output: Always open with callsign before message.

Example: "Architect calling. [message here]"
Example: "Architect reporting. [update]"
```

Supported prefixes:
- "Architect calling" — Dispatch-style routing/announcement
- "Engineer reporting" — Completion/status update
- "Reviewer flagging" — Quality gate feedback
- "Researcher noting" — Finding or update

Custom agents can define their own prefix style (see `templates/AGENT_TEMPLATE.md`).

---

## Part 3: Auto-Play Audio Feed Dashboard

### What It Is

A dashboard route (`/audio-feed`) that:
1. Connects to the TTS queue via Server-Sent Events
2. Streams agent announcements to the browser in real-time
3. Auto-plays audio without user interaction

### How to Use

```bash
# Start dashboard
node dashboard/server.cjs

# Open in browser (leave open in background)
http://localhost:3045/audio-feed
```

The page:
- Connects to `GET /api/tts-stream` (Server-Sent Events endpoint)
- Receives audio filenames as agents complete jobs
- Auto-plays each audio file sequentially
- Shows transcript in sidebar

### Operator Mode

With `/audio-feed` open, you're in **operator mode**. You can:
- Work on other tasks while listening
- Know instantly when an agent completes work (by callsign)
- Spot issues (agent got stuck, too many FLAGGED jobs, etc.)
- Jump to the dashboard to triage if needed

No constant screen-watching. Just ambient awareness.

### The Transcript

The audio feed keeps a scrolling transcript:

```
[14:32] Dispatch calling: Job JOB-0047 assigned to Architect
[14:34] Architect calling: Persona system documented and reviewed
[14:35] Reviewer flagging: Missing examples in voice rules doc
[14:36] Architect calling: Examples added, resubmitting JOB-0047
[14:37] Reviewer calling: Job approved and closed
[14:37] Dispatch calling: Moving to next priority job
```

### Technical Details

**Server-Sent Events (SSE):**
The `/api/tts-stream` endpoint sends events:

```
event: tts-generated
data: {"agent":"architect","job_id":"JOB-0047","audio_file":"tts-output/architect-calling-20260415-143402.mp3","transcript":"Architect calling: Persona system documented and reviewed"}
```

The browser client:
- Listens for events
- Downloads audio file
- Creates `<audio>` element
- Auto-plays with `autoplay` attribute
- Updates transcript display

**Fallback:** If SSE is not supported, the page degrades to polling `/api/tts-queue` every 5 seconds.

---

## Integrating TTS with Your Jobs

### Announcing Job Completion

In your agent's submission code:

```python
import json
from pathlib import Path

def complete_job(job_id, results):
    # ... do work, generate results ...
    
    # Announce completion
    announce_message = f"Architect calling: {job_id} complete. {results['summary']}"
    
    # Queue for TTS
    queue_file = Path("state/tts-queue.json")
    queue = json.loads(queue_file.read_text())
    queue["messages"].append({
        "agent": "architect",
        "job_id": job_id,
        "message": announce_message,
        "timestamp": datetime.now().isoformat()
    })
    queue_file.write_text(json.dumps(queue, indent=2))
```

The voice daemon picks it up and plays it.

### Listening for Completions

If you're monitoring the job board programmatically:

```python
import requests

# Poll audio feed
resp = requests.get("http://localhost:3045/api/tts-queue")
queue = resp.json()

for msg in queue["recent_messages"]:
    print(f"[{msg['agent']}] {msg['message']}")
```

Or use SSE in your own client:

```javascript
const eventSource = new EventSource("http://localhost:3045/api/tts-stream");
eventSource.addEventListener("tts-generated", (event) => {
  const data = JSON.parse(event.data);
  console.log(`${data.agent}: ${data.transcript}`);
  // Auto-play audio...
});
```

---

## Voice Daemon Architecture

### Startup

1. Dashboard server starts and initializes voice daemon
2. Daemon reads `state/tts-config.json` for queue location
3. Daemon creates watch on `state/tts-queue.json`
4. Daemon initializes Kokoro (loads models, checks audio device)
5. Daemon enters main loop

### Main Loop

```
while True:
  if (tts-queue has messages):
    try:
      lock = acquire_lock(".kokoro-speak-lock/{uuid}")
      msg = dequeue()
      audio_file = generate_tts(msg["message"], voice=msg["voice"])
      play_audio(audio_file)
      append_transcript(msg)
      release_lock(lock)
    except:
      mark_message_failed(msg)
      release_lock(lock)
  else:
    wait(100ms)  // Sleep to reduce CPU
```

### Concurrency Handling

If two agents try to queue messages simultaneously:

1. Agent A: `append to tts-queue.json`, then release lock
2. Agent B: `append to tts-queue.json`, then release lock
3. Daemon: Detects new messages, processes sequentially

No race conditions because:
- File locking on queue updates (Python `fcntl`)
- Atomic filesystem ops for the mutex lock
- Timestamp ordering for messages

---

## Configuration Reference

### voice-config-{PORT}.json

Per-session voice configuration:

```json
{
  "dispatch": {
    "voice_key": "af_sky",
    "speed": 0.95,
    "pitch": 1.0
  },
  "architect": {
    "voice_key": "af_sky",
    "speed": 1.0,
    "pitch": 1.0
  },
  "engineer": {
    "voice_key": "am_eric",
    "speed": 1.0,
    "pitch": 0.95
  }
}
```

Updated at runtime by `hooks/set-voice.py`.

### tts-config.json

Global TTS daemon configuration:

```json
{
  "voice_daemon": {
    "enabled": true,
    "queue_file": "state/tts-queue.json",
    "lock_dir": ".kokoro-speak-lock/",
    "max_queue_size": 100,
    "max_message_length": 500,
    "timeout_seconds": 300
  },
  "kokoro": {
    "model": "kokoro-v0.19.ftz",
    "device": "cpu",
    "output_dir": "tts-output/"
  }
}
```

---

## Troubleshooting

**No audio:**
- Verify audio device is detected: `python -m sounddevice` (should show devices)
- Check daemon logs: Look for errors in `state/voice-daemon.log`
- Verify Kokoro models are downloaded: Check `~/.kokoro/models/`

**Audio stepping on itself:**
- Daemon may have crashed. Restart: `pkill voice-queueing-daemon.py && node dashboard/server.cjs`
- Check lock directory: `ls -la .kokoro-speak-lock/` (should be empty if daemon is running)

**Browser not getting audio:**
- Verify SSE endpoint: `curl http://localhost:3045/api/tts-stream` (should show event stream)
- Check browser console for CORS errors (dashboard should allow same-origin)
- Verify audio files exist: `ls -la tts-output/*.mp3`

---

## Further Reading

- `docs/VOICE_RULES.md` — TTS-safe writing for all agents
- `docs/KOKORO_SETUP.md` — Kokoro installation and voice audition
- `docs/JOB_BOARD.md` — Job completion lifecycle and announcements
