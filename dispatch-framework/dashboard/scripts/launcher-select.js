// ============ ENRICH PERSONA ============
function enrichPersona(key, raw) {
  const stats = STATS[key] || { hp: 75, atk: 70, def: 70, int: 80, class: 'Operator', flavor: raw.description || '' };
  return {
    key,
    name: (raw.callsign || key).toUpperCase(),
    callsign: raw.callsign || key,
    color: raw.color_hex || '#00FFCC',
    glyph: GLYPHS[key] || (raw.callsign || key).charAt(0).toUpperCase(),
    cwd: raw.cwd || '',
    scope: raw.scope || '',
    description: raw.description || '',
    hp: stats.hp, atk: stats.atk, def: stats.def, int: stats.int,
    class: stats.class,
    flavor: stats.flavor || raw.description || '',
  };
}

// ============ FILTER PERSONAS BY PROJECT ============
function personasForProject(project) {
  const all = Object.entries(state.personas).map(([k, v]) => enrichPersona(k, v));
  if (!project || project.id === 'workspace') return all;
  const norm = s => (s || '').toLowerCase().replace(/\\/g, '/');
  const projPath = norm(project.path);
  const projScope = (project.scope || '').toLowerCase();
  return all.filter(p => {
    if (!p.scope.startsWith('project:')) return true;
    // Match by scope tag first (reliable), then fall back to cwd path
    if (projScope && p.scope.toLowerCase() === projScope) return true;
    const cwd = norm(p.cwd);
    if (!cwd) return false;
    return cwd === projPath || cwd.startsWith(projPath + '/');
  });
}

// ============ HUD ============
function refreshHudRuntime() {
  const el = document.getElementById('hud-runtime');
  if (!el) return;
  const labels = { claude: 'CO-OP', opencode: 'LOCAL', vs: 'VS' };
  el.textContent = labels[state.runtime] || state.runtime.toUpperCase();
  el.setAttribute('data-runtime', state.runtime);
}

// ============ MODE SELECT ============
// Wires the three mode-select cards. Idempotent — safe to call multiple times.
// Flow: project-screen -> selectProject() -> mode-select-screen -> select-screen.
// Mode-select gates every path to character-select except CONTINUE (which
// restores last-used runtime via saveLastSession).
let modeCardsBound = false;
function bindModeCards() {
  if (modeCardsBound) return;
  modeCardsBound = true;
  document.querySelectorAll('#mode-grid .mode-card').forEach((card, i) => {
    card.addEventListener('mouseenter', () => setKbdIndex(i, '#mode-grid .mode-card'));
    card.addEventListener('click', () => {
      const mode = card.getAttribute('data-mode');
      state.runtime = mode;
      refreshHudRuntime();
      refreshModelRowState();
      console.log('[MODE-SELECT] runtime =', mode);
      // Render character grid only after runtime is chosen so the deploy
      // overlay text can reflect it (future enhancement).
      if (!state.filteredPersonas || state.filteredPersonas.length === 0) {
        if (state.currentProject) {
          state.filteredPersonas = personasForProject(state.currentProject);
        } else {
          state.filteredPersonas = Object.values(state.personas);
        }
        renderCharacterGrid();
      }
      showScreen('select-screen');
      setTimeout(() => setKbdIndex(0, '#grid .character-card'), 50);
    });
  });
}

// ============ RENDER CHARACTER GRID ============
function renderCharacterGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const sub = document.getElementById('select-sub');
  sub.textContent = '// ' + state.filteredPersonas.length + ' available \u00b7 use mouse or keyboard';

  state.filteredPersonas.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'character-card';
    card.style.setProperty('--accent', p.color);
    card.dataset.key = p.key;
    card.dataset.idx = i;
    card.innerHTML = `
      <div class="team-badge"></div>
      <div class="portrait" data-glyph="${escapeHtml(p.glyph)}"><img src="/launcher/assets/portraits/${encodeURIComponent(p.key)}.png" alt="${escapeHtml(p.glyph)}" onerror="this.parentElement.removeChild(this);this.parentElement.textContent=this.parentElement.dataset.glyph"></div>
      <div class="callsign">${escapeHtml(p.name)}</div>
      <div class="class-tag">${escapeHtml(p.class)}</div>
    `;
    card.addEventListener('mouseenter', () => { showBio(p); setKbdIndex(i, '#grid .character-card'); });
    card.addEventListener('click', () => onPersonaClick(p, card));
    grid.appendChild(card);
  });

  state.selectedPersona = null;
  resetLaunchBtn();
  if (state.filteredPersonas.length > 0) {
    const firstCard = grid.querySelector('.character-card');
    selectPersona(state.filteredPersonas[0], firstCard);
  } else {
    document.getElementById('bio').innerHTML = '<div class="bio-empty">[ NO OPERATIVES ASSIGNED TO THIS PROJECT ]</div>';
  }
}

