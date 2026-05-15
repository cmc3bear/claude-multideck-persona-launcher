# Correction Tracking

A workspace-wide pipeline that watches every Claude Code session for mistake-acknowledgement language, logs each occurrence to a registry, and asks the originating persona "what have you actually changed?" on an hourly cron.

The pipeline is **trigger-driven by the agent's own acknowledgement**, not by the operator's reaction. The reasoning: a user pushback does not always mean the agent made a mistake, and an unprompted realization by the agent also counts. The acknowledgement is the truth signal.

## Components

| Component | Path | Role |
|---|---|---|
| Detector hook | `~/.claude/hooks/correction-detector.py` | Claude Code `Stop` hook. Regex-scans the assistant's just-completed response for HIGH and MEDIUM confidence acknowledgement phrases. On hit, appends to the registry. |
| Registry | `F:\corrections\corrections.jsonl` | Append-only JSONL of every detected acknowledgement. Each entry carries `id`, `ts`, `session_id`, `persona`, `cwd`, `ack_phrase`, `confidence`, `excerpt`, `status`, `review_flag`, `fix_attempts[]`. |
| Internal Affairs persona | `personas/INTERNAL_AFFAIRS_AGENT.md` | Adjudicator. Walks the operator through pending entries to validate, categorize, and assign severity. Read-only on code; write-only on the registry. |
| Interview agent | `scripts/interview-agent.py` | Hourly cron. For each entry that Internal Affairs has validated, asks the originating persona "what have you changed since" and appends to `fix_attempts[]`. Auto-closes on STRONG evidence. |
| Cron installer | `scripts/correction-cron-install.ps1` | Registers `interview-agent.py` as a Windows Scheduled Task. |

## Lifecycle of a correction

```
agent acknowledges mistake in response
        │
        ▼  Stop hook fires
[ detector logs entry — review_flag=pending_human_review, status=open ]
        │
        ▼  operator runs /audit (or summons Internal Affairs in MultiDeck)
[ Internal Affairs validates trigger, categorizes, assigns severity ]
        │ review_flag flips to human_validated (or human_rejected → closed)
        ▼  hourly cron picks up validated open entries
[ interview-agent.py asks the persona for evidence the fix landed ]
        │ appends fix_attempts[] entry with status: resolved | in-progress | no-action
        ▼  if resolved + evidence
[ status flips to resolved, resolved_at set ]
        │
        ▼  Internal Affairs runs pattern detection over a 7-day window
[ patterns.jsonl flags recurring categories or unresolved-after-fix events ]
```

## Detection confidence tiers

| Tier | Examples | Action |
|---|---|---|
| HIGH | "I made an error", "my mistake", "I was wrong", "let me fix that", "good catch", "I missed that" | Auto-log, queue for validation |
| MEDIUM | "you're right", "I see now", "sorry that", "apologies" | Auto-log with `confidence: medium` — Internal Affairs validates or drops as false-positive |

Patterns live in `~/.claude/hooks/correction-detector.py` under `HIGH_CONFIDENCE_PATTERNS` and `MEDIUM_CONFIDENCE_PATTERNS`. Adjust them as you observe false positives or missed acknowledgements.

## Setup

### 1. Install the global Stop hook

The detector lives at `~/.claude/hooks/correction-detector.py`. It must be registered as a `Stop` hook in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "<python> <hook path>/correction-detector.py" },
          { "type": "command", "command": "<python> <hook path>/speak-kokoro.py" }
        ]
      }
    ]
  }
}
```

The detector fires before the kokoro speak hook so it sees the full response text without TTS post-processing.

### 2. Install the hourly cron (Windows)

```powershell
# Claude Code as interviewer (default — burns tokens but can use grep/read tools to verify fixes)
.\scripts\correction-cron-install.ps1

# Local Ollama as interviewer (free — weaker self-reports, no tool verification)
.\scripts\correction-cron-install.ps1 -Backend local

# Different cadence
.\scripts\correction-cron-install.ps1 -IntervalMinutes 30

# Remove
.\scripts\correction-cron-install.ps1 -Uninstall
```

The installer creates a Scheduled Task named `MultiDeck-InternalAffairs-Hourly` plus a wrapper `.cmd` that sets `INTERVIEWER_BACKEND` and `CORRECTIONS_REGISTRY` environment variables. Logs land at `F:\corrections\interview-agent.log`.

### 3. Summon Internal Affairs

When `corrections.jsonl` has pending entries, spawn the Internal Affairs persona from the MultiDeck launcher. Or invoke directly:

```
claude --model claude-opus-4-7
```

then paste the contents of `personas/INTERNAL_AFFAIRS_AGENT.md` as the initial system prompt. The persona reads the registry, walks pending entries with you, and updates the file in place.

## Configuration reference

| Env var | Default | Effect |
|---|---|---|
| `CORRECTIONS_REGISTRY` | `F:\corrections\corrections.jsonl` | Where the detector writes and the interviewer reads. |
| `INTERVIEWER_BACKEND` | `claude-code` | `claude-code` or `local`. Local uses Ollama. |
| `INTERVIEWER_LOCAL_MODEL` | `qwen3:32b` | Ollama tag when backend is `local`. |
| `INTERVIEWER_MIN_AGE_MIN` | `30` | Skip entries younger than N minutes — gives the persona time to actually fix things between log and interview. |
| `INTERVIEWER_MAX_PER_RUN` | `10` | Cap interviews per hourly run to bound cost. |

## Concurrency caveat

The cron's rewrite of `corrections.jsonl` is atomic via temp-file rename, and `MultipleInstances IgnoreNew` in the Task Scheduler config prevents two cron invocations overlapping. **However, if you run `interview-agent.py` manually OR edit the registry through the Internal Affairs persona while the cron is mid-run, the cron's later write will overwrite your changes.** Check `F:\corrections\interview-agent.log`'s most recent line before manual operations — if a run started within the last 2 minutes, wait.

## When NOT to use this

- **Pair-programming sessions** where you're testing the agent's reasoning out loud. The agent will say "let me reconsider" frequently and the regex will treat it as a correction. Either disable the hook temporarily by renaming `correction-detector.py`, or accept the noise and let Internal Affairs reject false positives.
- **Sessions with a persona that performs roleplay** (Dungeon-Master, NPC, Frasier). An in-character "I was wrong about that, traveler" will be logged. Add a persona exclude list to the detector if this becomes noisy.

## Privacy

The registry contains transcripts of every flagged response. Treat `F:\corrections\corrections.jsonl` as session-private. Do not commit it to git. The `.gitignore` for any MultiDeck-touching repo should include `corrections/` and `F:/corrections/*`.

## Roadmap (V2 candidates)

- Dashboard tile on `/jobs` showing open corrections, last-interview age, by-persona breakdown
- `SessionStart` hook nudge: when a new Claude Code session opens, surface pending count
- `/audit` global slash command at `~/.claude/commands/audit.md` that auto-loads the Internal Affairs persona
- Persona exclude list (DM, NPC, Frasier) configurable in `~/.claude/hooks/correction-detector.json`
