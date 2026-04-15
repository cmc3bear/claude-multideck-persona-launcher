# Voice Rules: TTS-Safe Writing Conventions

When agents speak via Kokoro, certain text patterns don't play well with text-to-speech. This guide covers what to avoid and how to write for voice.

---

## Cardinal Rules

1. **No em dashes** — Use commas or periods instead
2. **No tildes or backticks** — Remove them entirely
3. **No brackets or pipes** — Rephrase without them
4. **No URLs read aloud** — Say "the documentation" or "the guide" instead
5. **No code blocks in voice** — Describe logic instead of quoting syntax

---

## Specific Patterns

### Em Dashes (—)

**Bad:**
```
"Module refactored — performance improved by 40%."
```

**Good:**
```
"Module refactored. Performance improved by 40%."
```

Or use commas:
```
"Module refactored, improving performance by 40%."
```

### Tildes (~)

**Bad:**
```
"Home directory is ~/projects/myapp"
```

**Good:**
```
"Home directory is home slash projects slash myapp"
Or: "Home directory is your projects folder, myapp"
```

### Backticks and Code Highlighting

**Bad:**
```
"The `authenticate()` function was updated"
```

**Good:**
```
"The authenticate function was updated"
```

### Brackets and Parentheses

**Bad:**
```
"Job JOB-0047 [architect] approved"
```

**Good:**
```
"Job JOB-0047 for Architect was approved"
```

### Pipes and Special Characters

**Bad:**
```
"Status: PASS | Priority: P1 | Agent: Architect"
```

**Good:**
```
"Status is PASS. Priority is P1. Assigned to Architect."
```

### URLs and File Paths

**Bad:**
```
"See https://github.com/multideck/framework for details"
```

**Good:**
```
"See the MultiDeck framework documentation for details"
Or: "Check the GitHub repository for details"
```

### Numbers and Numerals

**Bad (ambiguous):**
```
"4 jobs completed"
```

**Good:**
```
"Four jobs completed"
Or: "The total is 4" (if you must use numerals, say "four")
```

For large numbers, spell out or use "approximately":
```
"Approximately 1200 lines of code"
Not: "1200 lines of code" (confusing to read: "one two zero zero" vs "twelve hundred")
```

### Commas for Pauses

Instead of em dashes or colons, use commas to create pauses:

**Bad:**
```
"Task complete. Summary: module refactored, tests added, docs reviewed"
```

**Good:**
```
"Task complete. Here's the summary. Module refactored, tests added, docs reviewed."
```

### Acronyms and Abbreviations

**Spell out the first time, then abbreviate:**

```
"The Object, Qualitative, Evidence framework (OQE) has three phases. 
Each OQE phase has specific responsibilities."
```

Not:
```
"The OQE framework..."  // Unclear on first mention
```

### Possessives and Contractions

**Good:**
```
"The agent's task is complete"
"The Architect's review is approved"
"It's done"
"The module's performance improved"
```

These work fine in TTS.

### Hyphens vs Spaces

**Hyphens are OK:**
```
"Cross-project coordination"
"Multi-agent system"
"Real-time updates"
```

But avoid hyphens in place of em dashes:

**Bad:**
```
"Module refactored - performance improved"  // Sounds like "minus" or unclear pause
```

**Good:**
```
"Module refactored, performance improved"
```

---

## Formatting Guidelines

### Read Aloud Test

Before finalizing any agent announcement, read it aloud:
1. Does it sound natural?
2. Are the pauses in the right places (commas)?
3. Did you stumble over any words?

If yes, rewrite.

### Typical Announcement Pattern

```
"[Agent Callsign] calling. [Action]. [Result]. [Next Step or Status]."
```

**Example:**
```
"Architect calling. Documentation reviewed. Quickstart guide updated and ready for production. Moving to next priority job."
```

### Brevity

Keep announcements **under 30 seconds** of speech (~150 words).

**Bad (too long):**
```
"This is Architect calling to inform you that I have completed the task of reviewing the API documentation. During my review, I found several inconsistencies in the endpoint descriptions and parameters, which I have corrected. Additionally, I updated the examples to reflect the latest version of the code, and I added more detailed explanations of the authentication flow. The documentation is now ready for the next review phase."
```

