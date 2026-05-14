// ============ BROWSER TERMINAL (multi-session) ============
const terminalSessions = new Map(); // sessionId → {ws, term, fitAddon, container, callsign, status, ro}
let activeTerminalId  = null;
let terminalMinimized = false;

const XTERM_THEME = {
  background:          '#03040e',
  foreground:          '#00FFCC',
  cursor:              '#00FFCC',
  cursorAccent:        '#03040e',
  selectionBackground: 'rgba(0,255,204,0.22)',
  black:         '#050510', brightBlack:   '#5B637A',
  red:           '#FF3366', brightRed:     '#FF3366',
  green:         '#00FFCC', brightGreen:   '#00FFCC',
  yellow:        '#FFB700', brightYellow:  '#FFD700',
  blue:          '#0080FF', brightBlue:    '#00AAFF',
  magenta:       '#FF00AA', brightMagenta: '#FF4FC2',
  cyan:          '#00FFCC', brightCyan:    '#00FFE5',
  white:         '#D8E1F0', brightWhite:   '#FFFFFF',
};

function createTerminalSession(sessionId, wsPath, callsign, color, personaKey) {
  const body = document.getElementById('terminal-body');
  const container = document.createElement('div');
  container.className = 'terminal-session';
  body.insertBefore(container, document.querySelector('.matrix-rain-wrapper'));

  const session = { ws: null, term: null, fitAddon: null, container, callsign, color: color || '#00FFCC', personaKey: personaKey || '', status: 'connecting', ro: null };
  terminalSessions.set(sessionId, session);
  syncMatrixRain();

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = proto + '//' + location.host + wsPath;

  ensureXterm().then(() => {
    const panel = document.getElementById('terminal-panel');
    const alreadyOpen = panel.classList.contains('open') && !terminalMinimized;

    if (!alreadyOpen) {
      terminalMinimized = false;
      document.getElementById('terminal-restore-tab').classList.remove('visible');
      panel.classList.add('open');
      void panel.offsetWidth;
      panel.classList.add('glitch');
      setTimeout(() => panel.classList.remove('glitch'), 600);
      setTimeout(() => MatrixRain.start(), 430);
    }

    switchSession(sessionId);

    const delay = alreadyOpen ? 50 : 430;
    setTimeout(() => {
      initXtermSession(sessionId);

      // Pass current xterm dimensions to the server so it can set COLUMNS,
      // LINES and stty cols/rows on the spawned bash. Without this, claude
      // wraps at bash's default 80 cols and long lines overflow the panel.
      const cols = (session.term && session.term.cols) || 100;
      const rows = (session.term && session.term.rows) || 30;
      const sep = wsUrl.includes('?') ? '&' : '?';
      const wsUrlWithSize = `${wsUrl}${sep}cols=${cols}&rows=${rows}`;

      session.ws = new WebSocket(wsUrlWithSize);

      session.ws.onopen = () => {
        session.status = 'live';
        renderTabs(); updateGlobalStatus();
      };
      session.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'data') {
            if (session.term) session.term.write(msg.data);
          } else if (msg.type === 'ready') {
            if (session.term) {
              const hx = (session.color || '#00FFCC').replace('#','');
              const r = parseInt(hx.slice(0,2),16), g = parseInt(hx.slice(2,4),16), b = parseInt(hx.slice(4,6),16);
              const tc = `\x1b[38;2;${r};${g};${b}m`;
              session.term.writeln(`\r${tc}┌─ SECURE CHANNEL ESTABLISHED\x1b[0m`);
              session.term.writeln(`${tc}├─ OPERATIVE: ${(callsign || '?').toUpperCase()}\x1b[0m`);
              session.term.writeln(`${tc}└─ READY\x1b[0m\r\n`);
            }
          } else if (msg.type === 'exit') {
            session.status = 'dead';
            renderTabs();
            if (activeTerminalId === sessionId) updateGlobalStatus();
            if (session.term) session.term.writeln('\r\n\x1b[33m■ SESSION TERMINATED · EXIT ' + (msg.code ?? '?') + '\x1b[0m');
          } else if (msg.type === 'error') {
            session.status = 'error';
            renderTabs();
            if (activeTerminalId === sessionId) updateGlobalStatus();
            if (session.term) session.term.writeln('\r\n\x1b[31m⚠ ' + (msg.msg || 'error') + '\x1b[0m');
          }
        } catch { /* malformed */ }
      };
      session.ws.onclose = () => {
        if (session.status === 'live' || session.status === 'connecting') {
          session.status = 'disconnected';
          renderTabs();
          if (activeTerminalId === sessionId) updateGlobalStatus();
        }
      };
    }, delay);
  });
}

