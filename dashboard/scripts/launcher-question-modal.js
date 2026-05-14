// ============ QUESTION MODAL (Steam Deck glyph picker) ============
// Subscribes to /events/questions SSE. When an AskUserQuestion event arrives,
// renders a glyph-mapped modal. The operator picks options with the gamepad
// (A/B/X/Y for direct option, dpad to highlight + A to confirm), touch, or
// mouse. Selections POST to /questions/<sessionId>/answer.
//
// Each AskUserQuestion call may carry 1-4 questions. We walk them sequentially,
// build up an `answers` object keyed by question text, then POST once at the
// end. The PreToolUse hook then unblocks Claude with our answers.
(() => {
  const modal   = document.getElementById('question-modal');
  const body    = document.getElementById('question-modal-body');
  const tag     = document.getElementById('question-modal-tag');
  const session = document.getElementById('question-modal-session');
  if (!modal || !body) return;

  // ----- glyph palette: matches face-button colors on Steam Deck -----
  const GLYPHS = [
    { letter: 'A', color: '#00FFCC' },   // teal
    { letter: 'B', color: '#FF3366' },   // red
    { letter: 'X', color: '#0080FF' },   // blue
    { letter: 'Y', color: '#FFB700' },   // yellow
  ];

  // ----- state -----
  let queue = [];           // pending {sessionId, questions} events
  let cur = null;           // current event being walked
  let qIndex = 0;           // index into cur.questions
  let answers = {};         // built up across questions
  let selected = new Set(); // for multi-select questions
  let highlight = 0;        // which option the dpad currently highlights

  function open() { modal.hidden = false; modal.classList.add('open'); }
  function close() {
    modal.classList.remove('open');
    modal.hidden = true;
    cur = null;
    qIndex = 0;
    answers = {};
    selected.clear();
    highlight = 0;
  }

  function nextFromQueue() {
    if (cur) return; // still working
    cur = queue.shift() || null;
    if (!cur) { close(); return; }
    qIndex = 0;
    answers = {};
    render();
    open();
  }

  function render() {
    if (!cur) return;
    const q = cur.questions[qIndex];
    if (!q) { submit(); return; }

    selected.clear();
    highlight = 0;

    const options = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
    const headerLabel = (q.header || 'QUESTION').toString().toUpperCase().slice(0, 12);
    tag.textContent = headerLabel;
    session.textContent = `${qIndex + 1} / ${cur.questions.length}`;

    body.innerHTML = '';

    const question = document.createElement('div');
    question.className = 'question-modal-question';
    question.textContent = q.question || '';
    body.appendChild(question);

    if (q.multiSelect) {
      const hint = document.createElement('div');
      hint.className = 'question-modal-multihint';
      hint.textContent = 'MULTI-SELECT — tap face buttons to toggle, hold A or press R1 to confirm';
      body.appendChild(hint);
    }

    const optsWrap = document.createElement('div');
    optsWrap.className = 'question-modal-options';

    options.forEach((opt, i) => {
      const row = document.createElement('button');
      row.className = 'question-modal-option';
      row.dataset.optionIndex = String(i);
      row.style.setProperty('--glyph-color', GLYPHS[i].color);
      if (i === highlight) row.classList.add('focus');

      const glyph = document.createElement('span');
      glyph.className = 'question-modal-glyph';
      glyph.textContent = GLYPHS[i].letter;
      row.appendChild(glyph);

      const main = document.createElement('div');
      main.className = 'question-modal-option-main';

      const label = document.createElement('div');
      label.className = 'question-modal-option-label';
      label.textContent = opt.label || '(no label)';
      main.appendChild(label);

      if (opt.description) {
        const desc = document.createElement('div');
        desc.className = 'question-modal-option-desc';
        desc.textContent = opt.description;
        main.appendChild(desc);
      }

      row.appendChild(main);
      row.addEventListener('click', () => pickOption(i));
      optsWrap.appendChild(row);
    });

    body.appendChild(optsWrap);
  }

  function setHighlight(i) {
    const q = cur && cur.questions[qIndex];
    if (!q) return;
    const n = Math.min(4, (q.options || []).length);
    if (n === 0) return;
    highlight = ((i % n) + n) % n;
    body.querySelectorAll('.question-modal-option').forEach((el) => {
      const idx = Number(el.dataset.optionIndex);
      el.classList.toggle('focus', idx === highlight);
      el.classList.toggle('selected', selected.has(idx));
    });
  }

  function pickOption(i) {
    const q = cur && cur.questions[qIndex];
    if (!q) return;
    const n = Math.min(4, (q.options || []).length);
    if (i < 0 || i >= n) return;

    if (q.multiSelect) {
      if (selected.has(i)) selected.delete(i); else selected.add(i);
      setHighlight(i);
      return;
    }

    answers[q.question] = q.options[i].label;
    qIndex += 1;
    if (qIndex >= cur.questions.length) submit();
    else render();
  }

  function confirmMulti() {
    const q = cur && cur.questions[qIndex];
    if (!q || !q.multiSelect) return;
    const picks = [...selected].sort((a, b) => a - b).map((i) => q.options[i].label);
    answers[q.question] = picks.length === 1 ? picks[0] : picks;
    qIndex += 1;
    if (qIndex >= cur.questions.length) submit();
    else render();
  }

  async function submit() {
    if (!cur) return;
    const sid = cur.sessionId;
    const payload = { answers };
    try {
      await fetch(`/questions/${encodeURIComponent(sid)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn('[question-modal] submit failed', e);
    }
    cur = null;
    nextFromQueue();
  }

  function cancel() {
    // Cancelling sends back an empty answers object; the hook then returns
    // permissionDecision=deny and Claude adapts. Close the modal either way.
    if (!cur) return;
    answers = {};
    submit();
  }

  // ----- gamepad routing -----
  window.addEventListener('multideck:gamepad:nav', (e) => {
    if (modal.hidden) return;
    const dir = e.detail && e.detail.dir;
    if (dir === 'up' || dir === 'left') setHighlight(highlight - 1);
    if (dir === 'down' || dir === 'right') setHighlight(highlight + 1);
  });

  window.addEventListener('multideck:gamepad:accept', () => {
    if (modal.hidden) return;
    const q = cur && cur.questions[qIndex];
    if (!q) return;
    if (q.multiSelect) confirmMulti();
    else pickOption(highlight);
  });

  window.addEventListener('multideck:gamepad:cancel', () => {
    if (modal.hidden) return;
    cancel();
  });

  // Direct face-button mapping for non-multi-select: A/B/X/Y → options 0/1/2/3.
  // For multi-select we already route A through accept (= confirm), so face
  // buttons toggle selection.
  window.addEventListener('multideck:gamepad:option', (e) => {
    if (modal.hidden) return;
    const idx = e.detail && e.detail.index;
    if (typeof idx !== 'number') return;
    const q = cur && cur.questions[qIndex];
    if (!q) return;
    if (q.multiSelect) {
      // A=0 is handled as accept (confirm) above; ignore here to avoid double-action.
      if (idx === 0) return;
      pickOption(idx);
    } else {
      pickOption(idx);
    }
  });

  // ----- voice answer (L2 trigger inside the modal) -----
  // Captures one mic burst via MultideckSTT.captureOnce, then submits the
  // transcribed text as the answer to the current question. Skips the glyph
  // option list entirely — useful for open-ended prompts where none of A/B/X/Y
  // is right, or when the operator can speak faster than they can read.
  // No-op outside the modal; the gamepad layer also emits 'shoulder' for L2
  // so other modules that care about triggers still work.
  let voiceAnswerInFlight = false;
  window.addEventListener('multideck:gamepad:voice-answer', async () => {
    if (modal.hidden) return;
    if (voiceAnswerInFlight) return;
    const q = cur && cur.questions[qIndex];
    if (!q) return;
    if (!window.MultideckSTT || typeof window.MultideckSTT.captureOnce !== 'function') return;

    voiceAnswerInFlight = true;
    tag.textContent = 'LISTENING';
    try {
      const text = await window.MultideckSTT.captureOnce();
      if (!text) { tag.textContent = (q.header || 'QUESTION').toString().toUpperCase().slice(0, 12); return; }
      answers[q.question] = text;
      qIndex += 1;
      if (qIndex >= cur.questions.length) submit();
      else render();
    } finally {
      voiceAnswerInFlight = false;
    }
  });

  // Keyboard fallback (desktop browsers, accessibility)
  window.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); cancel(); return; }
    if (k === 'Enter') { e.preventDefault();
      const q = cur && cur.questions[qIndex];
      if (q && q.multiSelect) confirmMulti(); else pickOption(highlight);
      return;
    }
    if (k === 'ArrowUp' || k === 'ArrowLeft')  { e.preventDefault(); setHighlight(highlight - 1); return; }
    if (k === 'ArrowDown' || k === 'ArrowRight'){ e.preventDefault(); setHighlight(highlight + 1); return; }
    if (k >= '1' && k <= '4') { e.preventDefault(); pickOption(Number(k) - 1); return; }
  });

  // ----- SSE subscription -----
  function subscribe() {
    let es;
    try { es = new EventSource('/events/questions'); }
    catch (e) { console.warn('[question-modal] EventSource failed', e); return; }

    es.addEventListener('ask', (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (!ev || !ev.sessionId || !Array.isArray(ev.questions)) return;
        // De-dupe: don't queue if this sessionId is already current or queued
        if (cur && cur.sessionId === ev.sessionId) return;
        if (queue.some((q) => q.sessionId === ev.sessionId)) return;
        queue.push(ev);
        if (!cur) nextFromQueue();
      } catch {}
    });

    es.addEventListener('resolved', (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (cur && cur.sessionId === ev.sessionId) { cur = null; nextFromQueue(); }
        queue = queue.filter((q) => q.sessionId !== ev.sessionId);
      } catch {}
    });

    es.onerror = () => {
      // Browser auto-reconnects on EventSource errors; nothing to do.
    };
  }

  subscribe();
})();