**Good (concise):**
```
"Architect calling. API documentation reviewed and updated. Found and fixed inconsistencies in endpoint descriptions. Ready for next review."
```

---

## Voice-Specific Gotchas

### Homophones

Be careful with words that sound alike but mean different things:

```
"to" vs "too" vs "two"       → Use numbers when possible: "The second item"
"there" vs "their" vs "they're"  → Usually OK, context helps
"one" vs "won"              → Spell out: "Number one"
"for" vs "four"             → Use digits or spell: "The fourth module"
```

### Abbreviations That Sound Weird

Some abbreviations are better spelled out:

```
"API" → OK (sounds like letters)
"repo" → OK (common pronunciation)
"nav" → OK (common pronunciation)
"gifs" → Ambiguous (is it "jifs" or "gifs"?) → Say "graphics images" or just "images"
```

### Dates

**Good:**
```
"April 15th, 2026"
"Today"
"Tomorrow"
"Next Monday"
```

**Bad:**
```
"2026-04-15"  (sounds like "twenty twenty six, zero four, one five")
"04/15/2026"  (confusing)
```

---

## Examples: Before and After

### Example 1: Code Review Announcement

**Before:**
```
"Code review for auth_module.py [PASS] — all tests passing, 95% coverage, no security issues. See PR#4247 for details."
```

**After:**
```
"Reviewer calling. Code review approved for the authentication module. All tests passing, 95% coverage, no security issues. Pull Request 4247 is ready to merge."
```

### Example 2: Research Update

**Before:**
```
"Research: Evaluated Redis vs. Memcached (~analysis in dashboard/research.json). Recommendation: Redis for [persistence requirements]. ETA: production migration by 04/30."
```

**After:**
```
"Researcher noting. Redis and Memcached evaluated. Redis recommended for its persistence capabilities. Target production migration by April 30th. Full analysis available in the dashboard."
```

### Example 3: Job Assignment

**Before:**
```
"Job JOB-0047 [P1] assigned to architect@workspace → Quickstart guide (docs refactor). ETA: 2hrs. See job-board for details."
```

**After:**
```
"Dispatch calling. Job 0047 assigned to Architect. Priority one. Write a Quickstart guide. Estimated two hours. Check the job board for full details."
```

---

## Testing Your Voice

Before deploying, test announcements:

```bash
python scripts/test-voice.py \
  --agent "architect" \
  --message "Architect calling. This is a test announcement."
```

Listen and evaluate:
- Did it sound natural?
- Were the phrasing and pauses correct?
- Did any words get mispronounced?

If anything sounds off, rephrase and test again.

---

## Tools and Checklist

### Pre-Announcement Checklist

- [ ] Read the message aloud (does it sound natural?)
- [ ] No em dashes (check for —)
- [ ] No tildes, backticks, pipes
- [ ] No URLs (described instead)
- [ ] Numbers spelled out or clear numerals
- [ ] Commas create proper pauses
- [ ] Under 150 words (30 seconds)
- [ ] Callsign prefix included
- [ ] Tested with `test-voice.py`

### Regex for Finding Problems

```regex
—                          # Em dashes
~                          # Tildes
`                          # Backticks
[([|\[\]]                   # Brackets or pipes
https?://                  # URLs
[a-z0-9]+\.[a-z]{2,}      # Domain names
```

Use these to scan your text for TTS gotchas.

---

## Special Cases

### Technical Terms

**OK to include:**
- Framework names: React, Python, JavaScript
- Tool names: Kokoro, Claude, GitHub
- Acronyms with standard pronunciation: API, HTTP, JSON

**Say differently:**
- File extensions: Don't say "dot json", say "JSON format"
- Symbols: Don't say "underscore", say "the underscore character" if you must, or rephrase
- Code keywords: Don't say "def", say "function"

### Emoji and Symbols

**Bad:**
```
"Status: ✅ PASS | Priority: 🔴 P1"
```

**Good:**
```
"Status is PASS. Priority is P1."
```

Emojis don't have standard pronunciations, so remove them from voice output.

---

## Further Reading

- `docs/OQE_DISCIPLINE.md` — How announcements fit into OQE framing
- `docs/PERSONA_SYSTEM.md` — Callsign conventions
- `docs/CLAUDE_DISPATCH_INTEGRATION.md` — How voice announcements are queued and played