function initXtermSession(sessionId) {
  const session = terminalSessions.get(sessionId);
  if (!session || typeof Terminal === 'undefined') return;
  session.container.innerHTML = '';
  const c = session.color || '#00FFCC';
  const cFaint = c + '38'; // ~22% alpha hex suffix for selection
  session.term = new Terminal({
    theme: {
      ...XTERM_THEME,
      foreground:          c,
      cursor:              c,
      selectionBackground: c + '3a',
      green:               c,
      brightGreen:         c,
      cyan:                c,
      brightCyan:          c,
    },
    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
    // Deck (max 1280x800) doubles the font for arm's-length readability.
    // This must be set in JS, not CSS: xterm.js uses canvas/webgl renderer
    // by default and computes cell-width from this option directly, ignoring
    // CSS. If we only set CSS font-size, xterm reports more cols to the PTY
    // than actually fit visually, and claude wraps mid-screen.
    fontSize: window.matchMedia('(max-width: 1280px) and (max-height: 800px)').matches ? 28 : 14,
    lineHeight: 1.3,
    cursorBlink: true, cursorStyle: 'block',
    scrollback: 5000, convertEol: true,
  });
  if (typeof FitAddon !== 'undefined') {
    session.fitAddon = new FitAddon.FitAddon();
    session.term.loadAddon(session.fitAddon);
  }
  session.term.open(session.container);
  if (session.fitAddon) session.fitAddon.fit();
  session.term.onData((data) => {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input', data }));
    }
  });
  session.ro = new ResizeObserver(() => { if (session.fitAddon) session.fitAddon.fit(); });
  session.ro.observe(session.container);
}

function syncMatrixRain() {
  const sessions = [...terminalSessions.values()];
  MatrixRain.setColors(sessions.map(s => s.color || '#00FFCC'));
  MatrixRain.setImages(sessions.filter(s => s.personaKey).map(s => '/launcher/assets/portraits/' + s.personaKey + '.png'));
}

function switchSession(targetId) {
  for (const s of terminalSessions.values()) {
    s.container.classList.remove('active');
  }
  const target = terminalSessions.get(targetId);
  if (!target) return;
  activeTerminalId = targetId;
  target.container.classList.add('active');
  updateGlobalStatus();
  renderTabs();
  setTimeout(() => { if (target.fitAddon) target.fitAddon.fit(); }, 50);
}

function closeSession(sessionId) {
  const session = terminalSessions.get(sessionId);
  if (!session) return;
  try { if (session.ws) session.ws.close(); } catch {}
  if (session.term) session.term.dispose();
  if (session.ro)   session.ro.disconnect();
  session.container.remove();
  terminalSessions.delete(sessionId);
  syncMatrixRain();

  if (terminalSessions.size === 0) {
    const panel = document.getElementById('terminal-panel');
    panel.classList.remove('open');
    document.getElementById('terminal-restore-tab').classList.remove('visible');
    activeTerminalId = null;
    terminalMinimized = false;
    MatrixRain.stop();
    renderTabs();
    return;
  }
  if (activeTerminalId === sessionId) {
    const ids = [...terminalSessions.keys()];
    switchSession(ids[ids.length - 1]);
  } else {
    renderTabs();
  }
}

