// ============ RENDER PROJECT GRID ============
function renderProjectGrid() {
  const grid = document.getElementById('project-grid');
  grid.innerHTML = '';
  state.projects.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.idx = i;
    card.innerHTML = `
      <div class="project-name">${escapeHtml(p.name)}</div>
      <div class="project-path">${escapeHtml(p.path)}</div>
      <div class="project-desc">${escapeHtml(p.description || '')}</div>
    `;
    card.addEventListener('click', () => selectProject(p));
    card.addEventListener('mouseenter', () => setKbdIndex(i, '#project-grid .project-card'));
    grid.appendChild(card);
  });
}

function selectProject(p) {
  state.currentProject = p;
  document.getElementById('hud-project').textContent = p.name + '  [' + p.path + ']';
  state.filteredPersonas = personasForProject(p);
  renderCharacterGrid();
  // Gate to character-select goes through mode-select so the operator picks
  // a runtime (Local/Co-op/VS) before deploying.
  showScreen('mode-select-screen');
  bindModeCards();
  setTimeout(() => setKbdIndex(0, '#mode-grid .mode-card'), 50);
}
// ============ RENDER DASHBOARD GRID ============
function renderDashboardGrid() {
  const grid = document.getElementById('dashboard-grid');
  grid.innerHTML = '';
  DASHBOARDS.forEach((d, i) => {
    // Render as <a target="_blank"> so the browser always opens a new tab.
    // window.open() can be blocked by popup blockers and silently navigate the
    // current tab (killing live terminal sessions); anchor clicks are never blocked.
    const card = document.createElement('a');
    card.className = 'dashboard-card';
    card.dataset.idx = i;
    card.href = d.url;
    card.target = '_blank';
    card.rel = 'noopener';
    card.innerHTML = `
      <div class="dashboard-name">${escapeHtml(d.name)}</div>
      <div class="dashboard-desc">${escapeHtml(d.desc)}</div>
    `;
    card.addEventListener('mouseenter', () => setKbdIndex(i, '#dashboard-grid .dashboard-card'));
    grid.appendChild(card);
  });
}
// ============ TITLE MENU ACTIONS ============
document.getElementById('title-menu').addEventListener('click', (e) => {
  const btn = e.target.closest('.menu-item');
  if (!btn) return;
  handleTitleAction(btn.dataset.action);
});

function handleTitleAction(action) {
  switch (action) {
    case 'continue': {
      const save = loadSaveData();
      if (!save) {
        flashMenuMessage('NO SAVE DATA');
        return;
      }
      const project = state.projects.find(p => p.id === save.projectId) || state.projects[0];
      if (!project) {
        flashMenuMessage('NO SAVE DATA');
        return;
      }
      state.currentProject = project;
      document.getElementById('hud-project').textContent = project.name + '  [' + project.path + ']';
      state.filteredPersonas = personasForProject(project);
      renderCharacterGrid();
      // CONTINUE restores the runtime from the saved session so the operator
      // doesn't have to re-pick the mode every time. NEW GAME / LOAD / TEAMS
      // all still flow through mode-select-screen.
      if (save.runtime && ['claude', 'opencode', 'vs'].includes(save.runtime)) {
        state.runtime = save.runtime;
      }
      if (typeof save.model === 'string') {
        state.selectedModel = save.model;
        const sel = document.getElementById('model-select');
        if (sel) sel.value = save.model;
      }
      refreshHudRuntime();
      refreshModelRowState();
      // Try to pre-select the saved persona
      const savedIdx = state.filteredPersonas.findIndex(p => p.key === save.personaKey);
      if (savedIdx >= 0) {
        const cards = document.querySelectorAll('#grid .character-card');
        selectPersona(state.filteredPersonas[savedIdx], cards[savedIdx]);
      }
      showScreen('select-screen');
      break;
    }
    case 'load':
      showScreen('project-screen');
      break;
    case 'new-game':
      showScreen('new-project-screen');
      setTimeout(() => document.getElementById('new-project-name').focus(), 50);
      break;
    case 'teams':
      showScreen('teams-screen');
      break;
    case 'music':
      showScreen('music-screen');
      break;
    case 'options':
      showScreen('dashboards-screen');
      break;
    case 'quit':
      runShutdown();
      break;
  }
}

// ============ SAVE / LOAD STATE ============
const SAVE_KEY = 'dispatch_launcher_save';

function saveLastSession(projectId, personaKey) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      projectId, personaKey,
      runtime: state.runtime,
      model: state.selectedModel || '',
      ts: Date.now(),
    }));
  } catch {}
}