function showBio(p) {
  const bio = document.getElementById('bio');
  bio.style.setProperty('--accent', p.color);
  bio.style.borderColor = p.color;
  bio.style.boxShadow = `0 0 30px ${p.color}55`;
  bio.innerHTML = `
    <div class="bio-name">${escapeHtml(p.name)}</div>
    <div class="bio-class">CLASS: ${escapeHtml(p.class.toUpperCase())} \u00b7 SCOPE: ${escapeHtml(p.scope || '-')}</div>
    <div class="bio-stats">
      <div class="bio-stat"><span class="bio-stat-label">CPU</span><span class="bio-stat-value">${p.hp}</span></div>
      <div class="bio-stat"><span class="bio-stat-label">MEM</span><span class="bio-stat-value">${p.atk}</span></div>
      <div class="bio-stat"><span class="bio-stat-label">NET</span><span class="bio-stat-value">${p.def}</span></div>
      <div class="bio-stat"><span class="bio-stat-label">SEC</span><span class="bio-stat-value">${p.int}</span></div>
    </div>
    <div class="bio-flavor">${escapeHtml(p.flavor)}</div>
  `;
  updatePortraitPanel(p);
}

function updatePortraitPanel(p, locked) {
  const panel = document.getElementById('portrait-panel');
  panel.style.setProperty('--accent', p.color);
  const avatar = document.getElementById('portrait-avatar');
  // Try the pixel-art portrait first; fall back to the glyph if it 404s
  avatar.innerHTML = `<img src="/launcher/assets/portraits/${p.key}.png" alt="${p.name}" onerror="this.parentElement.textContent='${p.glyph}'">`;
  document.getElementById('portrait-name').textContent = p.name;
  document.getElementById('portrait-class').textContent = p.class.toUpperCase();
  document.getElementById('ps-cpu').textContent = p.hp;
  document.getElementById('ps-mem').textContent = p.atk;
  document.getElementById('ps-net').textContent = p.def;
  document.getElementById('ps-sec').textContent = p.int;
  const status = document.getElementById('portrait-status');
  const tag = document.getElementById('portrait-tag');
  if (locked) {
    status.textContent = '> LOCKED IN <';
    status.classList.add('ready');
    tag.textContent = '// READY //';
  } else {
    status.textContent = 'STANDBY';
    status.classList.remove('ready');
    tag.textContent = '// NOW SELECTING //';
  }
}

function onPersonaClick(p, card) {
  if (state.teamMode) {
    toggleTeamMember(p, card);
  } else {
    selectPersona(p, card);
  }
}

function selectPersona(p, card) {
  document.querySelectorAll('#grid .character-card.selected').forEach(c => c.classList.remove('selected'));
  if (card) card.classList.add('selected');
  state.selectedPersona = p;
  const btn = document.getElementById('launch-btn');
  btn.disabled = false;
  btn.style.borderColor = p.color;
  btn.style.color = p.color;
  btn.style.textShadow = `0 0 10px ${p.color}`;
  btn.style.boxShadow = `0 0 20px ${p.color}55`;
  btn.textContent = `[ DEPLOY ${p.name} ]`;
  showBio(p);
  updatePortraitPanel(p, true);
}

function toggleTeamMember(p, card) {
  const idx = state.team.indexOf(p.key);
  if (idx >= 0) {
    state.team.splice(idx, 1);
  } else {
    state.team.push(p.key);
  }
  // Most recently touched persona shows in portrait panel + bio
  state.selectedPersona = p;
  showBio(p);
  updatePortraitPanel(p, idx < 0);
  refreshTeamBadges();
  refreshTeamLaunchButton();
}