function renderTabs() {
  const bar = document.getElementById('terminal-tabs');
  if (!bar) return;
  const dot = { connecting: '○', live: '●', dead: '■', error: '⚠', disconnected: '◌' };
  const cls = { connecting: '', live: 'live', dead: 'dead', error: 'dead', disconnected: 'dead' };
  bar.innerHTML = [...terminalSessions.entries()].map(([id, s]) => {
    const d = dot[s.status] || '○';
    const c = cls[s.status] || '';
    const active = id === activeTerminalId ? ' active' : '';
    return `<div class="terminal-tab${active}" data-sid="${id}">` +
      `<span class="tab-dot ${c}">${d}</span>` +
      `<span class="tab-name">${(s.callsign || '?').toUpperCase()}</span>` +
      `<button class="tab-close" data-sid="${id}">×</button>` +
      `</div>`;
  }).join('');

  const n = terminalSessions.size;
  const restoreEl = document.getElementById('terminal-restore-tab');
  if (restoreEl) restoreEl.textContent = n > 1 ? `[ ◈ ${n} TERMINALS ACTIVE ]` : '[ ◈ TERMINAL ACTIVE ]';

  bar.querySelectorAll('.terminal-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) return;
      switchSession(tab.dataset.sid);
    });
  });
  bar.querySelectorAll('.tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); closeSession(btn.dataset.sid); });
  });
}

function updateGlobalStatus() {
  const dot   = document.getElementById('terminal-status-dot');
  const badge = document.getElementById('terminal-badge');
  if (!dot || !badge) return;
  const s = activeTerminalId ? terminalSessions.get(activeTerminalId) : null;
  if (!s) { dot.className = 'terminal-status-dot'; badge.textContent = '—'; return; }
  const map = {
    connecting:   ['',     'CONNECTING'],
    live:         ['live', 'LIVE'],
    dead:         ['dead', 'OFFLINE'],
    error:        ['dead', 'ERROR'],
    disconnected: ['dead', 'DISCONNECTED'],
  };
  const [cls, txt] = map[s.status] || map.connecting;
  dot.className     = 'terminal-status-dot' + (cls ? ' ' + cls : '');
  badge.textContent = txt;
}

function minimizeTerminalPanel() {
  const panel = document.getElementById('terminal-panel');
  terminalMinimized = true;
  panel.classList.remove('open');
  MatrixRain.stop();
  const n = terminalSessions.size;
  const restoreEl = document.getElementById('terminal-restore-tab');
  if (n > 0) {
    restoreEl.textContent = n > 1 ? `[ ◈ ${n} TERMINALS ACTIVE ]` : '[ ◈ TERMINAL ACTIVE ]';
    restoreEl.classList.add('visible');
  }
}

function restoreTerminalPanel() {
  const panel = document.getElementById('terminal-panel');
  terminalMinimized = false;
  document.getElementById('terminal-restore-tab').classList.remove('visible');
  panel.classList.add('open');
  setTimeout(() => {
    const s = activeTerminalId && terminalSessions.get(activeTerminalId);
    if (s && s.fitAddon) s.fitAddon.fit();
    MatrixRain.start();
  }, 430);
}

function newTerminalSession() {
  minimizeTerminalPanel();
  showScreen('select-screen');
}

function ensureXterm() {
  if (typeof Terminal !== 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
    document.head.appendChild(cssLink);
    const s1 = document.createElement('script');
    s1.src = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js';
      s2.onload = resolve; s2.onerror = resolve;
      document.head.appendChild(s2);
    };
    s1.onerror = resolve;
    document.head.appendChild(s1);
  });
}