function loadSaveData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function refreshContinueLabel() {
  const save = loadSaveData();
  const btn = document.getElementById('menu-continue');
  if (!btn) return;
  if (save && state.personas[save.personaKey]) {
    const p = state.personas[save.personaKey];
    btn.textContent = `CONTINUE  \u00b7  ${(p.callsign || save.personaKey).toUpperCase()}`;
  } else {
    btn.textContent = 'CONTINUE';
    btn.style.opacity = '0.5';
  }
}

function flashMenuMessage(msg) {
  const btn = document.getElementById('menu-continue');
  const orig = btn.textContent;
  btn.textContent = '// ' + msg + ' //';
  btn.style.color = 'var(--neon-red)';
  btn.style.borderColor = 'var(--neon-red)';
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.color = '';
    btn.style.borderColor = '';
  }, 1400);
}

// ============ SHUTDOWN SEQUENCE ============
const SHUTDOWN_LINES = [
  { text: 'flushing dispatch queue ...... ', result: 'OK',     cls: 'ok',   delay: 160 },
  { text: 'closing uplink ............... ', result: 'OK',     cls: 'ok',   delay: 140 },
  { text: 'unmount /dev/dispatch ........ ', result: 'OK',     cls: 'ok',   delay: 120 },
  { text: 'persona registry .............',  result: 'STOWED', cls: 'ok',   delay: 140 },
  { text: 'crt power down ............... ', result: 'OK',     cls: 'ok',   delay: 120 },
  { text: '',                                 result: '',       cls: 'dim',  delay: 80 },
  { text: 'GOODBYE',                          result: '',       cls: 'ready', delay: 360 },
];

function runShutdown() {
  showScreenRaw('shutdown-screen');
  // Fade music out
  const fadeStart = bgm.volume;
  const fadeSteps = 20;
  let step = 0;
  const fadeInt = setInterval(() => {
    step++;
    bgm.volume = Math.max(0, fadeStart * (1 - step / fadeSteps));
    if (step >= fadeSteps) { clearInterval(fadeInt); bgm.pause(); }
  }, 80);

  const log = document.getElementById('shutdown-log');
  const fill = document.getElementById('shutdown-bar-fill');
  const pct = document.getElementById('shutdown-bar-pct');
  const text = document.getElementById('shutdown-bar-text');
  log.innerHTML = '';
  let i = 0;
  const total = SHUTDOWN_LINES.length;

  function step2() {
    if (i >= total) {
      text.textContent = 'OFFLINE';
      pct.textContent = '0%';
      fill.style.width = '0%';
      setTimeout(() => {
        // Try to close the tab; browsers only allow this for windows opened via JS,
        // so fall back to a "you can close this tab" message if it fails.
        window.close();
        setTimeout(() => {
          // If we're still here, window.close() was blocked
          log.innerHTML += '<div><span class="info">connection terminated. </span><span class="warn">you can close this tab.</span></div>';
        }, 200);
      }, 600);
      return;
    }
    const line = SHUTDOWN_LINES[i];
    const span = document.createElement('div');
    if (line.result) {
      span.innerHTML = `<span class="info">${line.text}</span><span class="${line.cls}">[ ${line.result} ]</span>`;
    } else {
      span.innerHTML = `<span class="${line.cls}">${line.text || '&nbsp;'}</span>`;
    }
    log.appendChild(span);
    i++;
    const remain = Math.round(((total - i) / total) * 100);
    fill.style.width = remain + '%';
    pct.textContent = remain + '%';
    setTimeout(step2, line.delay);
  }
  step2();
}

// ============ NEW PROJECT FORM ============
document.getElementById('new-project-create').addEventListener('click', createProject);
document.getElementById('new-project-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); createProject(); }
});

async function createProject() {
  const input = document.getElementById('new-project-name');
  const msg = document.getElementById('new-project-msg');
  const name = input.value.trim();
  msg.className = 'form-msg';
  msg.textContent = '';
  if (!name) {
    msg.textContent = 'project name required';
    msg.classList.add('err');
    return;
  }
  try {
    const r = await fetch('/launcher/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await r.json();
    if (!r.ok) {
      msg.textContent = data.error || 'create failed';
      msg.classList.add('err');
      return;
    }
    msg.textContent = 'created ' + data.project.path;
    msg.classList.add('ok');
    input.value = '';
    state.projects.push(data.project);
    renderProjectGrid();
    setTimeout(() => showScreen('project-screen'), 700);
  } catch (e) {
    msg.textContent = 'network error: ' + e.message;
    msg.classList.add('err');
  }
}

// ============ BACK BUTTONS ============
document.querySelectorAll('[data-back]').forEach(b => {
  b.addEventListener('click', () => showScreen(b.dataset.back));
});
