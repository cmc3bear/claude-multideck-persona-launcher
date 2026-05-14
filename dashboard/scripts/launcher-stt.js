// ============ STT (speech-to-text) ============
// Mic capture → POST to /stt/transcribe → inject text into the active terminal
// session.
//
// Triggers (v0.7.4):
//   - Click on #terminal-mic-btn  (toggle: click to start, click again to stop)
//   - Press gamepad X             (multideck:gamepad:mic event; toggle)
//     X also emits `option { index: 2 }` for glyph modal picks. The mic
//     listener bails when the glyph modal is open so X-as-option-2 still
//     works inside the modal.
//
// Visual states reflected on the button:
//   .idle         — neutral
//   .recording    — pulsing red
//   .transcribing — spinner glyph
//   .error        — brief red flash
//
// Requires:
//   POST /stt/transcribe         (audio body → { text })
//   window.MultideckTerminal.sendToActiveSession(text)
//
// Exposes:
//   window.MultideckSTT.captureOnce()   → Promise<string|null>
//     Used by launcher-question-modal for the L2 voice-answer flow. Captures
//     one mic burst, transcribes, returns the text without injecting into a
//     terminal session.
(() => {
  const btn = document.getElementById('terminal-mic-btn');
  if (!btn) return;

  let mediaRecorder = null;
  let chunks = [];
  let state = 'idle'; // 'idle' | 'recording' | 'transcribing' | 'error'

  function setState(next, glyph) {
    state = next;
    btn.classList.remove('idle', 'recording', 'transcribing', 'error');
    btn.classList.add(next);
    if (glyph) btn.textContent = glyph;
    else {
      btn.textContent = {
        idle: '[ ◉ MIC ]',
        recording: '[ ● REC ]',
        transcribing: '[ ⋯ STT ]',
        error: '[ ! ERR ]',
      }[next] || '[ ◉ MIC ]';
    }
  }

  async function startRecording() {
    if (state === 'recording' || state === 'transcribing') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[stt] getUserMedia not available');
      setState('error');
      setTimeout(() => setState('idle'), 1200);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      // audio/webm;codecs=opus is the broadly supported MediaRecorder mime on Chromium.
      // ffmpeg in the dashboard will transcode it to 16kHz mono WAV for whisper.
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        for (const t of stream.getTracks()) { try { t.stop(); } catch {} }
        if (!chunks.length) { setState('idle'); return; }
        setState('transcribing');
        const blob = new Blob(chunks, { type: mime });
        try {
          const res = await fetch('/stt/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': mime },
            body: blob,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn('[stt] transcribe failed', res.status, err);
            setState('error');
            setTimeout(() => setState('idle'), 1500);
            return;
          }
          const { text } = await res.json();
          if (text && window.MultideckTerminal && window.MultideckTerminal.hasActiveSession()) {
            window.MultideckTerminal.sendToActiveSession(text + '\n');
          } else if (text) {
            // Fallback: stash on clipboard so the user can paste manually.
            try { await navigator.clipboard.writeText(text); } catch {}
            console.info('[stt] no active terminal; copied to clipboard:', text);
          }
          setState('idle');
        } catch (e) {
          console.warn('[stt] post failed', e);
          setState('error');
          setTimeout(() => setState('idle'), 1500);
        }
      };
      mediaRecorder.start();
      setState('recording');
    } catch (e) {
      console.warn('[stt] getUserMedia denied or failed', e);
      setState('error');
      setTimeout(() => setState('idle'), 1500);
    }
  }

  function stopRecording() {
    if (state !== 'recording' || !mediaRecorder) return;
    try { mediaRecorder.stop(); } catch {}
  }

  function toggle() {
    if (state === 'recording') stopRecording();
    else if (state === 'idle') startRecording();
  }

  btn.addEventListener('click', toggle);

  // Gamepad X: toggle mic. X also fires `option {index: 2}` for the glyph
  // modal; when the modal is open, the modal handles the press and we bail
  // here so we don't hijack the option pick.
  function modalIsOpen() {
    const m = document.getElementById('question-modal');
    return !!(m && !m.hidden);
  }
  window.addEventListener('multideck:gamepad:mic', () => {
    if (modalIsOpen()) return;
    toggle();
  });

  // ----- captureOnce: programmatic single-burst capture used by the glyph
  //       modal's voice-answer flow. Returns the transcribed text (or null
  //       on cancel/error). Bypasses the terminal injection path so the
  //       caller can route the text wherever it needs to.
  async function captureOnce() {
    if (state !== 'idle') return null;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 1500);
      return null;
    }
    // MediaRecorder constructor and rec.start() can both throw synchronously
    // on a browser that rejects the chosen mime (rare on Chromium, but the
    // contract is fragile). Wrap them so we always release the mic stream;
    // otherwise the OS-level mic LED stays on and the operator has to
    // reload the page.
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      for (const t of stream.getTracks()) { try { t.stop(); } catch {} }
      setState('error');
      setTimeout(() => setState('idle'), 1500);
      return null;
    }
    const localChunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) localChunks.push(e.data); };
    return await new Promise((resolve) => {
      rec.onstop = async () => {
        for (const t of stream.getTracks()) { try { t.stop(); } catch {} }
        if (!localChunks.length) { setState('idle'); return resolve(null); }
        setState('transcribing');
        try {
          const blob = new Blob(localChunks, { type: mime });
          const res = await fetch('/stt/transcribe', { method: 'POST', headers: { 'Content-Type': mime }, body: blob });
          setState('idle');
          if (!res.ok) return resolve(null);
          const { text } = await res.json();
          resolve(text || null);
        } catch {
          setState('error');
          setTimeout(() => setState('idle'), 1500);
          resolve(null);
        }
      };
      // Capture window: 6 seconds max. Modal voice-answer autocuts so the
      // operator stays unblocked even if they forget to release the mic.
      try {
        rec.start();
      } catch {
        for (const t of stream.getTracks()) { try { t.stop(); } catch {} }
        setState('error');
        setTimeout(() => setState('idle'), 1500);
        return resolve(null);
      }
      setState('recording');
      setTimeout(() => { try { if (rec.state === 'recording') rec.stop(); } catch {} }, 6000);
    });
  }

  window.MultideckSTT = { captureOnce };

  setState('idle');
})();