// ============ MATRIX RAIN ============
const MatrixRain = (() => {
  const CELL_W = 14, CELL_H = 16;
  const CHARS =
    'ｦｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' +
    '0123456789ABCDEF!?@#$<>[]{}|\\+-=~`';
  const PHRASES = [
    'FOLLOW THE WHITE RABBIT', 'WAKE UP NEO', 'THERE IS NO SPOON',
    'THE MATRIX HAS YOU', 'HACK THE PLANET', 'ACCESS GRANTED',
    'ROOT SHELL ACQUIRED', 'GHOST IN THE SHELL', 'BLADE RUNNER 2049',
    'NEUROMANCER', 'ICE BREAKER', 'REALITY IS AN ILLUSION',
    'SUDO MAKE ME A SANDWICH', 'I AM BECOME ROOT', 'KILL -9 EVERYTHING',
    'SEGMENTATION FAULT', 'CTRL ALT DELETE', 'NaN NaN NaN BATMAN',
    'STACK OVERFLOW', 'NO CARRIER', 'PACKET LOSS 100%',
    '404 SOUL NOT FOUND', 'BUFFER OVERFLOW', 'DROP TABLE USERS',
    'OPERATIVE ONLINE', 'GHOST PROTOCOL', 'FIREWALL DOWN',
    'BREACH DETECTED', 'GIT PUSH --FORCE', 'COFFEE.EXECUTE()',
    'YOU HAVE BEEN HACKED', 'UNDEFINED IS NOT A FUNCTION',
    'SEND HELP', 'JOHNNY MNEMONIC', 'DARK CITY ONLINE',
    'STAY IN THE MATRIX', 'SYSTEM COMPROMISED', '¯\\_(ツ)_/¯',
    'CASE HAS ENTERED CYBERSPACE', 'LIGHTS OUT', 'BEWARE THE IDES',
    'CTRL+Z LIFE', 'SUDO FEELINGS', 'git blame everyone',
    'TECHNICALLY CORRECT', 'WORKS ON MY MACHINE', 'SHIP IT',
  ];

  const canvas = document.getElementById('matrix-rain');
  const ctx    = canvas.getContext('2d');
  let CW = 14; // effective cell width — shrinks with more sessions
  let cols = 0, rows = 0;
  let drops = [], speeds = [], chars = [], colColors = [];
  let ghosts = [], rainImages = [];
  let rainColors = ['#00FFCC'];
  let floodColor = null, floodIntensity = 0, flashAlpha = 0;
  let raf = null, active = false;

  function rc() { return CHARS[Math.random() * CHARS.length | 0]; }
  function pickColor() { return rainColors[Math.random() * rainColors.length | 0]; }

  function rebuild() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width  = rect.width;
    canvas.height = rect.height;
    cols = Math.max(1, Math.floor(canvas.width  / CW));
    rows = Math.max(1, Math.floor(canvas.height / CELL_H));
    drops     = Array.from({length: cols}, () => -(Math.random() * rows | 0));
    speeds    = Array.from({length: cols}, () => (0.22 + Math.random() * 0.6) * 0.85);
    chars     = Array.from({length: cols}, rc);
    colColors = Array.from({length: cols}, pickColor);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawWatermarks() {
    if (!rainImages.length) return;
    const TILE = 128;
    const tc = Math.max(1, Math.floor(canvas.width / TILE));
    ctx.globalAlpha = 0.028;
    rainImages.forEach((img, idx) => {
      if (!img.complete || !img.naturalWidth) return;
      const col = idx % tc;
      const row = Math.floor(idx / tc);
      ctx.drawImage(img, col * TILE, row * TILE, TILE, TILE);
    });
    ctx.globalAlpha = 1;
  }

  function spawnGhost() {
    const text = PHRASES[Math.random() * PHRASES.length | 0];
    const maxX = Math.max(8, canvas.width - text.length * 7 - 8);
    ghosts.push({
      text,
      x:     8 + Math.random() * maxX,
      y:     18 + Math.random() * (canvas.height - 36),
      alpha: 1,
      decay: 0.0025 + Math.random() * 0.003,
      color: pickColor(),
    });
  }

  function draw() {
    if (!active) return;
    raf = requestAnimationFrame(draw);
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;

    ctx.fillStyle = 'rgba(3,4,14,0.08)';
    ctx.fillRect(0, 0, W, H);

    // Full-canvas color flash — instant burst, fades in ~12 frames
    if (flashAlpha > 0) {
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle   = floodColor;
      ctx.fillRect(0, 0, W, H);
      // Bloom ring: slightly larger saturated halo
      ctx.globalAlpha = flashAlpha * 0.4;
      ctx.shadowColor = floodColor;
      ctx.shadowBlur  = 80;
      ctx.fillRect(0, 0, W, H);
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
      flashAlpha = Math.max(0, flashAlpha - 0.09);
    }

    drawWatermarks();

    ctx.font = `${CELL_H - 2}px "Courier New", monospace`;
    ctx.textBaseline = 'top';

    for (let c = 0; c < cols; c++) {
      const x = c * CW;
      const y = drops[c] * CELL_H;
      if (y > -CELL_H && y < H + CELL_H) {
        if (Math.random() > 0.91) chars[c] = rc();
        let drawColor = floodIntensity > 0 ? floodColor : colColors[c];
        let drawGlow  = floodIntensity > 0 ? 13 + 55 * floodIntensity : 13;
        ctx.globalAlpha = floodIntensity > 0 ? Math.min(1, 0.5 + 0.5 * floodIntensity) : 1;
        ctx.fillStyle   = drawColor;
        ctx.shadowColor = drawColor;
        ctx.shadowBlur  = drawGlow;
        ctx.fillText(chars[c], x, y);
        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 1;
      }
      drops[c] += speeds[c];
      if (drops[c] * CELL_H > H && Math.random() > 0.976) {
        drops[c]     = -(1 + Math.random() * rows * 0.35);
        colColors[c] = floodIntensity > 0.15 ? floodColor : pickColor();
      }
    }

    if (floodIntensity > 0) {
      floodIntensity = Math.max(0, floodIntensity - 0.008);
      if (floodIntensity === 0) for (let c = 0; c < cols; c++) colColors[c] = pickColor();
    }

    // Ghost phrases — scaled spawn rate with session count
    const spawnRate = 0.00185 * Math.sqrt(rainColors.length);
    if (Math.random() < spawnRate && ghosts.length < 3 + rainColors.length) spawnGhost();

    ctx.font = '10px "Press Start 2P", monospace';
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      ctx.globalAlpha = g.alpha;
      ctx.shadowColor = g.color;
      ctx.shadowBlur  = 16;
      ctx.fillStyle   = g.color;
      ctx.fillText(g.text, g.x, g.y);
      ctx.shadowBlur = 0;
      if (g.alpha > 0.3) {
        ctx.fillStyle = g.color + '59';
        ctx.fillRect(g.x - 2, g.y + 14, g.text.length * 7 + 4, 1);
      }
      ctx.globalAlpha = 1;
      g.alpha -= g.decay;
      if (g.alpha <= 0) ghosts.splice(i, 1);
    }
  }

  new ResizeObserver(rebuild).observe(canvas);

  function start() {
    if (active) return;
    active = true;
    rebuild();
    draw();
  }
  function stop() {
    active = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (ctx && canvas.width && canvas.height) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function setColors(hexArray) {
    const prev = rainColors.length;
    rainColors = hexArray.length ? hexArray : ['#00FFCC'];
    // Scale column density: each session exponentiates the char count
    const n = rainColors.length;
    CW = Math.max(7, Math.round(14 / Math.sqrt(n)));
    if (rainColors.length !== prev) rebuild(); // density changed — re-grid
    else for (let c = 0; c < colColors.length; c++) colColors[c] = pickColor();
  }
  function setImages(urls) {
    // Cap watermark portraits at MAX_RAIN_IMAGES to keep the rain readable
    // on the 7" Deck screen. Above 4 the tiled portraits overlap and the
    // launcher feels cluttered. Newest sessions take precedence; older
    // portraits drop out of the rain (but their sessions stay active).
    const MAX_RAIN_IMAGES = 4;
    const capped = (urls || []).slice(-MAX_RAIN_IMAGES);
    rainImages = capped.map(url => {
      const img = new Image();
      img.src = url;
      return img;
    });
  }
  function triggerSwell(pixelX, color) {
    floodColor     = color;
    floodIntensity = 1.0;
    flashAlpha     = 0.82;
    for (let c = 0; c < cols; c++) colColors[c] = color;
  }

  canvas.addEventListener('click', (e) => {
    if (!terminalSessions.size) return;
    const rect  = canvas.getBoundingClientRect();
    const x     = e.clientX - rect.left;
    const y     = e.clientY - rect.top;
    const TILE  = 128;
    const tc    = Math.max(1, Math.floor(canvas.width / TILE));
    const idx   = Math.floor(y / TILE) * tc + Math.floor(x / TILE);
    const ids   = [...terminalSessions.keys()];
    if (idx >= ids.length) return;
    const session = terminalSessions.get(ids[idx]);
    if (!session) return;
    switchSession(ids[idx]);
    triggerSwell(x, session.color || '#00FFCC');
  });

  return { start, stop, setColors, setImages, triggerSwell };
})();

