# Research: Detecting Claude Code Question Prompts for Steam Deck Glyph UI

**Job:** Steam Deck Chrome kiosk feature pack, task #1
**Authored by:** Quorum
**Date:** 2026-05-11
**OQE Version:** 2.0

## Objective

Determine the most reliable way for the MultiDeck dashboard to know WHEN
a persona's Claude Code session is asking a question (via the AskUserQuestion
tool), and WHAT the question options are, so the web terminal can render a
gamepad-glyph modal in place of Claude's native CLI prompt.

This is the load-bearing claim for the entire glyph-button feature. If
detection is unreliable, the modal feature is unreliable.

## Qualitative

Confidence STRONG. Investigation surfaced direct contradictory claims on the
public record (multiple GitHub issues say "no hook fires"), but consensus
across the official documentation reconciles the contradiction: the issues
are about a different hook event (`Elicitation`, which is MCP-only). The
generic `PreToolUse` hook fires for AskUserQuestion as it does for any other
tool. Quorum-graded consensus across 4 sources: 4/4 agree once Elicitation
vs PreToolUse is disambiguated.

## Evidence

Three candidate approaches were evaluated.

### Approach 1: Pattern-match ANSI output in the PTY stream

The web terminal sees Claude's terminal output as bytes. We sniff for a
distinctive ANSI/text pattern that signals an AskUserQuestion render and
parse the options from the text.

