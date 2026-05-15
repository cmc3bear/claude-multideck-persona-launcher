"""voice_scrub — semantic text preprocessor for Kokoro TTS.

Converts agent output into voice-ready prose before synthesis:
  1. Strip fenced + inline code blocks
  2. Strip markdown headers (## Section → Section)
  3. Flatten bullet/numbered lists to comma-joined prose
  4. Flatten tables to "col, col" rows
  5. Strip blockquote markers (> text → text)
  6. Resolve markdown links ([text](url) → text)
  7. Decode HTML entities (&amp; → and, &gt; → greater than, etc.)
  8. Convert ISO dates (2026-04-15 → April 15th, 2026)
  9. Strip URLs (replaced with "the link")
 10. Shorten file paths to last two components
 11. Strip emoji
 12. Casual tone: contractions + formal→casual vocabulary
 13. Character scrub (dashes, brackets, pipes, etc.)
 14. Collapse whitespace
 15. Truncate to max_words (default 150; pass None for no limit)

Shared by kokoro-speak.py, kokoro-generate-mp3.py, kokoro-summary.py.
"""
import re

_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

_ORDINALS = {
    1: '1st', 2: '2nd', 3: '3rd',
    **{i: f'{i}th' for i in range(4, 32)},
}


def _strip_code_blocks(text):
    text = re.sub(r'```[^\n]*\n.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'`[^`\n]+`', '', text)
    return text


def _strip_headers(text):
    return re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)


def _flatten_tables(text):
    # Separator rows (|---|---|) → drop
    text = re.sub(r'^\|[\s\-:|]+\|[\s\-:|]*$', '', text, flags=re.MULTILINE)
    # Data rows: | col1 | col2 | → "col1, col2"
    def _row(m):
        cells = [c.strip() for c in m.group().split('|') if c.strip()]
        return ', '.join(cells) if cells else ''
    text = re.sub(r'^\|.+\|$', _row, text, flags=re.MULTILINE)
    return text


def _strip_blockquotes(text):
    return re.sub(r'^>\s?', '', text, flags=re.MULTILINE)


def _resolve_links(text):
    # [text](url) → text
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
    # [text][ref] → text
    text = re.sub(r'\[([^\]]*)\]\[[^\]]*\]', r'\1', text)
    return text


def _decode_html_entities(text):
    text = text.replace('&amp;',  'and')
    text = text.replace('&lt;',   'less than')
    text = text.replace('&gt;',   'greater than')
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;',  "'")
    text = text.replace('&apos;', "'")
    return text


def _flatten_lists(text):
    def _join(items):
        if len(items) == 1:
            return items[0]
        if len(items) == 2:
            return f'{items[0]} and {items[1]}'
        return ', '.join(items[:-1]) + f', and {items[-1]}'

    def _replace_bullets(m):
        items = re.findall(r'^[\-\*\+]\s+(.+)$', m.group(), re.MULTILINE)
        return _join(items) if items else m.group()

    def _replace_numbered(m):
        items = re.findall(r'^\d+\.\s+(.+)$', m.group(), re.MULTILINE)
        return _join(items) if items else m.group()

    text = re.sub(r'(?:^[\-\*\+]\s+.+$\n?)+', _replace_bullets, text, flags=re.MULTILINE)
    text = re.sub(r'(?:^\d+\.\s+.+$\n?)+', _replace_numbered, text, flags=re.MULTILINE)
    return text


def _convert_dates(text):
    def _fmt(m):
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f'{_MONTHS[mo - 1]} {_ORDINALS.get(d, str(d))}, {y}'
        return m.group()
    return re.sub(r'\b(\d{4})-(\d{2})-(\d{2})\b', _fmt, text)


def _strip_urls(text):
    return re.sub(r'https?://\S+', 'the link', text)


def _shorten_paths(text):
    def _shorten(m):
        parts = [p for p in m.group().split('/') if p]
        if len(parts) <= 2:
            return ' '.join(parts)
        return ' '.join(parts[-2:])
    return re.sub(r'/(?:[a-zA-Z0-9_.][a-zA-Z0-9_.\-]*/)+[a-zA-Z0-9_.\-]+', _shorten, text)


def _strip_emoji(text):
    return re.sub(
        r'[\U0001F300-\U0001F9FF☀-⛿✀-➿⌀-⏿'
        r'⬀-⯿■-◿ -⁯]+',
        '', text,
    )


_CONTRACTIONS = [
    (r'\bI have\b', "I've"),
    (r'\bI am\b', "I'm"),
    (r'\bI will\b', "I'll"),
    (r'\bI would\b', "I'd"),
    (r'\bwe are\b', "we're"),
    (r'\bwe have\b', "we've"),
    (r'\bwe will\b', "we'll"),
    (r'\bit is\b', "it's"),
    (r'\bthat is\b', "that's"),
    (r'\bthere is\b', "there's"),
    (r'\bthey are\b', "they're"),
    (r'\bthey have\b', "they've"),
    (r'\bdo not\b', "don't"),
    (r'\bdoes not\b', "doesn't"),
    (r'\bdid not\b', "didn't"),
    (r'\bcannot\b', "can't"),
    (r'\bwill not\b', "won't"),
    (r'\bwould not\b', "wouldn't"),
    (r'\bcould not\b', "couldn't"),
    (r'\bshould not\b', "shouldn't"),
    (r'\bis not\b', "isn't"),
    (r'\bare not\b', "aren't"),
    (r'\bwas not\b', "wasn't"),
    (r'\bwere not\b', "weren't"),
    (r'\bhave not\b', "haven't"),
    (r'\bhas not\b', "hasn't"),
    (r'\bhad not\b', "hadn't"),
]

_FORMAL_TO_CASUAL = [
    (r'\bin addition\b',          'also'),
    (r'\bfurthermore\b',          'plus'),
    (r'\bhowever\b',              'but'),
    (r'\bsubsequently\b',         'then'),
    (r'\bconsequently\b',         'so'),
    (r'\bapproximately\b',        'about'),
    (r'\bcommenced\b',            'started'),
    (r'\bcommences?\b',           'start'),
    (r'\bcommencing\b',           'starting'),
    (r'\bterminated\b',           'stopped'),
    (r'\bterminates?\b',          'stop'),
    (r'\bterminating\b',          'stopping'),
    (r'\butilized\b',             'used'),
    (r'\butilizes?\b',            'use'),
    (r'\butilizing\b',            'using'),
    (r'\bdemonstrated\b',         'showed'),
    (r'\bdemonstrates?\b',        'show'),
    (r'\bdemonstrating\b',        'showing'),
    (r'\bobtained\b',             'got'),
    (r'\bobtains?\b',             'get'),
    (r'\bobtaining\b',            'getting'),
    (r'\bassisted\b',             'helped'),
    (r'\bassists?\b',             'help'),
    (r'\bassisting\b',            'helping'),
    (r'\bprior to\b',             'before'),
    (r'\bin order to\b',          'to'),
    (r'\bat this point in time\b','now'),
    (r'\bat the present time\b',  'right now'),
]


def _cap_rep(replacement):
    def _fn(m):
        return replacement[0].upper() + replacement[1:] if m.group()[0].isupper() else replacement
    return _fn


def _casual_tone(text):
    for pattern, replacement in _CONTRACTIONS:
        text = re.sub(pattern, _cap_rep(replacement), text, flags=re.IGNORECASE)
    for pattern, replacement in _FORMAL_TO_CASUAL:
        text = re.sub(pattern, _cap_rep(replacement), text, flags=re.IGNORECASE)
    return text


def _char_scrub(text):
    text = text.replace('—', ', ').replace('–', ', ').replace('―', ', ')
    text = text.replace('—', ', ').replace('–', ', ')
    text = text.replace('~', ' ').replace('`', '')
    text = text.replace('|', ', ')
    text = text.replace('[', '').replace(']', '')
    text = text.replace('{', '').replace('}', '')
    text = text.replace('<', '').replace('>', '')
    text = text.replace('*', '').replace('#', '')
    text = text.replace('/', ' ').replace('\\', ' ')
    text = text.replace('_', ' ').replace('-', ' ')
    return text


def scrub(text: str, max_words: int = 150) -> str:
    """Full semantic + character scrub for TTS. Returns voice-ready text.

    max_words: truncate at this word count (None = no limit, for long-form summaries).
    """
    text = _strip_code_blocks(text)
    text = _strip_headers(text)
    text = _flatten_tables(text)
    text = _strip_blockquotes(text)
    text = _resolve_links(text)
    text = _decode_html_entities(text)
    text = _flatten_lists(text)
    text = _convert_dates(text)
    text = _strip_urls(text)
    text = _shorten_paths(text)
    text = _strip_emoji(text)
    text = _casual_tone(text)
    text = _char_scrub(text)
    text = re.sub(r'\s+', ' ', text).strip()

    if max_words is not None:
        words = text.split()
        if len(words) > max_words:
            text = ' '.join(words[:max_words]) + "... that's the gist of it."

    return text
