// ============ TRANSPORT (wt vs tmux) ============
const TRANSPORT_PREF_KEY = 'dispatch.transport.preference';

// Maps server availability_reason → operator-facing one-sentence explanation.
// Surfaced via the help glyph next to the transport row (MULTI-UI-0064).
const TRANSPORT_REASON_COPY = {
  'available':                     'tmux runs personas as tiled panes inside one shared multideck session, so you can detach with prefix-d and reattach from another shell.',
  'wsl-not-detected':              'tmux requires WSL Ubuntu, which is not detected on this host. Install WSL2 + Ubuntu to enable the tmux transport.',
  'wsl-detected-tmux-missing':     'WSL Ubuntu is up but tmux is not installed inside it. Run "sudo apt install tmux" in the WSL shell to enable this transport.',
  'tmux-installed-but-no-claude':  'WSL Ubuntu and tmux are present but the claude binary is not on PATH inside WSL. Install Claude Code in WSL (see docs/WSL_SETUP.md).',
  'platform-not-windows':          'tmux transport is currently Windows-only; native Linux/macOS use the sh transport.',
};

function applyTransportUI(tx) {
  const row = document.getElementById('transport-row');
  if (!row) return;
  const available = (tx && Array.isArray(tx.available)) ? tx.available : ['wt'];
  const serverDefault = (tx && tx.default) || 'wt';
  const reason = (tx && tx.availability_reason) || (available.includes('tmux') ? 'available' : 'wsl-not-detected');

  // Row is always shown so non-WSL operators see the help glyph and can learn
  // why tmux is hidden. Radios for unavailable transports are disabled rather
  // than removed.
  row.style.display = '';

  // Persistent preference (criterion 1): localStorage > server default.
  // Fall back to server default if stored value is invalid or unavailable.
  let stored = null;
  try { stored = window.localStorage.getItem(TRANSPORT_PREF_KEY); } catch (e) { /* localStorage may be blocked */ }
  let chosen = serverDefault;
  if (stored && available.includes(stored)) chosen = stored;

  ['wt', 'tmux', 'browser'].forEach((t) => {
    const radio = document.getElementById('transport-' + t);
    if (!radio) return;
    radio.disabled = !available.includes(t);
    radio.checked = (t === chosen);
    const lbl = radio.closest('label');
    if (lbl) lbl.style.opacity = radio.disabled ? '0.35' : '1';
  });

  // Save selection on change.
  ['wt', 'tmux', 'browser'].forEach((t) => {
    const radio = document.getElementById('transport-' + t);
    if (!radio || radio.dataset.persistBound === '1') return;
    radio.dataset.persistBound = '1';
    radio.addEventListener('change', () => {
      try {
        if (radio.checked && !radio.disabled) {
          window.localStorage.setItem(TRANSPORT_PREF_KEY, t);
        }
      } catch (e) { /* ignore */ }
      refreshDeployTooltip();
    });
  });

  // Help glyph + tooltip wiring (criterion 3): visible even when only one
  // transport is on the list, so non-WSL operators get the explanation.
  const glyph = document.getElementById('transport-help-glyph');
  const tip = document.getElementById('transport-help-tip');
  if (glyph && tip) {
    const copy = TRANSPORT_REASON_COPY[reason] || TRANSPORT_REASON_COPY['available'];
    tip.textContent = copy;
    if (glyph.dataset.helpBound !== '1') {
      glyph.dataset.helpBound = '1';
      const show = () => { tip.style.display = 'block'; };
      const hide = () => { tip.style.display = 'none'; };
      const toggle = () => { tip.style.display = (tip.style.display === 'block') ? 'none' : 'block'; };
      glyph.addEventListener('mouseenter', show);
      glyph.addEventListener('mouseleave', hide);
      glyph.addEventListener('focus', show);
      glyph.addEventListener('blur', hide);
      glyph.addEventListener('click', toggle);
      glyph.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        if (e.key === 'Escape') hide();
      });
    }
  }

  refreshDeployTooltip();
}

