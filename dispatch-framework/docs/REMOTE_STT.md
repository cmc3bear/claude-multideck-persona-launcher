# Remote STT (forward dictation to a beefier machine)

Use case: you're running MultiDeck on a Steam Deck or low-power laptop and you also have a desktop with a strong GPU on the same Tailscale network. Whisper transcription quality scales with model size; the deck can only run `base.en` (~150 MB) usefully, but a 4090 can run `large-v3` (~3 GB) instantly.

This doc covers two things:

1. **Forwarding STT from MultiDeck to a remote `whisper-server`** on another machine
2. **Biasing transcription** toward your vocabulary via `dictionary.txt`

---

## How the forward works

```
Steam Deck (or laptop)              PC with GPU
─────────────────────               ───────────
launcher mic button                 whisper-server
       │                              ▲
       ▼                              │
dashboard:                            │
  POST /stt/transcribe   ───────→    POST /inference
       │                                │
       ▼                                │
ffmpeg → 16kHz mono WAV        large-v3 inference
                                        │
       ←──── transcribed text  ─────────┘
```

The deck's dashboard server still owns the request. It transcodes the audio (ffmpeg), then forwards the WAV to `DISPATCH_WHISPER_REMOTE`. No client-side change to the launcher; the mic button works identically.

---

## Setup

### 1. On the GPU machine: run `whisper-server`

**Windows + NVIDIA GPU (recommended):**

1. Download a prebuilt `whisper.cpp` Windows release with CUDA support: https://github.com/ggerganov/whisper.cpp/releases — pick `whisper-cublas-12.x.x-bin-x64.zip` (or 11.x for older CUDA)
2. Unzip somewhere stable, e.g. `C:\whisper.cpp\`
3. Download the model from https://huggingface.co/ggerganov/whisper.cpp/tree/main:
   - `ggml-large-v3.bin` (~3 GB) for best quality
   - Or `ggml-large-v3-turbo.bin` (~1.5 GB) for speed-optimized
4. Drop the model file in the same folder
5. Bind to all interfaces so MultiDeck can reach you over Tailscale:
   ```
   .\whisper-server.exe -m ggml-large-v3.bin --host 0.0.0.0 --port 8780
   ```
6. Windows Firewall will prompt once. Allow on **private networks**. (Public networks not necessary; Tailscale is treated as private.)

**Linux + NVIDIA GPU:**

Build whisper.cpp from source with CUDA:

```bash
git clone https://github.com/ggerganov/whisper.cpp ~/whisper.cpp
cd ~/whisper.cpp
WHISPER_CUDA=1 make -j whisper-server
bash ./models/download-ggml-model.sh large-v3
./whisper-server -m models/ggml-large-v3.bin --host 0.0.0.0 --port 8780
```

### 2. Find the GPU machine's address

Tailscale MagicDNS gives every device a stable hostname. From the deck, find your GPU machine:

```bash
tailscale status
```

Look for the hostname (e.g. `desktop-rtx4090`). The full MagicDNS name will be `desktop-rtx4090.tail-xxxxx.ts.net` (your tailnet name).

Or just use the Tailscale IP shown in `tailscale status` (Tailscale assigns from the `100.x.y.z` CGNAT range). MagicDNS is preferred because it survives device reinstalls.

### 3. On MultiDeck: set the env var

Edit `~/.config/multideck/env` and add:

```
export DISPATCH_WHISPER_REMOTE=http://desktop-rtx4090.tail-xxxxx.ts.net:8780
```

Restart the dashboard server. Verify:

```bash
curl http://localhost:3046/stt/status
```

You should see `"mode": "remote"` and your `remoteUrl`. Press the mic button in the launcher; transcription should return in well under a second.

---

## Dictionary biasing

`whisper-server` (and `whisper-cli`) accepts a `prompt` parameter on each request that biases decoding toward terms in the prompt. MultiDeck reads `~/.config/multideck/dictionary.txt` and injects it on every STT call.

### Setup

Copy the template into your config dir:

```bash
mkdir -p ~/.config/multideck
cp templates/dictionary.txt ~/.config/multideck/dictionary.txt
$EDITOR ~/.config/multideck/dictionary.txt
```

Format: one term or phrase per line. Lines starting with `#` are comments. Blank lines ignored.

Example for a defense contractor:

```
CDRL
COR
COTR
DFARS
FAR Part 12
NDAA
DD-250
performance work statement
contract data requirements list
```

Example for a dev team:

```
multideck
distrobox
whisper.cpp
xterm.js
Tailscale
Flatpak
Steamworks
TypeScript
```

### How it works

The dictionary is comma-joined into a single string and passed to whisper as the `prompt`. Whisper treats it as preceding context, so it learns "these words exist in this domain" and prefers them when audio is ambiguous.

**Soft bias, not hard:** whisper will still transcribe words not in the dictionary. The dictionary just nudges spelling/recognition of terms that have been mishearing-prone (acronyms especially).

**Token budget:** whisper's prompt is capped at ~224 tokens, roughly 150 words. List your highest-value terms first; the rest gets truncated.

**Verifying it's loaded:**

```bash
curl http://localhost:3046/stt/status | jq
```

Look for:
- `"dictionaryLoaded": true`
- `"dictionaryTerms": <count>`

If `false`, check the file path printed at `dictionaryPath` and file permissions.

---

## Performance comparison

Measured on a 1.5 s test clip:

| Setup | Cold | Warm | Quality on technical vocab |
|---|---|---|---|
| Steam Deck base.en (local) | 16.5 s | 1.07 s | Frequent misheards on acronyms |
| Steam Deck base.en + dictionary | 16.5 s | 1.07 s | Acronyms recognized correctly |
| Remote large-v3 over Tailscale (4090) | ~150 ms | ~120 ms | Production-grade |
| Remote large-v3 + dictionary | ~150 ms | ~120 ms | Production-grade + domain-aware |

The Tailscale tunnel adds 5-15 ms of latency over a wired or 5 GHz wireless link. Negligible compared to the 7-15x speedup from running on the GPU.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/stt/status` shows `"mode": "local-warm"` instead of `"remote"` | `DISPATCH_WHISPER_REMOTE` is not set in your env. Source `~/.config/multideck/env` and restart the dashboard. |
| Mic press → 504 or timeout | GPU machine isn't running `whisper-server`, or Tailscale isn't connected. `tailscale ping <hostname>` and `curl http://<hostname>:8780/` from the deck. |
| Mic press → returns text but acronyms still misheard | Dictionary not loaded. `curl /stt/status` and check `dictionaryLoaded`. |
| `whisper-server.exe` won't start on Windows | Most often CUDA mismatch. Check `nvidia-smi` for your CUDA version, download the matching cublas zip. |
| Transcription works but is slow even on GPU | Make sure you got the **cublas** release, not the CPU-only one. CPU large-v3 is ~30x slower. |
| Firewall blocks the port | Allow port 8780 on the GPU machine's private/Tailscale network. On Windows: `New-NetFirewallRule -DisplayName "whisper-server" -Direction Inbound -LocalPort 8780 -Protocol TCP -Action Allow -Profile Private` (run in admin PowerShell). |

---

## Fallback behavior

If `DISPATCH_WHISPER_REMOTE` is set but the remote is unreachable, the request to `/stt/transcribe` will fail with an error. There's no automatic fallback to local whisper-cli because that would silently swap models mid-session and confuse the user.

To re-enable local fallback temporarily: unset `DISPATCH_WHISPER_REMOTE` and restart the dashboard.

To force a specific mode without editing env: set `DISPATCH_WHISPER_REMOTE=` (empty) and the local path applies.
