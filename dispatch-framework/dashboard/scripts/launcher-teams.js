// ============ TEAM PRESETS ============
function renderTeamPresetsGrid() {
  const grid = document.getElementById('team-presets-grid');
  if (!grid) return;
  grid.innerHTML = '';
  state.teamPresets.forEach((preset, i) => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.style.setProperty('--accent', preset.color || '#00FFCC');
    card.dataset.idx = i;
    card.dataset.id = preset.id;
    // Build a compact roster line showing callsigns
    const callsigns = preset.personas
      .map(key => (state.personas[key] && state.personas[key].callsign) || key)
      .join(' \u00b7 ');
    card.innerHTML = `
      <div class="preset-glyph">${escapeHtml(preset.glyph || '#')}</div>
      <div class="preset-body">
        <div class="preset-name">${escapeHtml(preset.name)}</div>
        <div class="preset-sub">${escapeHtml(preset.subtitle || '')}</div>
        <div class="preset-roster"><span class="count">[${preset.personas.length}]</span>${escapeHtml(callsigns)}</div>
      </div>
    `;
    card.addEventListener('click', () => loadTeamPreset(preset));
    card.addEventListener('mouseenter', () => setKbdIndex(i, '#team-presets-grid .preset-card'));
    grid.appendChild(card);
  });
}

function loadTeamPreset(preset) {
  // Pick the right project for the preset
  const project = state.projects.find(p => p.id === preset.project) || state.projects[0];
  if (project) {
    state.currentProject = project;
    document.getElementById('hud-project').textContent = project.name + '  [' + project.path + ']';
    state.filteredPersonas = personasForProject(project);
  }
  renderCharacterGrid();
  // Enable team mode and pre-select the preset's personas
  const teamToggle = document.getElementById('team-mode');
  teamToggle.checked = true;
  setTeamMode(true);
  state.team = preset.personas.filter(k => state.filteredPersonas.some(p => p.key === k));
  refreshTeamBadges();
  refreshTeamLaunchButton();
  // Team presets also gate through mode-select so the operator picks a runtime
  // before the team deploys.
  showScreen('mode-select-screen');
  bindModeCards();
  setTimeout(() => setKbdIndex(0, '#mode-grid .mode-card'), 50);
}

// ============ MUSIC ============
function initBgmSrc() {
  let saved = null;
  try { saved = localStorage.getItem(MUSIC_KEY); } catch {}
  let track = state.tracks.find(t => t.file === saved);
  if (!track) track = state.tracks.find(t => t.file === DEFAULT_TRACK_FILE);
  if (!track && state.tracks.length) track = state.tracks[0];
  if (!track) return;
  state.currentTrack = track;
  bgm.src = track.url;
}

function renderMusicGrid() {
  const grid = document.getElementById('music-grid');
  grid.innerHTML = '';
  state.tracks.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.idx = i;
    card.dataset.file = t.file;
    if (state.currentTrack && state.currentTrack.file === t.file) {
      card.classList.add('now-playing');
    }
    const sizeMb = (t.size / 1024 / 1024).toFixed(1);
    const altTag = t.isAlt ? '<span class="alt">[ ALT ]</span>  ' : '';
    card.innerHTML = `
      <div class="track-glyph">${t.isAlt ? '\u266B' : '\u266A'}</div>
      <div class="track-info">
        <div class="track-title">${escapeHtml(t.title)}</div>
        <div class="track-meta">${altTag}${sizeMb} MB</div>
      </div>
    `;
    card.addEventListener('click', () => selectTrack(t));
    card.addEventListener('mouseenter', () => setKbdIndex(i, '#music-grid .track-card'));
    grid.appendChild(card);
  });
}

function selectTrack(t) {
  state.currentTrack = t;
  try { localStorage.setItem(MUSIC_KEY, t.file); } catch {}
  // Crossfade-ish: fade out, swap, fade in
  const wasPlaying = !bgm.paused && audioStarted;
  const startVol = bgm.volume;
  if (wasPlaying) {
    fadeBgm(0, 250, () => {
      bgm.src = t.url;
      bgm.play().then(() => fadeBgm(startVol, 400)).catch(() => {});
    });
  } else {
    bgm.src = t.url;
    if (audioStarted) bgm.play().catch(() => {});
  }
  // Refresh the grid highlight
  document.querySelectorAll('#music-grid .track-card').forEach(c => {
    c.classList.toggle('now-playing', c.dataset.file === t.file);
  });
}

function fadeBgm(target, duration, done) {
  const start = bgm.volume;
  const steps = Math.max(4, Math.floor(duration / 50));
  let i = 0;
  const iv = setInterval(() => {
    i++;
    bgm.volume = start + (target - start) * (i / steps);
    if (i >= steps) {
      bgm.volume = target;
      clearInterval(iv);
      if (done) done();
    }
  }, duration / steps);
}
