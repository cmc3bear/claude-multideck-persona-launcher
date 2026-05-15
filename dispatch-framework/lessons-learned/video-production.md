# Lessons Learned — Video Production

Accumulated from Commercial-Producer production sessions. Read before every production. Append after every run.

---

## Audio mix

- **Music sits at least 12 dB below VO peak** — verify at mix time with ffprobe or ffmpeg loudnorm filter; never eyeball it
- **VO peaks -6 to -3 dB** — never 0 (clipping), never below -9 (too quiet against music)
- **Lead-in silence 200-500 ms** — head of every VO take; allows editor to place precisely without clipping
- **No spliced music mid-cut** — play from beginning, fade out on tail; never cut in at a mid-phrase point

## Visual

- **No blank frames** — every frame must have content even during VO transitions; use still frames, zoom holds, or fade-through-black with minimum 1 frame of content at edges
- **No keyboard SFX overuse** — sparse, intentional; two key-taps per word maximum

## Narration / TTS

- **No em dashes in narration** — TTS reads them weirdly; use commas or semicolons for pauses
- **No URLs read aloud** — visual CTAs only
- **Spell out numbers for TTS** — "sixty seconds" not "60s"

## ffmpeg on Windows from WSL

- **fontfile path colon conflicts with filter option separator**: Windows drive-letter path `F:/...` has a colon that ffmpeg's filter parser treats as an option separator. Do NOT try to escape with `F\:/` inside Python subprocess args — the escaping is unreliable.
  - **Fix**: copy the font file to the working directory, then use just the filename `fontfile=PressStart2P-Regular.ttf`. WSL Python's subprocess CWD maps to the equivalent Windows drive path, so Windows ffmpeg finds the font by relative path.

- **drawbox uses `iw` for frame width, not `w`**: In drawbox expressions, `w` refers to the `w` parameter itself (circular reference). Use `iw` and `ih` for the input frame dimensions.
  - Example: `w='max(0, iw - min(iw, 520 + max(0, (t-1.2)*144)))'`

## OQE job board compliance (Reviewer gate pre-checks)

- **§N citation required in EVERY criterion**: The `criteria_cite_section` check (`§\s*\d+` regex) must pass for every criterion in the list, not just some. Before submitting any job, scan all criteria for `§N` — add `per OQE_DISCIPLINE.md §11` if the criterion lacks one.
  - File path references (`RECREATE_PLAN.md`, `RETROSPECTIVE.md`) are NOT sufficient — a `§N` anchor is required.

- **evidence_log is mandatory for every criterion**: The `evidence_criterion_match` check requires an `evidence_log` array in the job record, with one entry per criterion, each carrying `criterion_index` (1-based int) and `strength` (STRONG/MODERATE/LIMITED). No exceptions.
  - Write the evidence_log at the same time you write the criteria — don't wait until submit time.

- **output_path must be WSL format**: The reviewer's `artifact_exists` check runs in WSL, so `output_path` must use `/mnt/f/...` not `F:/...`. Windows paths in output_path will fail the artifact check even if the file exists.

## Suno music licensing

- **All tracks in the library are Suno-generated** (`artist: elfinadigitalbrainsuit`, `comment: made with suno`). Check ID3 tags via ffprobe before assuming external clearance.
- **Commercial use requires paid Suno subscription at generation time**: Free plan tracks are non-commercial only. Paid (Pro/Premier) grants royalty-free commercial license to the creator.
- **Attribution not required on paid plan** — no need to credit Suno or `elfinadigitalbrainsuit` in distribution credits.
- **AI-generated music lacks US copyright protection** — Suno grants a license, but the creator cannot claim copyright. For public distribution, document this in LICENSE.md alongside the file.

## Audio mix — limiter ceiling vs MP3 inter-sample peaks

- **`alimiter=limit=X` is a sample-level limit, not a true-peak limit.** When you encode to MP3 the inter-sample peaks recover and the measured master peak ends up 1-2 dB above the limiter setting. To hit a -3 dBFS ceiling reliably, set `alimiter=limit=0.63` (-4 dBFS) and follow it with `volume=-2dB`. The MP3 will measure ~-4 to -3.5 dB at decode.
- **Apply the limiter once on the VO mix and once on the final premaster.** A single limiter at the end is not enough when amix is summing VO + music without normalization.

