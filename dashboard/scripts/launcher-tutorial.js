// ============ TUTORIAL POPUP (first-run gamepad walkthrough) ============
// Intentionally low-tech "press X to continue" coachmark style. Fires once
// per LS_KEY value; bump the version in the key when bindings change so
// returning operators see it again.
//
// Each step advances by actually pressing the indicated button — completing
// the action IS the lesson. If the user presses X, the mic starts; the
// tutorial just rides along on the same event the rest of the launcher
// listens to. Skip with B (cancel) or Y at any time.
//
// Re-trigger:
//   - Click the [ ? ] button in the terminal header
//   - Append ?tutorial=1 to the URL
//   - Clear localStorage key 'multideck.tutorial.v1.seen'
(() => {
  const LS_KEY = 'multideck.tutorial.v1.seen';
  const FORCE = new URLSearchParams(location.search).has('tutorial');

  const STEPS = [
    {
      glyph: 'X',
      color: '#0080FF',
      text: 'PRESS X TO TOGGLE THE MIC.\nWORKS ANYWHERE OUTSIDE A QUESTION MODAL.\nPRESS AGAIN TO STOP AND TRANSCRIBE.',
      advanceOn: 'mic',
    },
    {
      glyph: 'R1',
      color: '#00FFCC',
      text: 'PRESS R1 TO CYCLE TO THE NEXT TERMINAL TAB.\nWORKS WHEN AT LEAST TWO SESSIONS ARE OPEN.',
      advanceOn: 'tab-next',
    },
    {
      glyph: 'L1',
      color: '#00FFCC',
      text: 'PRESS L1 TO CYCLE BACK ONE TAB.\nWRAPS AROUND AT BOTH ENDS.',
      advanceOn: 'tab-prev',
    },
    {
      glyph: 'A B X Y',
      color: '#FFB700',
      text: 'INSIDE A QUESTION MODAL,\nFACE BUTTONS PICK ANSWERS 1 2 3 4.\nD-PAD HIGHLIGHTS, A CONFIRMS.',
      advisory: true,
    },
    {
      glyph: 'L2',
      color: '#FF3366',
      text: 'INSIDE A QUESTION MODAL,\nPRESS L2 TO VOICE-ANSWER.\nSPEAK AND THE MODAL SUBMITS THE TRANSCRIPT.',
      advisory: true,
    },
  ];

  let active = false;
  let stepIdx = 0;
  let overlay = null;

  function shouldAutoShow() {
    if (FORCE) return true;
    try { return !localStorage.getItem(LS_KEY); } catch { return true; }
  }

  function markSeen() {
    try { localStorage.setItem(LS_KEY, new Date().toISOString()); } catch {}
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML = `
      <div class="tutorial-popup">
        <div class="tutorial-header">
          <span class="tutorial-title">[ TACTICAL TRAINING ]</span>
          <span class="tutorial-progress" id="tutorial-progress"></span>
        </div>
        <div class="tutorial-body">
          <div class="tutorial-glyph" id="tutorial-glyph">[ X ]</div>
          <div class="tutorial-text" id="tutorial-text"></div>
        </div>
        <div class="tutorial-footer">
          <span class="tutorial-hint" id="tutorial-hint">PRESS X TO CONTINUE</span>
          <span class="tutorial-skip">B OR Y TO SKIP</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function render() {
    const s = STEPS[stepIdx];
    const glyphEl = document.getElementById('tutorial-glyph');
    const textEl = document.getElementById('tutorial-text');
    const progEl = document.getElementById('tutorial-progress');
    const hintEl = document.getElementById('tutorial-hint');
    progEl.textContent = `STEP ${stepIdx + 1} OF ${STEPS.length}`;
    glyphEl.textContent = '[ ' + s.glyph + ' ]';
    glyphEl.style.setProperty('--tutorial-glyph-color', s.color);
    textEl.textContent = s.text;
    hintEl.textContent = s.advisory
      ? 'PRESS A TO CONTINUE'
      : `PRESS ${s.glyph} TO CONTINUE`;
  }

  function start() {
    if (active) return;
    active = true;
    stepIdx = 0;
    if (!overlay) build();
    overlay.classList.add('visible');
    render();
  }

  function close() {
    if (!active) return;
    active = false;
    if (overlay) overlay.classList.remove('visible');
    // Either way, don't pester next boot. Re-trigger via the [?] button.
    markSeen();
  }

  function advance() {
    stepIdx += 1;
    if (stepIdx >= STEPS.length) { close(); return; }
    render();
  }

  // Gamepad events — only the matching event for the current step advances.
  // Other gamepad presses pass through to their normal consumers unchanged.
  //
  // NOTE: the tutorial does NOT stopPropagation. Pressing X during step 1
  // really does toggle the mic; pressing R1 really does cycle terminals (if
  // any are open). That is intentional — the operator learns the binding by
  // performing it. If recording is in flight when the tutorial closes, the
  // operator just presses X again to stop. Same for any other side effect.
  ['mic', 'tab-next', 'tab-prev'].forEach((ev) => {
    window.addEventListener('multideck:gamepad:' + ev, () => {
      if (!active) return;
      const s = STEPS[stepIdx];
      if (s.advanceOn === ev) advance();
    });
  });

  // A advances advisory steps. (B and Y skip the whole tutorial.)
  window.addEventListener('multideck:gamepad:accept', () => {
    if (!active) return;
    if (STEPS[stepIdx].advisory) advance();
  });
  window.addEventListener('multideck:gamepad:cancel', () => {
    if (!active) return;
    close();
  });
  // Option event fires for A=0, B=1, X=2, Y=3. Y skips the tutorial, BUT
  // not when a question modal is open underneath — there Y is a valid
  // answer pick (option index 3) and we shouldn't double-action.
  window.addEventListener('multideck:gamepad:option', (e) => {
    if (!active) return;
    if (!e.detail || e.detail.index !== 3) return;
    const m = document.getElementById('question-modal');
    if (m && !m.hidden) return;
    close();
  });

  // Keyboard fallback for the desktop case and accessibility.
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advance(); return; }
  });

  // [?] button in terminal header retriggers. Added in launcher.html.
  function wireHelpButton() {
    const btn = document.getElementById('tutorial-help-btn');
    if (!btn) return;
    btn.addEventListener('click', () => { if (!active) { stepIdx = 0; start(); } });
  }

  // Boot sequence is ~5.7s end-to-end (boot log animation, studio splash
  // 3s, title-screen reveal). 6500ms puts the auto-show comfortably after
  // the title is visible so the popup doesn't stack on the boot animation.
  // The [?] button is wired immediately at DOM-ready so the operator can
  // still trigger the tutorial manually during the boot delay window.
  function ready(cb) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb);
    else cb();
  }
  ready(() => {
    wireHelpButton();
    if (shouldAutoShow()) setTimeout(start, 6500);
  });

  // Expose a minimal API in case other modules want to trigger it later.
  window.MultideckTutorial = { start: () => { stepIdx = 0; start(); }, close: () => close() };
})();