function refreshTeamBadges() {
  document.querySelectorAll('#grid .character-card').forEach((c) => {
    const key = c.dataset.key;
    const order = state.team.indexOf(key);
    const badge = c.querySelector('.team-badge');
    if (order >= 0) {
      c.classList.add('in-team');
      if (badge) badge.textContent = String(order + 1);
    } else {
      c.classList.remove('in-team');
      if (badge) badge.textContent = '';
    }
  });
}

function refreshTeamLaunchButton() {
  const btn = document.getElementById('launch-btn');
  if (!state.teamMode) return;
  if (state.team.length === 0) {
    btn.disabled = true;
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.style.textShadow = '';
    btn.style.boxShadow = '';
    btn.textContent = '[ DEPLOY TEAM (0) ]';
    return;
  }
  btn.disabled = false;
  btn.style.borderColor = 'var(--neon-yellow)';
  btn.style.color = 'var(--neon-yellow)';
  btn.style.textShadow = '0 0 10px var(--neon-yellow)';
  btn.style.boxShadow = '0 0 22px rgba(255, 215, 0, 0.5)';
  btn.textContent = `[ DEPLOY TEAM (${state.team.length}) ]`;
}

function setTeamMode(on) {
  state.teamMode = on;
  if (on) {
    refreshTeamBadges();
    refreshTeamLaunchButton();
  } else {
    state.team = [];
    document.querySelectorAll('#grid .character-card').forEach((c) => {
      c.classList.remove('in-team');
      const badge = c.querySelector('.team-badge');
      if (badge) badge.textContent = '';
    });
    // Restore single-persona launch button
    if (state.selectedPersona) {
      selectPersona(state.selectedPersona, document.querySelector(`#grid .character-card[data-key="${state.selectedPersona.key}"]`));
    } else {
      resetLaunchBtn();
    }
  }
}

function resetLaunchBtn() {
  const btn = document.getElementById('launch-btn');
  btn.disabled = true;
  btn.style.borderColor = '';
  btn.style.color = '';
  btn.style.textShadow = '';
  btn.style.boxShadow = '';
  btn.textContent = '[ DEPLOY ]';
}

// ============ LAUNCH ============
document.getElementById('launch-btn').addEventListener('click', launchSelected);

async function launchSelected() {
  if (state.teamMode && state.team.length > 0) {
    return launchTeam();
  }
  console.log('[DEPLOY] clicked', { selected: state.selectedPersona });
  if (!state.selectedPersona) {
    console.warn('[DEPLOY] no persona selected, aborting');
    return;
  }
  const persona = state.selectedPersona;
  const dangerous = document.getElementById('dangerous-mode').checked;
  const prompt = document.getElementById('initial-prompt').value.trim();
  const overlay = document.getElementById('overlay');
  const text = document.getElementById('overlay-text');
  const sub = document.getElementById('overlay-sub');
  const fill = document.getElementById('overlay-bar-fill');
  const isBrowser = selectedTransport() === 'browser';
  overlay.classList.remove('error');
  text.textContent = isBrowser ? 'JACKING IN...' : 'DEPLOYING...';
  sub.textContent = isBrowser ? 'opening browser terminal' : 'uplink to ' + persona.name;
  fill.style.animation = 'none';
  void fill.offsetWidth;
  fill.style.animation = 'load-bar 1.6s ease-out forwards';
  // Cache-bust the splash GIF so the animation restarts cleanly each deploy.
  const splash = document.getElementById('overlay-splash');
  splash.src = '/launcher/assets/loading/deploy-default.gif?t=' + Date.now();
  splash.classList.add('show');
  overlay.classList.add('show');
  console.log('[DEPLOY] overlay shown, posting to /launcher/launch');

  // Duck background music and play the persona intro
  playPersonaIntro(persona.key);

  try {
    // Steam Deck launcher script appends ?deck=1 so the dashboard can
    // tighten persona output to fit the handheld reading area.
    const deckMode = new URLSearchParams(location.search).get('deck') === '1';
    const r = await fetch('/launcher/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persona: persona.key,
        project: state.currentProject ? state.currentProject.id : null,
        dangerous,
        prompt,
        transport: selectedTransport(),
        runtime: state.runtime,
        model: state.selectedModel || '',
        deckMode,
      }),
    });
    console.log('[DEPLOY] response status', r.status);
    const data = await r.json();
    console.log('[DEPLOY] response body', data);
    if (!r.ok || !data.ok) {
      overlay.classList.add('error');
      text.textContent = 'DEPLOY FAILED';
      sub.textContent = data.error || 'unknown error';
      setTimeout(() => overlay.classList.remove('show'), 4000);
      return;
    }
    // Save successful deploy as the continue point
    if (state.currentProject) {
      saveLastSession(state.currentProject.id, persona.key);
      refreshContinueLabel();
    }
    if (data.transport === 'browser' && data.session_id) {
      setTimeout(() => {
        overlay.classList.remove('show');
        createTerminalSession(data.session_id, data.ws_path, data.callsign || persona.name, persona.color, persona.key);
      }, 700);
      return;
    }
    setTimeout(() => {
      text.textContent = 'UPLINK ACTIVE';
      sub.textContent = persona.callsign + ' on the wire';
    }, 1600);
    setTimeout(() => overlay.classList.remove('show'), 3500);
  } catch (e) {
    console.error('[DEPLOY] network error', e);
    overlay.classList.add('error');
    text.textContent = 'NETWORK ERROR';
    sub.textContent = e.message;
    setTimeout(() => overlay.classList.remove('show'), 4000);
  }
}

