const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { renderAudioFeedPage } = require('./audio-feed-page.cjs');

// ============================================================
// Configuration via environment variables
// ============================================================
const PORT = Number(process.env.DISPATCH_PORT) || 3045;
const DISPATCH_ROOT = process.env.DISPATCH_ROOT || path.join(__dirname, '..');
const STATE_DIR = process.env.DISPATCH_STATE_DIR || path.join(DISPATCH_ROOT, 'state');
const TTS_OUTPUT_DIR = process.env.DISPATCH_TTS_OUTPUT || path.join(DISPATCH_ROOT, 'tts-output');
const PERSONAS_PATH = process.env.DISPATCH_PERSONAS_JSON || path.join(DISPATCH_ROOT, 'personas', 'personas.json');
const LAUNCHER_HTML = path.join(__dirname, 'launcher.html');
const LAUNCHER_ASSETS = process.env.DISPATCH_LAUNCHER_ASSETS || path.join(__dirname, 'launcher-assets');
const TEAM_PRESETS_PATH = process.env.DISPATCH_TEAM_PRESETS || path.join(__dirname, 'team-presets.json');
const ACTIVE_PROJECTS_DIR = process.env.DISPATCH_PROJECTS_DIR || '';
const WORKSPACE_ROOT = process.env.DISPATCH_WORKSPACE_ROOT || DISPATCH_ROOT;
const LAUNCH_SCRIPT_PS1 = path.join(DISPATCH_ROOT, 'scripts', 'launch-persona.ps1');
const LAUNCH_SCRIPT_SH = path.join(DISPATCH_ROOT, 'scripts', 'launch-persona.sh');
const IS_WINDOWS = process.platform === 'win32';

const ASSET_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.html': 'text/html; charset=utf-8',
};

// Ensure state directory exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

const SOURCES = [
  'actions', 'dispatch-log', 'calendar', 'escalations', 'followups',
  'project-summary', 'inbox-flags', 'state-meta', 'morning-pipeline',
  'pulse-log', 'weather', 'job-board',
];