document.getElementById('terminal-min-btn').addEventListener('click', minimizeTerminalPanel);
document.getElementById('terminal-new-btn').addEventListener('click', newTerminalSession);
document.getElementById('terminal-restore-tab').addEventListener('click', restoreTerminalPanel);

// Minimal public API for sibling modules (launcher-stt, launcher-question-modal).
// Keeping the surface tight: send text into the active session and read which
// session is active. No internal state is exposed.
window.MultideckTerminal = {
  sendToActiveSession(text) {
    if (!activeTerminalId) return false;
    const s = terminalSessions.get(activeTerminalId);
    if (!s || !s.ws || s.ws.readyState !== WebSocket.OPEN) return false;
    s.ws.send(JSON.stringify({ type: 'input', data: text }));
    return true;
  },
  hasActiveSession() {
    if (!activeTerminalId) return false;
    const s = terminalSessions.get(activeTerminalId);
    return !!(s && s.ws && s.ws.readyState === WebSocket.OPEN);
  },
  getActiveSessionId() {
    return activeTerminalId;
  },
  // v0.7.4: R1/L1 bumpers cycle through active terminal sessions like a
  // tab strip. dir = +1 (next) or -1 (prev). Wraps at both ends. Returns
  // false when fewer than 2 sessions exist so callers can no-op cleanly.
  cycleSession(dir) {
    const ids = [...terminalSessions.keys()];
    if (ids.length < 2) return false;
    const i = activeTerminalId ? ids.indexOf(activeTerminalId) : -1;
    const next = ids[((i + dir) % ids.length + ids.length) % ids.length];
    switchSession(next);
    triggerTabSwellForActive();
    return true;
  },
};

function triggerTabSwellForActive() {
  if (!activeTerminalId) return;
  const s = terminalSessions.get(activeTerminalId);
  if (!s) return;
  MatrixRain.triggerSwell(0, s.color || '#00FFCC');
}

// Gamepad bumper bindings — only fire when the terminal panel is the
// active visual context. We gate on (a) panel must be open and not
// minimized, (b) glyph modal must not be eating input, (c) at least two
// sessions to cycle through. Otherwise R1/L1 silently no-op so they don't
// fight the modal A/B/X/Y picker or steal focus from a single session.
(function wireGamepadTabCycling() {
  function modalEatingInput() {
    const m = document.getElementById('question-modal');
    return !!(m && !m.hidden);
  }
  function panelActive() {
    const panel = document.getElementById('terminal-panel');
    return !!(panel && panel.classList.contains('open') && !terminalMinimized);
  }
  window.addEventListener('multideck:gamepad:tab-next', () => {
    if (modalEatingInput() || !panelActive()) return;
    window.MultideckTerminal.cycleSession(+1);
  });
  window.addEventListener('multideck:gamepad:tab-prev', () => {
    if (modalEatingInput() || !panelActive()) return;
    window.MultideckTerminal.cycleSession(-1);
  });
})();