async function launchTeam() {
  console.log('[TEAM DEPLOY]', state.team);
  const overlay = document.getElementById('overlay');
  const text = document.getElementById('overlay-text');
  const sub = document.getElementById('overlay-sub');
  const fill = document.getElementById('overlay-bar-fill');
  const dangerous = document.getElementById('dangerous-mode').checked;
  const prompt = document.getElementById('initial-prompt').value.trim();

  overlay.classList.remove('error');
  text.textContent = 'DEPLOYING TEAM...';
  sub.textContent = `${state.team.length} operatives jacking in`;
  fill.style.animation = 'none';
  void fill.offsetWidth;
  fill.style.animation = 'load-bar 2.4s ease-out forwards';
  // Cache-bust so the deploy animation restarts each time.
  const splash = document.getElementById('overlay-splash');
  splash.src = '/launcher/assets/loading/deploy-default.gif?t=' + Date.now();
  splash.classList.add('show');
  overlay.classList.add('show');

  // Queue all team members' short deploy stubs back-to-back
  playTeamDeploySequence(state.team);

  try {
    const r = await fetch('/launcher/launch-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personas: state.team,
        project: state.currentProject ? state.currentProject.id : null,
        dangerous,
        prompt,
        transport: selectedTransport(),
        runtime: state.runtime,
        model: state.selectedModel || '',
      }),
    });
    const data = await r.json();
    console.log('[TEAM DEPLOY] response', r.status, data);
    if (!r.ok || !data.ok) {
      overlay.classList.add('error');
      text.textContent = 'TEAM DEPLOY FAILED';
      sub.textContent = data.error || 'unknown error';
      setTimeout(() => overlay.classList.remove('show'), 4000);
      return;
    }
    // Save the last team member as the continue point so CONTINUE re-loads someone meaningful
    if (state.currentProject && state.team.length) {
      saveLastSession(state.currentProject.id, state.team[state.team.length - 1]);
      refreshContinueLabel();
    }
    setTimeout(() => {
      text.textContent = 'TEAM DEPLOYED';
      sub.textContent = data.deployed.map(d => d.callsign).join(' \u00b7 ');
    }, 2000);
    setTimeout(() => overlay.classList.remove('show'), 4500);
  } catch (e) {
    console.error('[TEAM DEPLOY] network error', e);
    overlay.classList.add('error');
    text.textContent = 'NETWORK ERROR';
    sub.textContent = e.message;
    setTimeout(() => overlay.classList.remove('show'), 4000);
  }
}

// Wire the team-mode toggle
document.getElementById('team-mode').addEventListener('change', (e) => {
  setTeamMode(e.target.checked);
});
