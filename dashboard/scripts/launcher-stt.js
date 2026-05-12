// ============ STT (speech-to-text) ============
// Push-to-talk mic capture → POST to /stt/transcribe → inject text into the
// active terminal session.
//
// Triggers:
//   - Click on #terminal-mic-btn (toggle: click to start, click again to stop)
//   - Hold gamepad L1 (multideck:gamepad:ptt-down / ptt-up events)
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

  // Gamepad PTT: L1 hold to record. ptt-down starts, ptt-up stops.
  window.addEventListener('multideck:gamepad:ptt-down', () => {
    if (state === 'idle') startRecording();
  });
  window.addEventListener('multideck:gamepad:ptt-up', () => {
    if (state === 'recording') stopRecording();
  });

  setState('idle');
})();