- **Pros:** Zero hooks, no setup. Works against any `claude` invocation.
- **Cons:** Brittle. Claude Code UI updates break the parser. GitHub issue
  [#27353](https://github.com/anthropics/claude-code/issues/27353) shows
  AskUserQuestion currently renders as **raw JSON in the terminal** with a
  "Hide input" toggle. Parser would need to handle JSON-in-PTY plus future
  redesigns.
- **Grade:** LIMITED. Possible but actively obsoleted by Approach 2.

### Approach 2: PreToolUse hook with AskUserQuestion matcher

Claude Code's hook system fires `PreToolUse` for every tool call including
AskUserQuestion. A blocking hook can:

1. Read the questions array from stdin (the hook input is JSON with
   `tool_name`, `tool_input`, `session_id`).
2. Write a sidecar file to a known location the dashboard watches.
3. Block until the dashboard writes back an `answers` object.
4. Return `permissionDecision: "allow"` with `updatedInput.answers`
   populated. Claude reads the answer and **never displays its native UI**.

- **Pros:**
  - Official, supported, documented at
    [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks).
  - Hook can fully substitute the UI: if it returns answers, Claude skips
    the native prompt.
  - Sidecar file is the cleanest possible dashboard ↔ session boundary,
    matches the existing MultiDeck pattern (state/ JSON files).
  - Zero patching of Claude Code itself.
- **Cons:**
  - Hook blocks the Claude session. If the dashboard is down or the user
    walks away, the session hangs. Needs a timeout fallback (60s default)
    that returns `permissionDecision: "deny"` with an "operator unavailable"
    message so Claude can adapt.
  - First time a question fires, hook must be installed in `~/.claude/
    settings.json` or via the install-steamdeck.sh setup. We control the
    install path, so this is solvable.
- **Grade:** STRONG. This is the recommended path.

### Approach 3: Wrap claude in an Agent SDK launcher

Run a Python launcher that uses the Claude Agent SDK's `canUseTool`
callback. When `toolName == "AskUserQuestion"`, route to our modal.

- **Pros:** Full programmatic control, cleanest separation, no PTY parsing.
- **Cons:** Requires running through the SDK instead of the `claude` CLI.
  That's a fundamental shift in how MultiDeck spawns personas — currently
  every persona is a vanilla `claude` invocation in a tmux pane or Windows
  Terminal tab. Switching to SDK wrappers is a much larger refactor than
  this feature warrants.
- **Grade:** MODERATE. Works, but the cost vs Approach 2 is unfavorable.

## Recommended architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Persona terminal (claude CLI inside distrobox)                 │
│                                                                  │
│  Claude calls AskUserQuestion tool                              │
│            ↓                                                     │
│  PreToolUse hook fires (matcher = "AskUserQuestion")            │
│            ↓                                                     │
│  hooks/dashboard-question-bridge.py                             │
│   1. Reads stdin: {session_id, tool_input.questions}            │
│   2. Writes state/pending-questions/<session_id>.json           │
│   3. Polls for state/pending-questions/<session_id>.answer.json │
│   4. On answer: prints permissionDecision=allow + answers       │
│            ↓                                                     │
│  Claude receives the answers, no native UI rendered             │
└─────────────────────────────────────────────────────────────────┘
                       │
                       │ filesystem
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard server.cjs                                            │
│                                                                  │
│  SSE endpoint /events/questions:                                │
│    chokidar.watch(state/pending-questions/*.json)               │
│    → emits {sessionId, questions} on add                        │
│    → emits {sessionId, type: "resolved"} on unlink              │
│                                                                  │
│  POST /questions/:sessionId/answer:                             │
│    body = {answers}                                             │
│    writes state/pending-questions/<sid>.answer.json             │
└─────────────────────────────────────────────────────────────────┘
                       │
                       │ websocket / SSE
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Chrome kiosk on Deck)                                  │
│                                                                  │
│  launcher-question-modal.js subscribes to /events/questions     │
│  Renders modal with up to 4 options                             │
│  Glyph mapping: A=opt0, B=opt1, X=opt2, Y=opt3                  │
│  Gamepad + touch + click all work                               │
│  On selection: POST /questions/:sid/answer                      │
└─────────────────────────────────────────────────────────────────┘
```

## Hook output contract

The hook prints JSON to stdout per the Claude Code hook spec:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "questions": [...the original questions array...],
      "answers": {
        "How should I format the output?": "Summary"
      }
    }
  }
}
```

## Timeout / failure modes

| Failure | Behavior |
|---|---|
| Dashboard not running | Hook detects no `state/pending-questions/` directory exists → exits with empty output → Claude shows native UI as fallback |
| User walks away | 60s timeout → hook returns `permissionDecision: "deny"` with message "Operator not available, please proceed with best judgment" |
| Hook crashes | Claude treats as non-blocking, shows native UI |
| State dir on different filesystem | Use absolute paths from `$DISPATCH_STATE_DIR` env var |

## Sources

- [Claude Code Hooks reference](https://code.claude.com/docs/en/hooks)
- [Agent SDK: Handle approvals and user input](https://code.claude.com/docs/en/agent-sdk/user-input)
- [Issue #27353 — AskUserQuestion renders raw JSON](https://github.com/anthropics/claude-code/issues/27353)
- [Issue #44326 — Elicitation hook does not fire for AskUserQuestion](https://github.com/anthropics/claude-code/issues/44326) (resolved by clarifying Elicitation is MCP-only)
- [Issue #12605 — feature request for dedicated AskUserQuestion hook](https://github.com/anthropics/claude-code/issues/12605) (request for a more specific hook; PreToolUse already works)

## Quorum consensus summary

| Claim | Sources agreeing | Sources disagreeing | Grade |
|---|---|---|---|
| AskUserQuestion is a tool call subject to standard tool hooks | 2 (official docs, SDK docs) | 0 | STRONG |
| PreToolUse hook can read tool_input.questions | 1 (official docs) + inferred from generic spec | 0 | STRONG |
| PreToolUse hook can return updatedInput.answers and suppress native UI | 1 (official docs explicit example) | 0 | STRONG |
| Elicitation hook fires for AskUserQuestion | 0 | 2 (issue #44326, docs distinguish Elicitation as MCP-only) | STRONG (it does not) |
| Pattern-matching the PTY is necessary | 0 | 4 (all favor Approach 2) | STRONG (it is not) |

## Decision

Use Approach 2 (PreToolUse hook + sidecar). Task #7 (question modal) is
re-scoped: it no longer needs PTY parsing, it consumes a clean structured
event stream from the dashboard.

## Follow-on work surfaced

- New task: ship `hooks/dashboard-question-bridge.py` and wire it into the
  install-steamdeck.sh provisioning so `~/.claude/settings.json` gets the
  PreToolUse matcher on first install.
- New task: dashboard SSE endpoint `/events/questions` and POST
  `/questions/:sessionId/answer` route.
- These split off from task #7 cleanly. Adding them to the queue.