function loadState() {
  const state = {};
  for (const s of SOURCES) {
    const fp = path.join(STATE_DIR, `${s}.json`);
    try {
      state[s] = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch {
      state[s] = null;
    }
  }
  return state;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ============================================================
// Helpers
// ============================================================
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) { req.destroy(); reject(new Error('payload too large')); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function slugifyProjectName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// ============================================================
// Projects discovery
// ============================================================
function listProjects() {
  const projects = [
    {
      id: 'workspace',
      name: 'WORKSPACE ROOT',
      path: WORKSPACE_ROOT,
      scope: 'workspace',
      description: 'Workspace root. All personas available.',
    },
  ];
  // Scan ACTIVE_PROJECTS_DIR if configured
  if (ACTIVE_PROJECTS_DIR && fs.existsSync(ACTIVE_PROJECTS_DIR)) {
    try {
      const entries = fs.readdirSync(ACTIVE_PROJECTS_DIR, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('.')) continue;
        projects.push({
          id: e.name,
          name: e.name.toUpperCase().replace(/-/g, ' '),
          path: path.join(ACTIVE_PROJECTS_DIR, e.name),
          scope: `project:${e.name}`,
          description: `Active project at ${path.join(ACTIVE_PROJECTS_DIR, e.name)}`,
        });
      }
    } catch {}
  }
  return projects;
}

// ============================================================
// Persona spawning (cross-platform)
// ============================================================
function spawnPersona(personaKey, initialPrompt) {
  if (IS_WINDOWS) {
    // Route through `cmd /c start` so the powershell child survives long enough
    // to call Start-Process wt and open a new Windows Terminal tab.
    const args = [
      '/c', 'start', '""', '/b',
      'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', LAUNCH_SCRIPT_PS1, personaKey,
    ];
    if (initialPrompt) args.push(initialPrompt);
    const child = spawn('cmd.exe', args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } else {
    // Linux / macOS — use the shell launcher
    const args = [LAUNCH_SCRIPT_SH, personaKey];
    if (initialPrompt) args.push(initialPrompt);
    const child = spawn('/bin/sh', args, { detached: true, stdio: 'ignore' });
    child.unref();
  }
}

// ============================================================
// Launcher handler
// ============================================================
function handleLauncher(req, res, url) {
  const method = req.method || 'GET';

  if (url === '/launcher' || url === '/launcher/') {
    try {
      const html = fs.readFileSync(LAUNCHER_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Launcher HTML not found: ' + e.message);
    }
    return true;
  }

  if (url.startsWith('/launcher/assets/') && method === 'GET') {
    const relRaw = decodeURIComponent(url.slice('/launcher/assets/'.length));
    const safeRel = path.normalize(relRaw).replace(/^([\\/])+/, '');
    if (safeRel.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return true;
    }
    const filePath = path.join(LAUNCHER_ASSETS, safeRel);
    if (!filePath.startsWith(LAUNCHER_ASSETS)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return true;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('asset not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime = ASSET_MIME[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400',
      });
      fs.createReadStream(filePath).pipe(res);
    });
    return true;
  }

  if (url === '/launcher/personas' && method === 'GET') {
    try {
      const data = fs.readFileSync(PERSONAS_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (e) {
      sendJson(res, 500, { error: 'failed to read personas.json', detail: e.message });
    }
    return true;
  }

  if (url === '/launcher/projects' && method === 'GET') {
    sendJson(res, 200, { projects: listProjects() });
    return true;
  }

  if (url === '/launcher/team-presets' && method === 'GET') {
    try {
      const data = fs.readFileSync(TEAM_PRESETS_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch {
      // Return empty preset list if file missing — valid for fresh installs
      sendJson(res, 200, { presets: [] });
    }
    return true;
  }

  if (url === '/launcher/music' && method === 'GET') {
    const musicDir = path.join(LAUNCHER_ASSETS, 'music');
    let tracks = [];
    try {
      tracks = fs.readdirSync(musicDir)
        .filter((f) => f.toLowerCase().endsWith('.mp3'))
        .sort()
        .map((f) => {
          const stat = fs.statSync(path.join(musicDir, f));
          const title = f.replace(/\.mp3$/i, '');
          return {
            file: f,
            title,
            url: '/launcher/assets/music/' + encodeURIComponent(f),
            size: stat.size,
          };
        });
    } catch {}
    sendJson(res, 200, { tracks });
    return true;
  }

  if (url === '/launcher/projects' && method === 'POST') {
    readJsonBody(req).then((body) => {
      if (!ACTIVE_PROJECTS_DIR) {
        return sendJson(res, 400, { error: 'DISPATCH_PROJECTS_DIR env var not set — cannot create new projects' });
      }
      const slug = slugifyProjectName(body.name);
      if (!slug) return sendJson(res, 400, { error: 'invalid project name' });
      const target = path.join(ACTIVE_PROJECTS_DIR, slug);
      if (fs.existsSync(target)) return sendJson(res, 409, { error: 'project already exists', id: slug });
      try {
        fs.mkdirSync(target, { recursive: false });
        sendJson(res, 200, {
          ok: true,
          project: {
            id: slug,
            name: slug.toUpperCase().replace(/-/g, ' '),
            path: target,
            scope: `project:${slug}`,
          },
        });
      } catch (e) {
        sendJson(res, 500, { error: 'mkdir failed', detail: e.message });
      }
    }).catch((e) => sendJson(res, 400, { error: 'bad body', detail: e.message }));
    return true;
  }

  if (url === '/launcher/launch' && method === 'POST') {
    readJsonBody(req).then((body) => {
      const personaKey = String(body.persona || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!personaKey) return sendJson(res, 400, { error: 'persona required' });
      let registry;
      try {
        registry = JSON.parse(fs.readFileSync(PERSONAS_PATH, 'utf8'));
      } catch (e) {
        return sendJson(res, 500, { error: 'failed to read personas', detail: e.message });
      }
      if (!registry.personas || !registry.personas[personaKey]) {
        return sendJson(res, 404, { error: 'unknown persona', persona: personaKey });
      }
      const initialPrompt = typeof body.prompt === 'string' ? body.prompt : '';
      try {
        spawnPersona(personaKey, initialPrompt);
        sendJson(res, 200, { ok: true, persona: personaKey, callsign: registry.personas[personaKey].callsign });
      } catch (e) {
        sendJson(res, 500, { error: 'spawn failed', detail: e.message });
      }
    }).catch((e) => sendJson(res, 400, { error: 'bad body', detail: e.message }));
    return true;
  }

  if (url === '/launcher/launch-team' && method === 'POST') {
    readJsonBody(req).then((body) => {
      const rawList = Array.isArray(body.personas) ? body.personas : [];
      const keys = rawList
        .map((k) => String(k || '').toLowerCase().replace(/[^a-z0-9_-]/g, ''))
        .filter(Boolean);
      if (!keys.length) return sendJson(res, 400, { error: 'personas array required' });
      let registry;
      try {
        registry = JSON.parse(fs.readFileSync(PERSONAS_PATH, 'utf8'));
      } catch (e) {
        return sendJson(res, 500, { error: 'failed to read personas', detail: e.message });
      }
      const unknown = keys.filter((k) => !registry.personas || !registry.personas[k]);
      if (unknown.length) return sendJson(res, 404, { error: 'unknown personas', unknown });

      const initialPrompt = typeof body.prompt === 'string' ? body.prompt : '';
      const deployed = [];
      keys.forEach((k, i) => {
        setTimeout(() => {
          try { spawnPersona(k, initialPrompt); }
          catch (e) { console.error('team spawn failed for', k, e.message); }
        }, i * 700);
        deployed.push({ persona: k, callsign: registry.personas[k].callsign });
      });
      sendJson(res, 200, { ok: true, deployed, stagger_ms: 700 });
    }).catch((e) => sendJson(res, 400, { error: 'bad body', detail: e.message }));
    return true;
  }

  return false;
}

// ============================================================
// Audio feed handler
// ============================================================
function listAudioFiles() {
  try {
    if (!fs.existsSync(TTS_OUTPUT_DIR)) return [];
    return fs.readdirSync(TTS_OUTPUT_DIR)
      .filter((f) => f.toLowerCase().endsWith('.mp3'))
      .map((f) => {
        const full = path.join(TTS_OUTPUT_DIR, f);
        const stat = fs.statSync(full);
        return { filename: f, size: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime);
  } catch {
    return [];
  }
}

function handleAudioFeed(req, res, url) {
  if (url === '/audio-feed' || url === '/audio-feed/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderAudioFeedPage());
    return true;
  }
  if (url === '/audio-feed/list') {
    sendJson(res, 200, { files: listAudioFiles() });
    return true;
  }
  if (url.startsWith('/audio-feed/mp3/')) {
    const filename = decodeURIComponent(url.substring('/audio-feed/mp3/'.length));
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('bad filename');
      return true;
    }
    const full = path.join(TTS_OUTPUT_DIR, filename);
    if (!fs.existsSync(full)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return true;
    }
    const stat = fs.statSync(full);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=3600',
    });
    fs.createReadStream(full).pipe(res);
    return true;
  }
  return false;
}

// ============================================================
// Main dashboard renderer (unchanged from previous version)
// ============================================================
function renderMainDashboard() {
  const state = loadState();
  const actionCount = (state.actions?.personal?.length || 0) + (state.actions?.goals?.length || 0);
  const eventCount = state.calendar?.agenda?.length || 0;
  const escalations = state.escalations?.pending?.length || 0;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>// MULTIDECK OPS //</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'VT323', monospace;
    background: #0a0014;
    color: #c0e0ff;
    min-height: 100vh;
    padding: 24px;
    overflow-x: hidden;
  }
  body::before {
    content: '';
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: repeating-linear-gradient(0deg, rgba(0,255,204,0.03) 0, rgba(0,255,204,0.03) 1px, transparent 1px, transparent 3px);
    pointer-events: none; z-index: 9999;
  }
  h1 {
    font-family: 'Press Start 2P', monospace;
    font-size: 20px;
    color: #00FFCC;
    text-shadow: 0 0 10px #00FFCC;
    letter-spacing: 3px;
    margin-bottom: 20px;
  }
  h2 {
    font-family: 'Press Start 2P', monospace;
    font-size: 11px;
    color: #FF00AA;
    letter-spacing: 2px;
    text-shadow: 0 0 6px #FF00AA;
    margin-top: 30px;
    margin-bottom: 12px;
  }
  .card {
    border: 1px solid #1a2a3a;
    padding: 16px;
    margin: 10px 0;
    background: rgba(10,20,30,0.6);
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 20px;
  }
  .stat {
    font-family: 'Press Start 2P', monospace;
    font-size: 22px;
    color: #00FFCC;
    text-shadow: 0 0 8px #00FFCC;
  }
  .stat.red { color: #FF3366; text-shadow: 0 0 8px #FF3366; }
  .stat-label {
    font-size: 14px;
    color: #607090;
    margin-top: 6px;
    letter-spacing: 1px;
  }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid #00FFCC;
    color: #00FFCC;
    font-size: 13px;
    letter-spacing: 1px;
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #1a2a3a;
    font-size: 18px;
  }
  tr:hover { background: rgba(0,255,204,0.05); }
  .muted { color: #607090; font-size: 16px; }
  a { color: #00FFCC; text-decoration: none; }
  a:hover { text-shadow: 0 0 6px #00FFCC; }
  .nav { margin-bottom: 24px; display: flex; gap: 8px; flex-wrap: wrap; }
  .nav a {
    font-family: 'Press Start 2P', monospace;
    font-size: 9px;
    padding: 10px 16px;
    border: 1px solid #607090;
    color: #c0e0ff;
    letter-spacing: 1px;
    transition: all 0.2s;
  }
  .nav a:hover, .nav a.active {
    border-color: #00FFCC;
    color: #00FFCC;
    text-shadow: 0 0 6px #00FFCC;
    background: rgba(0,255,204,0.08);
  }
  footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #1a2a3a;
    color: #607090;
    font-size: 13px;
  }
</style>
</head>
<body>
<h1>// MULTIDECK OPS //</h1>
<div class="nav">
  <a href="/" class="active">OPS</a>
  <a href="/launcher">LAUNCHER</a>
  <a href="/briefing">BRIEFING</a>
  <a href="/audio-feed">AUDIO FEED</a>
  <a href="/state.json">STATE</a>
</div>
<div class="card">
  <div class="stats-grid">
    <div><div class="stat">${actionCount}</div><div class="stat-label">ACTION ITEMS</div></div>
    <div><div class="stat">${eventCount}</div><div class="stat-label">EVENTS TODAY</div></div>
    <div><div class="stat ${escalations > 0 ? 'red' : ''}">${escalations}</div><div class="stat-label">ESCALATIONS</div></div>
  </div>
</div>
<h2>// ACTIONS</h2>
<div class="card">
  ${state.actions && state.actions.personal && state.actions.personal.length > 0
    ? '<table>' + state.actions.personal.map(a => `<tr><td><strong>${esc(a.what)}</strong></td><td class="muted">${esc(a.due || '-')}</td></tr>`).join('') + '</table>'
    : '<div class="muted">No action items.</div>'
  }
</div>
<h2>// SCHEDULE</h2>
<div class="card">
  ${state.calendar && state.calendar.agenda && state.calendar.agenda.length > 0
    ? '<table>' + state.calendar.agenda.map(e => `<tr><td>${esc(e.time)}</td><td><strong>${esc(e.title)}</strong></td><td class="muted">${esc(e.duration_min || '-')} min</td></tr>`).join('') + '</table>'
    : '<div class="muted">No events scheduled.</div>'
  }
</div>
<h2>// WEATHER</h2>
<div class="card">
  ${state.weather && state.weather.current
    ? `<div>${esc(state.weather.current.temperature_f)}&deg;F &mdash; ${esc(state.weather.current.description)}</div>`
    : '<div class="muted">No weather data available.</div>'
  }
</div>
<footer>
  <p>MultiDeck Framework // State: ${esc(STATE_DIR)}</p>
</footer>
</body>
</html>`;
}

function renderBriefing() {
  const state = loadState();
  const briefingData = state['morning-pipeline'] || {};
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Morning Briefing</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { color: #0088FF; }
  h2 { border-bottom: 2px solid #0088FF; padding-bottom: 8px; }
  pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
</style>
</head>
<body>
<h1>Morning Briefing</h1>
<p><a href="/">Back to Dashboard</a></p>
<pre>${esc(JSON.stringify(briefingData, null, 2))}</pre>
</body>
</html>`;
}

// ============================================================
// Router
// ============================================================
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  res.setHeader('Access-Control-Allow-Origin', '*');

  // Launcher routes handled first
  if (handleLauncher(req, res, url)) return;

  // Audio feed routes
  if (handleAudioFeed(req, res, url)) return;

  // Core dashboard routes
  if (url === '/' || url === '/desktop' || url === '/desktop/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderMainDashboard());
    return;
  }
  if (url === '/briefing' || url === '/briefing/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderBriefing());
    return;
  }
  if (url === '/state.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadState(), null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found. Try / or /launcher or /audio-feed or /briefing or /state.json');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MultiDeck Dashboard running on http://localhost:${PORT}`);
  console.log(`  /                        Main dashboard`);
  console.log(`  /launcher                MultiDeck launcher (cyberpunk character select)`);
  console.log(`  /briefing                Morning briefing`);
  console.log(`  /audio-feed              Auto-play Kokoro TTS feed`);
  console.log(`  /state.json              Raw state data`);
  console.log(``);
  console.log(`  State directory: ${STATE_DIR}`);
  console.log(`  Personas registry: ${PERSONAS_PATH}`);
  console.log(`  TTS output: ${TTS_OUTPUT_DIR}`);
});
