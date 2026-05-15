# Lessons Learned — Regression Troubleshooting via Last-Known-Good Bisect

Accumulated from MultiDeck debugging sessions. Read before chasing any "it used to work" regression. Append after every run.

---

## Anchor the investigation on a version the user names

- **Make the user name a last-known-good version before you do anything else.** "Last I recall it worked was 0.7.2" eliminates 80% of the search space immediately. Without an anchor, you'll waste cycles inspecting unrelated code paths and proposing speculative fixes.
- **Translate the version label into a git ref before diffing.** `git tag --list | grep 0.7.2` confirms `v0.7.2` exists. If the user names a date or a feature, find the closest tag or commit and state which one you're using as the baseline — they may correct you.
- **Confirm the regression is real at HEAD before bisecting.** Probe the live system (curl the endpoint, hit the running server) to verify the bug exists where you think it does. Sometimes the bug is in the operator's mental model and HEAD is fine.

## Enumerate commits that touched the regression path

- **`git log <good-ref>..HEAD -- <specific files>` — never browse the full log.** For the MultiDeck browser-deploy regression, the path was `dashboard/launcher.html dashboard/scripts/launcher-select.js dashboard/scripts/launcher-chrome.js dashboard/scripts/launcher-terminal.js dashboard/server.cjs`. Only 2 commits touched those files in 14 days — enumeration shrank the haystack to two needles.
- **File paths may have moved between the good ref and HEAD.** If the project did a structural migration (`chore: migrate framework to dispatch-framework/`), `git log <ref>..HEAD -- old/path` returns nothing useful. Run `git ls-tree -r <good-ref> --name-only | grep <basename>` to find where files lived at the old ref, then diff across the rename explicitly: `git diff v0.7.2:old/path HEAD:new/path`.
- **Migration commits are dangerous because they bundle moves with content changes.** `git show --stat <migration-commit>` reveals when `+25 lines launcher.html` rides along with a path rename. Always inspect the diff content, not just the rename arrows.

## Diff with grade-able evidence, not narrative speculation

- **Build an evidence table, one row per finding.** Columns: file/region, what changed, evidence grade (STRONG / MODERATE / LIMITED), causal impact. STRONG = direct observation of the broken behavior caused by this change. MODERATE = code clearly differs but causation is inferred. LIMITED = single-source or unverified suspicion.
- **Test empirical claims in the actual runtime.** Do not trust comments about command behavior. The MultiDeck WS handler comment said "util-linux script requires the output file as the LAST positional arg" — I almost called that the regression, but running `wsl bash -lc "script -q /dev/null -c 'echo OK'"` and the v0.7.2 form both returned exit 0. The comment was outdated; the regression was elsewhere.
- **Watch for DELETED code, not just added/modified.** In the WS handler diff, the smoking gun looked like `+1 -1` line changes, but the real damage was a `-22 line` block that read xterm dimensions from URL query params. Net stats lie — read the deletion side of diffs as carefully as the addition side.

## Ask for the specific symptom when hypotheses fan out

- **A vague symptom forces speculation.** "Browser deploy doesn't work" can mean five different failure modes (WT tab opens instead, WS never connects, terminal panel blank, claude exits immediately, claude wraps badly). Each implies a different fix.
- **Offer the user a multi-choice symptom picker, not an open-ended question.** Four concrete options ("still launches a WT tab" / "stays on CONNECTING" / "terminal blank" / "wraps badly") gave the user a one-click way to converge. They picked "still launches a WT tab" and within one message added "it's team mode that does it" — the second sentence eliminated the entire single-launch hypothesis space.
- **Lazy users will not copy-paste DevTools output unprompted.** If you need wire-level data and asking won't yield it, instrument the SERVER side instead. One `console.log` line at the entry of `/launcher/launch` plus a restart got ground truth on the actual `body.transport` value without operator effort.

## Verify the running process matches the on-disk code

- **Node caches required modules at load time.** Editing `server.cjs` does NOT change behavior of a running node process — the file is in RAM. Always restart the dashboard after server.cjs edits, even if the change is one line.
- **Inspect the running process's logged paths before trusting it.** `tail server.log` revealed the PID 31616 dashboard was logging `Personas registry: F:\03-INFRASTRUCTURE\dispatch-framework\personas\personas.json` — missing `multideck/`. The server was running with `DISPATCH_ROOT` set to a pre-migration stale path. Self-test (`curl /launcher/launch -d transport=browser`) confirmed handler-level behavior was current code, but the runtime state directory was wrong.
- **`Get-CimInstance Win32_Process` is the Windows equivalent of `ps -ef`.** Use `Where-Object CommandLine -like '*server.cjs*'` to find the right node process when several are running (npx wrappers, MCP servers, etc).

## Bust the browser cache after any static-asset change

- **The dashboard sends `Cache-Control: public, max-age=86400` on static assets.** A normal reload returns the cached JS/CSS. The user reporting "still broken after my fix" often means "still on cached old code."
- **Bump `?v=YYYY-MM-DD-NN` on every `<script>` and `<link>` after a JS/CSS/HTML change.** The query string breaks the cache key without changing the file's real path. Increment the trailing two digits per same-day change.
- **Hard reload (Ctrl+Shift+F5) bypasses the cache for THAT load only.** If you want the fix to land for an operator who reflexively does normal reloads, the version bump is mandatory — a hard-reload note in chat is not enough.

## Look for asymmetric code paths near the bug

- **When two similar endpoints exist, regressions live in the gap between them.** `/launcher/launch` had a `transport === 'browser'` branch at `server.cjs:833`. `/launcher/launch-team` at `server.cjs:872` did NOT have that branch — it fell straight through to `spawnPersona()`, which only knows wt/tmux. The team handler is a sibling of single launch but had not been updated when browser transport was added.
- **Search for the feature name across all handlers.** `grep -n "browser" server.cjs` shows which functions know about the feature and which don't. Any handler in the same family that lacks the branch is a regression candidate.
- **When you patch one side, scan for the sibling.** After fixing single-launch, the immediate next question should be "what other endpoints accept this same parameter and do they handle it the same way?"

## OQE writeup form for "prove your work" requests

- **Respond with Objective / Qualitative / Evidence-table, not prose.** Objective: one sentence + baseline. Qualitative: confidence (HIGH/MODERATE/LOW) + one-sentence reason. Evidence: a table with file/region, change, grade, impact.
- **Close with what the writeup did NOT cover.** Audit honesty is half the value of OQE. List the things you didn't verify; offer to verify them next if needed.
- **End with an AskUserQuestion that pins the next decision.** Don't trail off with "let me know how you want to proceed" — give 3-4 concrete options the user can click.

---

*Last updated: 2026-05-14 — Launcher-Engineer, regression hunt for team-mode + BROWSER transport on MultiDeck v0.7.4+.*