// Update DEPLOY button tooltip so operators selecting tmux know panes spawn
// into the shared multideck session vs separate windows (criterion 4).
// Also toggles the ATTACH/DETACH HELP affordance which only makes sense when
// the operator is on the tmux transport (MULTI-FEAT-0065 criterion 5).
function refreshDeployTooltip() {
  const btn = document.getElementById('launch-btn');
  if (!btn) return;
  const t = selectedTransport();
  if (t === 'tmux') {
    btn.title = 'DEPLOY · tmux: spawns into the shared multideck session (tiled panes, one window). prefix-d to detach.';
  } else if (t === 'wt') {
    btn.title = 'DEPLOY · wt: opens a new Windows Terminal tab.';
  } else if (t === 'browser') {
    btn.title = 'DEPLOY · browser: opens the operative in a terminal panel right here.';
  } else {
    btn.title = 'DEPLOY';
  }
  const link = document.getElementById('tmux-attach-link');
  if (link) link.style.display = (t === 'tmux') ? 'inline' : 'none';
}

// Wire up the ATTACH/DETACH HELP link → inline modal with key keybinds
// (MULTI-FEAT-0065 criterion 5). Modal points at docs/TMUX_TOPOLOGY.md for
// the full guide; inline content covers detach/reattach/zoom/switch.
(function bindTmuxAttachModal() {
  document.addEventListener('DOMContentLoaded', () => {
    const anchor = document.getElementById('tmux-attach-anchor');
    const modal = document.getElementById('tmux-attach-modal');
    const closeBtn = document.getElementById('tmux-attach-modal-close');
    if (!anchor || !modal) return;
    const open = (e) => { if (e) e.preventDefault(); modal.style.display = 'block'; };
    const close = (e) => { if (e) e.preventDefault(); modal.style.display = 'none'; };
    anchor.addEventListener('click', open);
    anchor.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    if (closeBtn) closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  });
})();

function selectedTransport() {
  const checked = document.querySelector('input[name="transport"]:checked');
  if (checked && !checked.disabled) return checked.value;
  return (state.transports && state.transports.default) || 'wt';
}

// ============ FETCH DATA ============
async function loadData() {
  try {
    const [pr, pj, mu, tp, tx, md] = await Promise.all([
      fetch('/launcher/personas').then(r => r.json()),
      fetch('/launcher/projects').then(r => r.json()),
      fetch('/launcher/music').then(r => r.json()),
      fetch('/launcher/team-presets').then(r => r.json()),
      fetch('/launcher/transports').then(r => r.json()).catch(() => ({ available: ['wt'], default: 'wt' })),
      fetch('/launcher/models').then(r => r.json()).catch(() => ({ models: [] })),
    ]);
    state.personas = pr.personas || {};
    state.projects = pj.projects || [];
    state.tracks = mu.tracks || [];
    state.teamPresets = tp.presets || [];
    state.transports = tx;
    state.models = md.models || [];
    applyTransportUI(tx);
    populateModelSelect();
    renderProjectGrid();
    renderMusicGrid();
    renderTeamPresetsGrid();
    initBgmSrc();
    refreshContinueLabel();
  } catch (e) {
    console.error('failed to load launcher data', e);
  }
}