## Audio mix — measuring slices

- **`ffmpeg volumedetect` with `-ss/-t` on an MP3 input reports file-level aggregate, not the slice.** Two different `-ss` windows return identical max_volume values because the filter chain receives the full decoded stream regardless of the seek. To measure a true slice, export it first: `ffmpeg -ss X -t Y -i input.mp3 -c:a pcm_s16le slice.wav` and run volumedetect on the WAV. Critical for verifying "music-only" sections separately from "VO + music" sections.

## Job board on Windows — encoding traps

- **`job-board.py` opens the board JSON with the default codec (cp1252 on Windows).** When patching the board file directly from another Python script, always write with `json.dump(..., ensure_ascii=True)` (the default). Writing with `ensure_ascii=False` for readable unicode breaks the next `load_job_board()` call with a `'charmap' codec can't decode` error.
- **`reviewer-review.py artifact_exists` check uses `Path(artifact_path).exists()` in whatever Python it runs under.** On Windows reviewer runs, use `F:/...` absolute form in `output_path`. Under a WSL reviewer, use `/mnt/f/...`. The existing "WSL format" lesson above is conditional on the reviewer execution environment.

## Job board citation regex

- **`CITATION_RX` in job-board.py is `§\d+|[A-Za-z_-]+\.(md|ts|tsx|js|cjs|mjs|py|json|ps1|bat)(#|\b)`.** The file-path branch excludes digits in the basename: `script-draft-01.md` fails to match because `01` is in `[A-Za-z_-]+`. Use either `§N` notation, or a basename without digits (e.g. `script-draft.md`), or anchor on a different file like `OQE_DISCIPLINE.md §4`. Multiple drafts in a single date directory should sit in a `drafts/` subdir rather than rely on `script-draft-NN.md` filenames in citations.

## VO generation — callsign and scrub

- **`hooks/kokoro-generate-mp3.py` prepends the persona callsign to every line.** For commercial content this corrupts the opening of every take. Write a project-specific batch generator at `commercials/<date>/generate-vo.py` that imports `KPipeline` directly and renders each line without callsign. The persona doc explicitly endorses this pattern.
- **`voice_scrub.scrub()` strips hyphens.** `"Co-op"` synthesizes as `"Co op"` (two words back-to-back). Audibly intelligible, but if the hyphen-joined word matters (brand names, hyphenated terms of art), test before committing. Workarounds: spell the compound (`"cooperative"`), or use a comma (`"Co, op"`) — the latter inserts a tiny pause but preserves the visual word.

## Kokoro venv path on Windows

- **System Python interpreters do NOT have Kokoro installed.** The framework's Kokoro venv on Windows lives at `C:/Users/<user>/.claude/hooks/kokoro-venv/Scripts/python.exe`. Documented in `docs/WSL_SETUP.md`. Any batch VO script must invoke that interpreter explicitly, not `python`.

## Concat manifest staleness

- **Update concat-full-cut.txt immediately when a placeholder beat is replaced.** If the manifest still references `beatN-ph.mp4` after the real beat is produced, the rough-cut rebuild picks up the placeholder. The concat manifest is the build's source-of-truth — keep it in sync with the produced assets in the same session.

## ffprobe path format in WSL

- **Windows ffprobe.exe requires Windows-style paths.** When invoking the .exe from WSL (e.g., the Gyan ffmpeg WinGet install at `AppData/Local/Microsoft/WinGet/.../bin/ffprobe.exe`), pass input paths as `F:\\path\\to\\file.mp4` (backslash-escaped Windows path), not `/mnt/f/...`. Using WSL paths causes exit code 1 with no useful error.

## OQE job worktype for commercial production

- **No `COMM` worktype in the job board.** Use `FEAT` for commercial production jobs. The valid worktype list is: API, AUDIT, DATA, DOCS, FEAT, FIX, GOV, INFRA, MCP, OQE, PERSONA, PIPE, RESEARCH, REV, TPL, UI. Extend `VALID_WORKTYPES` in `scripts/job-board.py` if a domain-specific type is needed.

---

*Last updated: 2026-05-15 — Commercial-Producer, sessions WS-FEAT-0022 / WS-FEAT-0024*