// Populate the MODEL dropdown from /launcher/models. The first option
// (empty value) means "use the persona's configured default" — the launch
// script falls back to DISPATCH_OPENCODE_MODEL or the qwen3-coder default.
function populateModelSelect() {
  const sel = document.getElementById('model-select');
  if (!sel) return;
  // preserve the placeholder option, drop any prior dynamic ones
  while (sel.options.length > 1) sel.remove(1);
  (state.models || []).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.id})`;
    sel.appendChild(opt);
  });
  if (state.selectedModel) sel.value = state.selectedModel;
  sel.addEventListener('change', () => {
    state.selectedModel = sel.value || '';
    refreshModelRowState();
  });
  refreshModelRowState();
}

// Show/hide the model row depending on runtime — Claude/Co-op mode doesn't use
// the model picker (Claude Code chooses its own model). Local and VS modes do.
function refreshModelRowState() {
  const row = document.getElementById('model-row');
  const help = document.getElementById('model-help');
  if (!row) return;
  if (state.runtime === 'claude') {
    row.style.opacity = '0.4';
    if (help) help.textContent = 'CO-OP uses Claude Code default — model picker inactive';
  } else {
    row.style.opacity = '0.85';
    if (help) help.textContent = state.runtime === 'vs' ? 'applies to OpenCode side of VS' : 'applies to OpenCode session';
  }
}

// ============ SCREEN MANAGEMENT ============
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
  state.currentScreen = id;
  state.kbdIndex = 0;
  setTimeout(() => {
    const sel = currentSelector();
    if (sel) setKbdIndex(0, sel);
  }, 10);
}

function currentSelector() {
  switch (state.currentScreen) {
    case 'title-screen':       return '#title-menu .menu-item';
    case 'mode-select-screen': return '#mode-grid .mode-card';
    case 'project-screen':     return '#project-grid .project-card';
    case 'dashboards-screen':  return '#dashboard-grid .dashboard-card';
    case 'teams-screen':       return '#team-presets-grid .preset-card';
    case 'music-screen':       return '#music-grid .track-card';
    case 'select-screen':      return '#grid .character-card';
    default:                   return null;
  }
}

function setKbdIndex(i, selector) {
  const items = document.querySelectorAll(selector);
  if (!items.length) return;
  state.kbdIndex = Math.max(0, Math.min(i, items.length - 1));
  items.forEach(el => el.classList.remove('kbd-active'));
  const active = items[state.kbdIndex];
  active.classList.add('kbd-active');
  if (selector.includes('character-card')) {
    const p = state.filteredPersonas[state.kbdIndex];
    if (p) showBio(p);
  }
}

// ============ KEYBOARD NAV ============
document.addEventListener('keydown', (e) => {
  // First key in any pre-game screen also kicks off audio
  if (!audioStarted &&
      (state.currentScreen === 'boot-screen' ||
       state.currentScreen === 'studio-screen' ||
       state.currentScreen === 'title-screen')) {
    tryStartAudio();
  }

  // Boot screen: any key skips
  if (state.currentScreen === 'boot-screen') {
    e.preventDefault();
    finishBoot();
    return;
  }
  // Studio splash: any key skips
  if (state.currentScreen === 'studio-screen') {
    e.preventDefault();
    skipStudio();
    return;
  }
  // Title screen with gate closed: any key opens menu
  if (state.currentScreen === 'title-screen' && !state.titleGateOpen) {
    e.preventDefault();
    openTitleGate();
    return;
  }

  // Ignore when typing in form inputs
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (e.key === 'Escape') { e.target.blur(); }
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    if (state.currentScreen === 'select-screen')      showScreen('project-screen');
    else if (state.currentScreen === 'mode-select-screen') showScreen('project-screen');
    else if (state.currentScreen === 'project-screen' ||
             state.currentScreen === 'new-project-screen' ||
             state.currentScreen === 'dashboards-screen' ||
             state.currentScreen === 'teams-screen' ||
             state.currentScreen === 'music-screen') showScreen('title-screen');
    return;
  }

  const sel = currentSelector();
  if (!sel) return;
  const items = document.querySelectorAll(sel);
  if (!items.length) return;

  const cols = computeCols(sel);

  if (e.key === 'ArrowRight') { e.preventDefault(); setKbdIndex(state.kbdIndex + 1, sel); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); setKbdIndex(state.kbdIndex - 1, sel); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); setKbdIndex(state.kbdIndex + cols, sel); }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); setKbdIndex(state.kbdIndex - cols, sel); }
  else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const active = items[state.kbdIndex];
    if (!active) return;
    if (state.currentScreen === 'select-screen') {
      const p = state.filteredPersonas[state.kbdIndex];
      if (p) {
        if (state.selectedPersona && state.selectedPersona.key === p.key) {
          launchSelected();
        } else {
          selectPersona(p, active);
        }
      }
    } else {
      active.click();
    }
  }
});

function computeCols(selector) {
  const items = document.querySelectorAll(selector);
  if (items.length < 2) return 1;
  const firstTop = items[0].offsetTop;
  for (let i = 1; i < items.length; i++) {
    if (items[i].offsetTop !== firstTop) return i;
  }
  return items.length;
}


// ============ INIT ============
renderDashboardGrid();
loadData();
showScreenRaw('boot-screen');
runBoot();
