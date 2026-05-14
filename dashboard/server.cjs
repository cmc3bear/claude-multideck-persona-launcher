const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const { renderAudioFeedPage } = require('./audio-feed-page.cjs');
const { renderJobBoardPage } = require('./job-board-page.cjs');

// ============================================================
// Configuration via environment variables
// ============================================================
const PORT = Number(process.env.DISPATCH_PORT) || 3046;
const DISPATCH_ROOT = process.env.DISPATCH_ROOT || path.join(__dirname, '..');
const STATE_DIR = (process.env.DISPATCH_STATE_DIR || path.join(DISPATCH_ROOT, 'state')).trim();
const TTS_OUTPUT_DIR = process.env.DISPATCH_TTS_OUTPUT || path.join(DISPATCH_ROOT, 'tts-output');
const PERSONAS_PATH = process.env.DISPATCH_PERSONAS_JSON || path.join(DISPATCH_ROOT, 'personas', 'personas.json');
const LAUNCHER_HTML = path.join(__dirname, 'launcher.html');
const LAUNCHER_ASSETS = process.env.DISPATCH_LAUNCHER_ASSETS || path.join(__dirname, 'launcher-assets');
// MULTI-FEAT-0067: claude.design Job Board Dashboard assets
const JOB_BOARD_DASHBOARD_HTML = path.join(__dirname, 'job-board-dashboard.html');
const BUILDER_HTML = path.join(__dirname, 'builder.html');
const DASHBOARD_SCRIPTS = path.join(__dirname, 'scripts');
const DASHBOARD_STYLES = path.join(__dirname, 'styles');
const DASHBOARD_DATA = path.join(__dirname, 'data');
const TEAM_PRESETS_PATH = process.env.DISPATCH_TEAM_PRESETS || path.join(__dirname, 'team-presets.json');
const ACTIVE_PROJECTS_DIR = process.env.DISPATCH_PROJECTS_DIR || '';
const WORKSPACE_ROOT = process.env.DISPATCH_WORKSPACE_ROOT || DISPATCH_ROOT;
const LAUNCH_SCRIPT_PS1 = path.join(DISPATCH_ROOT, 'scripts', 'launch-persona.ps1');
const LAUNCH_SCRIPT_SH = path.join(DISPATCH_ROOT, 'scripts', 'launch-persona.sh');
const LAUNCH_SCRIPT_TMUX = path.join(DISPATCH_ROOT, 'scripts', 'launch-persona-tmux.sh');
const LAUNCH_SCRIPT_OPENCODE_PS1 = path.join(DISPATCH_ROOT, 'scripts', 'launch-persona-opencode.ps1');
const VALID_RUNTIMES = ['claude', 'opencode', 'vs'];
const DEFAULT_RUNTIME = 'claude';
const OPENCODE_CONFIG_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config', 'opencode', 'opencode.json'
);
const KOKORO_QUEUE_STATS = path.join(DISPATCH_ROOT, 'hooks', '.kokoro-queue', 'stats.json');
const KOKORO_QUEUE_ROOT = path.join(DISPATCH_ROOT, 'hooks', '.kokoro-queue');
const IS_WINDOWS = process.platform === 'win32';

// Browser terminal session state
const pendingSessions = new Map(); // sessionId → { personaKey, prompt, runtime }
const activeSessions  = new Map(); // sessionId → { ws, proc }

// Transport selection — wt (Windows Terminal) or tmux (WSL Ubuntu).
//
// Default resolution (MULTI-FEAT-0063, operator decision 2026-04-26):
//   1. If DISPATCH_LAUNCHER_TRANSPORT is set, that wins (explicit operator override).
//   2. Otherwise, auto-detect: tmux when WSL+tmux+claude all present (i.e.
//      WSL_AVAILABILITY_REASON === 'available'), else wt on Windows, else sh.
//
// Auto-detect honours R3 from MULTI-FEAT-0055 feasibility — operators without
// WSL keep the wt path with no broken-default surprise. The env var remains
// the rollback knob: set DISPATCH_LAUNCHER_TRANSPORT=wt to force the legacy
// path even on a host that could run tmux.
//
// DEFAULT_TRANSPORT is assigned after the WSL probe runs (see below) so that
// auto-detect can read WSL_AVAILABILITY_REASON. Until then it is undefined.
const ENV_TRANSPORT = (process.env.DISPATCH_LAUNCHER_TRANSPORT || '').toLowerCase();
let DEFAULT_TRANSPORT;

// Detect WSL Ubuntu, tmux, and claude availability at server boot. The tmux
// transport requires all three; the dashboard surfaces the specific failure
// mode via availability_reason on GET /launcher/transports so the UI can
// explain why the toggle is hidden (MULTI-UI-0064).
//
// availability_reason values:
//   'available'                       — all checks pass; tmux is selectable
//   'wsl-not-detected'                — wsl.exe -d Ubuntu probe failed
//   'wsl-detected-tmux-missing'       — WSL up but `command -v tmux` returns nothing
//   'tmux-installed-but-no-claude'    — WSL+tmux up but `command -v claude` returns nothing
//   'platform-not-windows'            — not running on Windows; tmux path is Windows-only
let WSL_AVAILABLE = false;
let WSL_AVAILABILITY_REASON = IS_WINDOWS ? 'wsl-not-detected' : 'platform-not-windows';
if (IS_WINDOWS) {
  try {
    const { execFileSync } = require('child_process');
    // Single probe: confirms WSL Ubuntu is up AND captures whether tmux + claude
    // are on PATH. Login shell (bash -lc) so user PATH from .profile is loaded —
    // claude is typically installed under ~/.local/bin which only resolves under
    // a login shell.
    // 10s — first wsl invocation after a reboot can cold-start the VM
    const out = execFileSync(
      'wsl.exe',
      ['-d', 'Ubuntu', '--', 'bash', '-lc', 'command -v tmux; command -v claude'],
      { encoding: 'utf8', timeout: 10000 }
    ).split('\n').map(s => s.trim()).filter(Boolean);
    const tmuxOk = out.some(s => s.endsWith('/tmux') || s === 'tmux');
    const claudeOk = out.some(s => s.endsWith('/claude') || s === 'claude');
    if (!tmuxOk) {
      WSL_AVAILABILITY_REASON = 'wsl-detected-tmux-missing';
    } else if (!claudeOk) {
      WSL_AVAILABILITY_REASON = 'tmux-installed-but-no-claude';
    } else {
      WSL_AVAILABLE = true;
      WSL_AVAILABILITY_REASON = 'available';
    }
    if (!WSL_AVAILABLE) {
      console.warn(`[launcher] WSL up but tmux transport unavailable: ${WSL_AVAILABILITY_REASON}`);
    }
  } catch (e) {
    WSL_AVAILABLE = false;
    WSL_AVAILABILITY_REASON = 'wsl-not-detected';
    console.warn('[launcher] WSL Ubuntu probe failed; tmux transport disabled:', e.message);
  }
}

// Resolve DEFAULT_TRANSPORT now that the WSL probe is done (MULTI-FEAT-0063).
if (ENV_TRANSPORT) {
  DEFAULT_TRANSPORT = ENV_TRANSPORT;
} else if (IS_WINDOWS) {
  DEFAULT_TRANSPORT = WSL_AVAILABLE ? 'tmux' : 'wt';
} else {
  DEFAULT_TRANSPORT = 'sh';
}
console.log(`[launcher] DEFAULT_TRANSPORT=${DEFAULT_TRANSPORT}`
  + (ENV_TRANSPORT ? ' (env override)' : ` (auto-detected; reason=${WSL_AVAILABILITY_REASON})`));

// Convert F:\path or F:/path → /mnt/f/path for WSL invocations
function toWslPath(p) {
  const m = String(p).match(/^([A-Za-z]):[\\/](.*)$/);
  if (!m) return p;
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`;
}

function transportAvailable(xport) {
  const x = String(xport || '').toLowerCase();
  if (x === 'wt') return IS_WINDOWS;
  if (x === 'tmux') return IS_WINDOWS && WSL_AVAILABLE;
  if (x === 'sh') return !IS_WINDOWS;
  if (x === 'browser') return true;
  return false;
}

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

// ============================================================
// Live state for the claude.design Job Board Dashboard
// (MULTI-FEAT-0067) — exposes a multi-board + lessons bundle
// for data/live.js to consume via /state.json.
// ============================================================
const JOB_BOARD_SOURCES_PATH = path.join(STATE_DIR, 'job-board-sources.json');

function discoverJobBoards() {
  // Pick up every state/job-board*.json (excluding .bak/.backup snapshots)
  // and return them as a {projectKey: {jobs, meta}} map. Project key is
  // derived from the file stem ("job-board-multideck.json" -> "multideck",
  // "job-board.json" -> "workspace").
  const out = {};
  let entries = [];
  try {
    entries = fs.readdirSync(STATE_DIR);
  } catch {
    return out;
  }
  for (const file of entries) {
    if (!file.startsWith('job-board') || !file.endsWith('.json')) continue;
    if (/\.bak[-.]/i.test(file) || /\.backup[-.]/i.test(file)) continue;
    if (file === 'job-board-sources.json') continue;
    let key;
    if (file === 'job-board.json') key = 'workspace';
    else {
      const m = file.match(/^job-board-(.+)\.json$/);
      key = m ? m[1] : file.replace(/\.json$/, '');
    }
    try {
      const data = JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf8'));
      out[key] = {
        jobs: Array.isArray(data.jobs) ? data.jobs : [],
        meta: data.meta || {},
      };
    } catch (e) {
      // Skip corrupt boards but log so the operator can find the bad file.
      console.warn('[state] failed to parse', file, e.message);
    }
  }

  // External boards registered in state/job-board-sources.json.
  // Each entry: { "key": "oqe", "path": "F:/path/to/JOB_BOARD.json" }
  // Read live on every call so external boards reflect without a push step.
  try {
    const sources = JSON.parse(fs.readFileSync(JOB_BOARD_SOURCES_PATH, 'utf8'));
    for (const src of (sources.sources || [])) {
      if (!src.key || !src.path) continue;
      try {
        const data = JSON.parse(fs.readFileSync(src.path, 'utf8'));
        out[src.key] = {
          jobs: Array.isArray(data.jobs) ? data.jobs : [],
          meta: data.meta || {},
        };
      } catch (e) {
        console.warn('[state] failed to load external board', src.key, e.message);
      }
    }
  } catch {
    // No sources file — skip silently.
  }

  return out;
}

function loadLessons() {
  // state/lessons.json is the canonical live lesson log. Absent file =>
  // empty array (criterion 3: live mode reads from /state.json; lessons
  // start empty and are populated via the editor).
  const fp = path.join(STATE_DIR, 'lessons.json');
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.lessons)) return raw.lessons;
    return [];
  } catch {
    return [];
  }
}

function loadMeetings() {
  const fp = path.join(STATE_DIR, 'meetings.json');
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.meetings)) return raw.meetings;
    return [];
  } catch {
    return [];
  }
}

function buildLiveStateBundle() {
  // The shape consumed by dashboard/data/live.js (claude.design adapter):
  //   state["job-boards"][project] = { jobs, meta }
  //   state.lessons              = [ ...lessons ]
  //   state.meetings             = [ ...meetings ]
  // The legacy keys from loadState() are merged in so the briefing
  // dashboard at / continues to work off the same payload.
  const base = loadState();
  base['job-boards'] = discoverJobBoards();
  base.lessons = loadLessons();
  base.meetings = loadMeetings();
  base.meta_live = {
    server_time: new Date().toISOString(),
    state_dir: STATE_DIR,
    version: 'state@1.0',
    boards: Object.keys(base['job-boards']),
    lesson_count: base.lessons.length,
    meeting_count: base.meetings.length,
  };
  return base;
}

function readKokoroStats() {
  // Live depths come from the filesystem so a stale stats.json can't lie
  // about what's queued right now. Counters come from stats.json.
  const empty = {
    queue_depth: { p0: 0, normal: 0, spillover: 0 },
    counters: { enqueued: 0, played: 0, spilled: 0, retried: 0, dropped: 0, p0_dropped: 0 },
    last_updated: null,
  };
  let stats = empty;
  try {
    const raw = JSON.parse(fs.readFileSync(KOKORO_QUEUE_STATS, 'utf8'));
    stats = {
      queue_depth: empty.queue_depth,
      counters: { ...empty.counters, ...(raw.counters || {}) },
      last_updated: raw.last_updated || null,
    };
  } catch {
    // stats.json absent or unreadable — return zeros for counters.
  }
  for (const lane of ['p0', 'normal', 'spillover']) {
    try {
      stats.queue_depth[lane] = fs
        .readdirSync(path.join(KOKORO_QUEUE_ROOT, lane))
        .filter((f) => f.endsWith('.wav'))
        .length;
    } catch {
      stats.queue_depth[lane] = 0;
    }
  }
  return stats;
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
  const fwd = (p) => p.replace(/\\/g, '/');
  const PINNED_PATH = path.join(DISPATCH_ROOT, 'state', 'projects-pinned.json');

  // Load pinned baseline. This file is gitignored (state/*.json) so personal
  // project lists never leak into the public framework repo. If the file is
  // missing, fall back to a minimal default so the launcher still works.
  let projects = [];
  if (fs.existsSync(PINNED_PATH)) {
    try {
      const pinned = JSON.parse(fs.readFileSync(PINNED_PATH, 'utf8'));
      if (Array.isArray(pinned.projects)) {
        projects = pinned.projects.filter(p => p && p.id && p.path).map(p => ({
          id: p.id,
          name: p.name || p.id.toUpperCase(),
          path: fwd(p.path),
          scope: p.scope || `project:${p.id}`,
          description: p.description || '',
        }));
      }
    } catch (e) {
      console.warn('[launcher] failed to parse projects-pinned.json:', e.message);
    }
  }
  if (projects.length === 0) {
    projects = [{
      id: 'workspace', name: 'WORKSPACE ROOT', path: fwd(WORKSPACE_ROOT),
      scope: 'workspace', description: 'Workspace root. All personas available.',
    }];
  }

  // Auto-discovery scan for newly-created projects under DISPATCH_PROJECTS_DIR.
  // Pinned IDs always win — discovered entries with the same id (or path) are skipped.
  const PROJECT_ALIASES = {
    'dispatch-framework': { id: 'multideck', name: 'MULTIDECK (DISPATCH)' },
    'dispatch':           { id: 'multideck-github', name: 'MULTIDECK GITHUB' },
  };
  const seen = new Set(projects.map(p => p.id));
  const seenPaths = new Set(projects.map(p => p.path));
  const dirs = ACTIVE_PROJECTS_DIR ? ACTIVE_PROJECTS_DIR.split(',').map(d => d.trim()).filter(Boolean) : [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('.')) continue;
        const full = fwd(path.join(dir, e.name));
        if (seenPaths.has(full)) continue;
        const alias = PROJECT_ALIASES[e.name];
        const pid = alias ? alias.id : e.name;
        if (seen.has(pid)) continue;
        seen.add(pid);
        seenPaths.add(full);
        projects.push({
          id: pid,
          name: alias ? alias.name : e.name.toUpperCase().replace(/-/g, ' '),
          path: full,
          scope: `project:${pid}`,
          description: `Active project at ${full}`,
        });
      }
    } catch {}
  }
  return projects;
}

// ============================================================
// Persona spawning (cross-platform)
// ============================================================
// Probe whether the multideck tmux session already exists in WSL Ubuntu.
// Used to decide whether a launch needs to open a viewer wt window or just
// slot into the existing session silently.
function tmuxSessionExists(name) {
  if (!IS_WINDOWS || !WSL_AVAILABLE) return false;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('wsl.exe', ['-d', 'Ubuntu', '--', 'tmux', 'has-session', '-t', String(name)], {
      stdio: 'ignore', timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

// Read OpenCode's registered models from ~/.config/opencode/opencode.json so the
// launcher UI can offer them as a dropdown. Returns
// [{ id: "ollama/qwen3-coder:30b-32k", name: "Qwen3-Coder 30B (32k ctx)", provider: "ollama" }, ...].
// Empty array if config missing or unreadable.
function listOpencodeModels() {
  try {
    const cfg = JSON.parse(fs.readFileSync(OPENCODE_CONFIG_PATH, 'utf8'));
    const out = [];
    for (const [provName, prov] of Object.entries(cfg.provider || {})) {
      const models = (prov && prov.models) || {};
      for (const [modelId, modelMeta] of Object.entries(models)) {
        out.push({
          id: `${provName}/${modelId}`,
          name: (modelMeta && modelMeta.name) || modelId,
          provider: provName,
        });
      }
    }
    return out;
  } catch (e) {
    return [];
  }
}

function spawnPersonaOpencode(personaKey, initialPrompt, callsignSuffix, model) {
  // OpenCode runtime spawn — wt only for v1. tmux + opencode is a future addition.
  // Voice + /color injector are intentionally skipped (no SSE_PORT equivalent;
  // OpenCode TUI handles colors natively).
  if (!IS_WINDOWS) {
    throw new Error('opencode runtime currently supports Windows wt transport only');
  }
  const args = [
    '/c', 'start', '""', '/b',
    'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', LAUNCH_SCRIPT_OPENCODE_PS1, personaKey,
  ];
  if (initialPrompt) args.push(initialPrompt);
  if (callsignSuffix) args.push('-CallsignSuffix', callsignSuffix);
  if (model) args.push('-Model', model);
  const child = spawn('cmd.exe', args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

function spawnPersona(personaKey, initialPrompt, transport, options) {
  const xport = String(transport || DEFAULT_TRANSPORT).toLowerCase();
  const opts = options || {};
  const runtime = String(opts.runtime || DEFAULT_RUNTIME).toLowerCase();

  // Runtime branch — opencode skips transport (wt-only) and the rest of the
  // Claude wt/tmux machinery below. VS spawns both runtimes side-by-side with
  // distinct callsign suffixes so the operator can tell them apart.
  if (runtime === 'opencode') {
    spawnPersonaOpencode(personaKey, initialPrompt, opts.callsignSuffix || '', opts.model || '');
    return;
  }
  if (runtime === 'vs') {
    spawnPersona(personaKey, initialPrompt, xport, { ...opts, runtime: 'claude', callsignSuffix: 'CLD' });
    spawnPersonaOpencode(personaKey, initialPrompt, 'OCD', opts.model || '');
    return;
  }

  if (IS_WINDOWS) {
    if (xport === 'tmux') {
      if (!WSL_AVAILABLE) {
        throw new Error('tmux transport requires WSL Ubuntu; not detected at server boot');
      }
      const wslRepo = toWslPath(DISPATCH_ROOT);
      const tmuxScript = `${wslRepo}/scripts/launch-persona-tmux.sh`;
      const escapedPrompt = String(initialPrompt || '').replace(/'/g, "'\\''");
      const promptArg = initialPrompt ? ` '${escapedPrompt}'` : '';
      // Decide whether this spawn opens a viewer wt window or just splits into
      // the existing multideck session silently. Pack-into-existing happens
      // when (a) the caller asked for it via opts.openViewer === false, or
      // (b) the session already exists and the caller didn't override.
      const sessionUp = opts.sessionExists !== undefined
        ? opts.sessionExists
        : tmuxSessionExists('multideck');
      const explicitNoViewer = opts.openViewer === false;
      const wantViewer = !explicitNoViewer && (opts.openViewer === true || !sessionUp);

      if (wantViewer) {
        // Open a wt window whose attached tmux client visually hosts the session
        const bashCmd = `'${tmuxScript}' '${personaKey}'${promptArg}`;
        const args = [
          '/c', 'start', '""',
          'wt.exe', '-w', 'new',
          'new-tab',
          '--title', `MULTIDECK [${personaKey}]`,
          'wsl.exe', '-d', 'Ubuntu', '--',
          'bash', '-lc', bashCmd,
        ];
        const child = spawn('cmd.exe', args, { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
      } else {
        // Slot into the existing multideck session — no wt window. The script
        // splits a new pane in the running session; the operator's existing
        // attached viewer (if any) sees it appear automatically.
        const bashCmd = `'${tmuxScript}' '${personaKey}'${promptArg} --no-attach`;
        const args = [
          'wsl.exe', '-d', 'Ubuntu', '--',
          'bash', '-lc', bashCmd,
        ];
        const child = spawn('cmd.exe', ['/c', ...args], {
          detached: true, stdio: 'ignore', windowsHide: true,
        });
        child.unref();
      }
      return;
    }
    // wt transport (default) — pass -Transport explicitly so the ps1 takes the wt branch
    const args = [
      '/c', 'start', '""', '/b',
      'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', LAUNCH_SCRIPT_PS1, personaKey,
    ];
    if (initialPrompt) args.push(initialPrompt);
    args.push('-Transport', 'wt');
    const child = spawn('cmd.exe', args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } else {
    // Linux / macOS — sh transport remains the only option for now;
    // tmux transport on native Linux is out of scope for MULTI-FEAT-0055.
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
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
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

  if (url === '/launcher/transports' && method === 'GET') {
    const available = [];
    if (IS_WINDOWS) {
      available.push('wt');
      if (WSL_AVAILABLE) available.push('tmux');
    } else {
      available.push('sh');
    }
    available.push('browser');
    let resolvedDefault = DEFAULT_TRANSPORT;
    if (!available.includes(resolvedDefault)) {
      resolvedDefault = available[0] || 'wt';
    }
    sendJson(res, 200, {
      available,
      default: resolvedDefault,
      wsl_detected: WSL_AVAILABLE,
      // availability_reason explains why tmux is or isn't on the available list,
      // so the UI can render a help glyph with a specific message even when only
      // one transport is shown (MULTI-UI-0064 criterion 2).
      availability_reason: WSL_AVAILABILITY_REASON,
      env_default: DEFAULT_TRANSPORT,
    });
    return true;
  }

  if (url === '/launcher/models' && method === 'GET') {
    sendJson(res, 200, { models: listOpencodeModels() });
    return true;
  }

  if (url === '/launcher/personas' && method === 'GET') {
    try {
      let data = fs.readFileSync(PERSONAS_PATH, 'utf8');
      data = data.replace(/\$\{DISPATCH_ROOT\}/g, DISPATCH_ROOT.replace(/\\/g, '/'));
      data = data.replace(/\$\{DISPATCH_USER_ROOT\}/g, WORKSPACE_ROOT.replace(/\\/g, '/'));
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
      const transport = String(body.transport || DEFAULT_TRANSPORT).toLowerCase();
      const runtime = String(body.runtime || DEFAULT_RUNTIME).toLowerCase();
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      if (!VALID_RUNTIMES.includes(runtime)) {
        return sendJson(res, 400, { error: 'invalid runtime', runtime, valid: VALID_RUNTIMES });
      }
      // Transport availability only matters for Claude path; opencode is wt-only.
      if (runtime !== 'opencode' && !transportAvailable(transport)) {
        return sendJson(res, 400, {
          error: 'transport not available',
          transport,
          wsl_detected: WSL_AVAILABLE,
        });
      }
      // Prepend runtime-specific deploy string from persona registry.
      // vs → vs_deploy_string (both runtimes get it), opencode → local_deploy_string, claude → deploy_string.
      const _persona = registry.personas[personaKey];
      const _deployStr = runtime === 'vs'
        ? (_persona.vs_deploy_string || '')
        : runtime === 'opencode'
          ? (_persona.local_deploy_string || '')
          : (_persona.deploy_string || '');
      // Steam Deck handheld mode: append a 10-line output cap. The deck
      // launcher script appends ?deck=1 to the URL, the client JS reads
      // it and posts deckMode:true here. Reading area on the Deck at the
      // 28px xterm font is tight; verbose persona output overruns the
      // screen and the operator loses prior context while scrolling.
      const deckMode = body.deckMode === true || body.deckMode === 'true';
      const DECK_CONSTRAINT = 'Output mode: Steam Deck handheld kiosk. Keep every response under 10 lines. Prefer short bullets or one-paragraph answers. Defer details until the operator asks a follow-up.';
      let effectivePrompt = _deployStr
        ? _deployStr + (initialPrompt ? '\n\n' + initialPrompt : '')
        : initialPrompt;
      if (deckMode) {
        effectivePrompt = (effectivePrompt ? effectivePrompt + '\n\n' : '') + DECK_CONSTRAINT;
      }
      // Browser transport: reserve a session ID, respond with WS URL.
      // The actual process spawns when the browser WebSocket connects.
      if (transport === 'browser') {
        const sessionId = require('crypto').randomBytes(6).toString('hex');
        const dangerous = body.dangerous === true || body.dangerous === 'true';
        pendingSessions.set(sessionId, { personaKey, prompt: effectivePrompt, runtime, dangerous });
        setTimeout(() => pendingSessions.delete(sessionId), 30000);
        return sendJson(res, 200, {
          ok: true,
          transport: 'browser',
          session_id: sessionId,
          ws_path: `/terminal/ws?session=${sessionId}`,
          persona: personaKey,
          callsign: registry.personas[personaKey].callsign,
        });
      }

      try {
        // For tmux: open a viewer window only if the session doesn't yet
        // exist. If the operator already has a wt window attached to
        // multideck, this single launch slots in silently.
        const sessionExists = (transport === 'tmux' && runtime === 'claude') ? tmuxSessionExists('multideck') : false;
        spawnPersona(personaKey, effectivePrompt, transport, { sessionExists, runtime, model });
        sendJson(res, 200, {
          ok: true,
          persona: personaKey,
          callsign: registry.personas[personaKey].callsign,
          transport,
          runtime,
          model: model || null,
          packed_into_existing_session: transport === 'tmux' && runtime === 'claude' && sessionExists,
        });
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
      const transport = String(body.transport || DEFAULT_TRANSPORT).toLowerCase();
      const runtime = String(body.runtime || DEFAULT_RUNTIME).toLowerCase();
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      if (!VALID_RUNTIMES.includes(runtime)) {
        return sendJson(res, 400, { error: 'invalid runtime', runtime, valid: VALID_RUNTIMES });
      }
      if (runtime !== 'opencode' && !transportAvailable(transport)) {
        return sendJson(res, 400, {
          error: 'transport not available',
          transport,
          wsl_detected: WSL_AVAILABLE,
        });
      }
      // tmux topology B packs the whole team into one multideck session.
      // Open a viewer wt window only for the first member, and only if the
      // session doesn't already exist. All other members slot in silently
      // as new tiled panes. wt transport keeps the per-member tab behavior.
      // OpenCode runtime: each persona gets its own wt tab regardless.
      const sessionExistsAtLaunch = (transport === 'tmux' && runtime === 'claude') ? tmuxSessionExists('multideck') : false;
      const deployed = [];
      keys.forEach((k, i) => {
        setTimeout(() => {
          try {
            // Per-member deploy string injection — each persona carries its own mode context.
            const _mp = registry.personas[k];
            const _mds = runtime === 'vs'
              ? (_mp.vs_deploy_string || '')
              : runtime === 'opencode'
                ? (_mp.local_deploy_string || '')
                : (_mp.deploy_string || '');
            const _mp_prompt = _mds
              ? _mds + (initialPrompt ? '\n\n' + initialPrompt : '')
              : initialPrompt;
            const baseOpts = { runtime, model };
            const opts = (transport === 'tmux' && runtime === 'claude')
              ? { ...baseOpts, openViewer: i === 0 && !sessionExistsAtLaunch }
              : baseOpts;
            spawnPersona(k, _mp_prompt, transport, opts);
          } catch (e) {
            console.error('team spawn failed for', k, e.message);
          }
        }, i * 700);
        deployed.push({ persona: k, callsign: registry.personas[k].callsign });
      });
      sendJson(res, 200, {
        ok: true,
        deployed,
        transport,
        runtime,
        stagger_ms: 700,
        viewer_opened: (transport === 'tmux' && runtime === 'claude') ? !sessionExistsAtLaunch : null,
      });
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
  if (handleAudioStatus(req, res, url)) return true;
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
// Persona Builder routes
// GET  /builder       — serve builder.html
// POST /builder/run   — run the builder pipeline, return JSON
// ============================================================
function handleBuilder(req, res, url) {
  const method = req.method || 'GET';

  if ((url === '/builder' || url === '/builder/') && method === 'GET') {
    try {
      const html = fs.readFileSync(BUILDER_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('builder.html not found: ' + e.message);
    }
    return true;
  }

  if (url === '/builder/run' && method === 'POST') {
    readJsonBody(req).then(async (body) => {
      const opts = {
        dryRun: !!body.dry_run,
        noJobs: !!body.no_jobs,
        force:  !!body.force,
      };
      // Allowlist persona fields — never forward agent_file, key, or unknown props (path traversal prevention)
      const rawInputs = {
        callsign:    body.callsign,
        role:        body.role,
        scope:       body.scope,
        description: body.description,
        cwd:         body.cwd,
        color_hex:   body.color_hex,
        tab_color:   body.tab_color,
        voice_key:   body.voice_key,
      };
      try {
        const { runPipeline } = require('../scripts/lib/builder-pipeline');
        const result = await runPipeline(rawInputs, opts);
        sendJson(res, result.ok ? 200 : 422, result);
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e.message });
      }
    }).catch((e) => sendJson(res, 400, { error: 'bad body', detail: e.message }));
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
  <a href="/builder">PERSONA BUILDER</a>
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

  // Builder routes
  if (handleBuilder(req, res, url)) return;

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
    // MULTI-FEAT-0067: extended bundle for the claude.design dashboard
    // adapter (data/live.js). Includes legacy keys for /briefing + /
    // alongside the new state["job-boards"] map and state.lessons list.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildLiveStateBundle(), null, 2));
    return;
  }
  if ((url === '/jobs' || url === '/jobs/') && req.method === 'GET') {
    // MULTI-FEAT-0067: serve the claude.design Job Board Dashboard
    // (renamed to job-board-dashboard.html). The legacy WS-0011 server-
    // rendered page is preserved at /jobs-classic for backward compat.
    try {
      const html = fs.readFileSync(JOB_BOARD_DASHBOARD_HTML, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('job-board-dashboard.html not found: ' + e.message);
    }
    return;
  }
  if ((url === '/jobs' || url === '/jobs/') && req.method === 'POST') {
    // Accepts a full board sync from an external project (e.g. OQE).
    // Body: { board: "oqe", jobs: [...], meta: {...} }
    // Writes to STATE_DIR/job-board-{board}.json so discoverJobBoards() picks it up.
    readJsonBody(req).then((body) => {
      const board = String(body.board || 'oqe').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64);
      if (!board) return sendJson(res, 400, { error: 'board key required' });
      const jobs = Array.isArray(body.jobs) ? body.jobs : [];
      const meta = (body.meta && typeof body.meta === 'object') ? body.meta : {};
      const filename = board === 'workspace' ? 'job-board.json' : `job-board-${board}.json`;
      const fp = path.join(STATE_DIR, filename);
      try {
        fs.writeFileSync(fp, JSON.stringify({ meta, jobs }, null, 2));
        sendJson(res, 200, { ok: true, board, job_count: jobs.length, file: filename });
      } catch (e) {
        sendJson(res, 500, { error: 'failed to write board', detail: e.message });
      }
    }).catch((e) => sendJson(res, 400, { error: 'bad body', detail: e.message }));
    return;
  }
  if (url === '/jobs-classic' || url === '/jobs-classic/') {
    // Legacy WS-0011 page kept reachable so prior bookmarks/links don't
    // 404 (alternatives_considered note in MULTI-FEAT-0067 manifest).
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderJobBoardPage(STATE_DIR));
    return;
  }
  // -- Static assets for the claude.design dashboard ---------
  // Three flat directories: scripts/, styles/, data/. Each is sandboxed
  // under DASHBOARD_ROOT to refuse path traversal. Directory listings
  // are not served — only known extensions.
  const STATIC_PREFIXES = [
    { prefix: '/scripts/', dir: DASHBOARD_SCRIPTS },
    { prefix: '/styles/',  dir: DASHBOARD_STYLES  },
    { prefix: '/data/',    dir: DASHBOARD_DATA    },
  ];
  for (const { prefix, dir } of STATIC_PREFIXES) {
    if (!url.startsWith(prefix)) continue;
    const relRaw = decodeURIComponent(url.slice(prefix.length));
    const safeRel = path.normalize(relRaw).replace(/^([\\/])+/, '');
    if (safeRel.includes('..') || !safeRel) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    const filePath = path.join(dir, safeRel);
    if (!filePath.startsWith(dir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return;
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
        'Cache-Control': 'public, max-age=60',
      });
      fs.createReadStream(filePath).pipe(res);
    });
    return;
  }
  if (url === '/api/kokoro/stats') {
    sendJson(res, 200, readKokoroStats());
    return;
  }

  // ----------------------------------------------------------
  // STT — POST /stt/transcribe
  // Body: raw audio bytes (typically audio/webm from MediaRecorder).
  // Process: write blob to tmp → ffmpeg transcode to 16kHz mono wav →
  //          whisper.cpp → return { text }.
  // Requires DISPATCH_WHISPER_BIN and DISPATCH_WHISPER_MODEL in env.
  // ----------------------------------------------------------
  if (url === '/stt/transcribe' && req.method === 'POST') {
    const whisperBin = process.env.DISPATCH_WHISPER_BIN;
    const whisperModel = process.env.DISPATCH_WHISPER_MODEL;
    const remoteSet = !!(process.env.DISPATCH_WHISPER_REMOTE || '').trim();

    // Remote mode: a remote whisper-server URL is configured, so we don't need
    // any local whisper binary or model on disk. Skip the local-file checks
    // and rely on whisperServer.transcribe() to call out to the remote.
    if (!remoteSet) {
      if (!whisperBin || !whisperModel) {
        return sendJson(res, 503, { error: 'STT not configured. Set DISPATCH_WHISPER_BIN and DISPATCH_WHISPER_MODEL, or DISPATCH_WHISPER_REMOTE for a remote backend.' });
      }
      if (!fs.existsSync(whisperBin) || !fs.existsSync(whisperModel)) {
        return sendJson(res, 503, { error: 'whisper bin or model missing on disk', whisperBin, whisperModel });
      }
    }
    const os = require('os');
    const crypto = require('crypto');
    const id = crypto.randomBytes(8).toString('hex');
    const tmpDir = path.join(os.tmpdir(), 'multideck-stt');
    fs.mkdirSync(tmpDir, { recursive: true });
    const inputPath = path.join(tmpDir, `${id}.in`);
    const wavPath = path.join(tmpDir, `${id}.wav`);
    const cleanup = () => { for (const p of [inputPath, wavPath]) { try { fs.unlinkSync(p); } catch {} } };

    const out = fs.createWriteStream(inputPath);
    let totalBytes = 0;
    const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap for safety
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BYTES) {
        req.destroy();
        out.destroy();
        cleanup();
        sendJson(res, 413, { error: 'audio too large (max 25 MB)' });
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      // Stage 1: ffmpeg transcode to 16kHz mono WAV
      const ff = spawn('ffmpeg', ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-f', 'wav', wavPath], { stdio: ['ignore', 'ignore', 'pipe'] });
      let ffErr = '';
      ff.stderr.on('data', (d) => { ffErr += d.toString(); });
      ff.on('close', async (code) => {
        if (code !== 0 || !fs.existsSync(wavPath)) {
          cleanup();
          return sendJson(res, 500, { error: 'ffmpeg transcode failed', detail: ffErr.slice(-500) });
        }
        // Stage 2 (preferred): warm whisper-server holds the model in RAM and
        // serves transcriptions over HTTP. Eliminates the 150 MB mmap penalty
        // that made base.en run ~1 second per word on Steam Deck when other
        // processes evicted model pages between calls.
        try {
          const text = await whisperServer.transcribe(wavPath);
          cleanup();
          return sendJson(res, 200, { text });
        } catch (e) {
          // In remote mode we have no local whisper-cli to fall through to,
          // so surface the proxy error directly instead of crashing
          // spawn(undefined). In local-warm mode, fall through to whisper-cli
          // for installs where the warm server itself is broken.
          console.warn(`[stt] whisper backend failed: ${e.message}`);
          if (remoteSet) {
            cleanup();
            return sendJson(res, 502, {
              error: 'remote whisper-server unreachable or returned error',
              detail: e.message,
              remoteUrl: (process.env.DISPATCH_WHISPER_REMOTE || '').trim(),
            });
          }
        }
        // Stage 2 (fallback): one-shot whisper-cli. Only runs in local mode.
        // -nt = no timestamps, -np = no per-segment prints (cleaner stdout)
        const wp = spawn(whisperBin, ['-m', whisperModel, '-f', wavPath, '-nt', '-np'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        wp.stdout.on('data', (d) => { stdout += d.toString(); });
        wp.stderr.on('data', (d) => { stderr += d.toString(); });
        wp.on('close', (wcode) => {
          cleanup();
          if (wcode !== 0) {
            return sendJson(res, 500, { error: 'whisper failed', code: wcode, detail: stderr.slice(-500) });
          }
          const text = stdout.replace(/\s+/g, ' ').trim();
          sendJson(res, 200, { text });
        });
      });
    });
    out.on('error', (e) => { cleanup(); sendJson(res, 500, { error: 'tmp write failed', detail: e.message }); });
    req.on('error', (e) => { cleanup(); sendJson(res, 500, { error: 'request stream error', detail: e.message }); });
    return;
  }

  if (url === '/stt/status' && req.method === 'GET') {
    return sendJson(res, 200, whisperServer.status());
  }

  // ----------------------------------------------------------
  // Question bridge — for Steam Deck glyph-button modal.
  //
  // Contract with hooks/dashboard-question-bridge.py (PreToolUse hook):
  //   - Hook writes  $STATE_DIR/pending-questions/<sessionId>.json
  //   - Dashboard sees it via /events/questions SSE → renders modal
  //   - User picks → POST /questions/:sessionId/answer { answers }
  //   - Dashboard writes <sessionId>.answer.json
  //   - Hook polls for the answer file, reads it, returns to Claude.
  //
  // sessionId is restricted to filename-safe chars to prevent traversal.
  // ----------------------------------------------------------
  const PENDING_Q_DIR = path.join(STATE_DIR, 'pending-questions');
  const isSafeSessionId = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(s);

  if (url === '/events/questions' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    try { fs.mkdirSync(PENDING_Q_DIR, { recursive: true }); } catch {}

    // Initial sweep — emit any already-pending questions so a late-joining
    // browser tab still sees them.
    try {
      for (const name of fs.readdirSync(PENDING_Q_DIR)) {
        if (!name.endsWith('.json') || name.endsWith('.answer.json')) continue;
        const sessionId = name.slice(0, -5);
        if (!isSafeSessionId(sessionId)) continue;
        try {
          const body = JSON.parse(fs.readFileSync(path.join(PENDING_Q_DIR, name), 'utf8'));
          res.write(`event: ask\ndata: ${JSON.stringify({ sessionId, questions: body.questions || [] })}\n\n`);
        } catch {}
      }
    } catch {}

    let watcher = null;
    try {
      watcher = fs.watch(PENDING_Q_DIR, (eventType, filename) => {
        if (!filename || !filename.endsWith('.json')) return;
        const isAnswer = filename.endsWith('.answer.json');
        const sessionId = filename.slice(0, isAnswer ? -'.answer.json'.length : -'.json'.length);
        if (!isSafeSessionId(sessionId)) return;
        const fullPath = path.join(PENDING_Q_DIR, filename);
        const exists = fs.existsSync(fullPath);
        if (!exists && !isAnswer) {
          res.write(`event: resolved\ndata: ${JSON.stringify({ sessionId })}\n\n`);
          return;
        }
        if (exists && !isAnswer) {
          try {
            const body = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            res.write(`event: ask\ndata: ${JSON.stringify({ sessionId, questions: body.questions || [] })}\n\n`);
          } catch {}
        }
      });
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'watch failed', detail: e.message })}\n\n`);
    }

    const keepalive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
    req.on('close', () => {
      clearInterval(keepalive);
      try { if (watcher) watcher.close(); } catch {}
    });
    return;
  }

  if (url.startsWith('/questions/') && url.endsWith('/answer') && req.method === 'POST') {
    const sessionId = url.slice('/questions/'.length, -'/answer'.length);
    if (!isSafeSessionId(sessionId)) {
      return sendJson(res, 400, { error: 'invalid sessionId' });
    }
    readJsonBody(req).then((body) => {
      const answers = body && body.answers;
      if (!answers || typeof answers !== 'object') {
        return sendJson(res, 400, { error: 'answers object required' });
      }
      try {
        fs.mkdirSync(PENDING_Q_DIR, { recursive: true });
        const answerPath = path.join(PENDING_Q_DIR, `${sessionId}.answer.json`);
        fs.writeFileSync(answerPath, JSON.stringify({ answers, received_at: new Date().toISOString() }, null, 2));
        sendJson(res, 200, { ok: true });
      } catch (e) {
        sendJson(res, 500, { error: 'failed to write answer', detail: e.message });
      }
    }).catch((e) => sendJson(res, 400, { error: 'bad body', detail: e.message }));
    return;
  }

  if (url === '/api/claude/complete' && req.method === 'POST') {
    readJsonBody(req).then((body) => {
      const prompt = String(body.prompt || '');
      if (!prompt) return sendJson(res, 400, { error: 'prompt required' });
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return sendJson(res, 503, { error: 'ANTHROPIC_API_KEY not configured' });
      const payload = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk) => { data += chunk; });
        proxyRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const text = (parsed.content?.[0]?.text) || '';
            sendJson(res, 200, { text });
          } catch (e) {
            sendJson(res, 502, { error: 'invalid response from Claude API' });
          }
        });
      });
      proxyReq.on('error', (e) => sendJson(res, 502, { error: 'Claude API request failed', detail: e.message }));
      proxyReq.write(payload);
      proxyReq.end();
    }).catch((e) => sendJson(res, 400, { error: 'bad body', detail: e.message }));
    return;
  }

  if (url === '/api/meetings' && req.method === 'POST') {
    readJsonBody(req).then((body) => {
      const meeting = body.meeting;
      if (!meeting || !meeting.id) return sendJson(res, 400, { error: 'meeting.id required' });
      const fp = path.join(STATE_DIR, 'meetings.json');
      try {
        let existing = [];
        try {
          const raw = fs.readFileSync(fp, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.meetings)) existing = parsed.meetings;
        } catch (_) {}
        const idx = existing.findIndex((m) => m.id === meeting.id);
        if (idx >= 0) existing[idx] = meeting;
        else existing.push(meeting);
        fs.writeFileSync(fp, JSON.stringify({ meetings: existing }, null, 2));
        sendJson(res, 200, { ok: true, id: meeting.id });
      } catch (e) {
        sendJson(res, 500, { error: 'failed to save meeting', detail: e.message });
      }
    }).catch((e) => sendJson(res, 400, { error: 'bad body', detail: e.message }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found. Try / or /launcher or /audio-feed or /briefing or /jobs or /jobs-classic or /builder or /state.json or /api/kokoro/stats');
});

// ============================================================
// Browser terminal WebSocket server
// ============================================================
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://localhost`);
  if (url.pathname === '/terminal/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost`);
  const sessionId = url.searchParams.get('session') || '';
  const pending = sessionId && pendingSessions.get(sessionId);

  if (!pending) {
    ws.send(JSON.stringify({ type: 'error', msg: 'unknown or expired session' }));
    ws.close();
    return;
  }
  pendingSessions.delete(sessionId);

  // Initial PTY dimensions from xterm.js (sent as query params on connect).
  // Used to set COLUMNS/LINES env + stty cols/rows so claude wraps at the
  // visible width instead of bash's default 80 cols. Without this, long
  // lines from claude run off the right edge of the launcher terminal panel.
  const initCols = Math.max(20, Math.min(500, Number(url.searchParams.get('cols')) || 100));
  const initRows = Math.max(5,  Math.min(200, Number(url.searchParams.get('rows')) || 30));
  const ptyEnv = {
    ...process.env,
    COLUMNS: String(initCols),
    LINES: String(initRows),
    TERM: process.env.TERM || 'xterm-256color',
  };

  let proc;
  try {
    if (IS_WINDOWS && WSL_AVAILABLE) {
      // Wrap in `script -q -c '...' /dev/null` to allocate a pseudo-TTY so
      // claude behaves interactively (colors, no "no stdin data" warning).
      // Note: util-linux script requires the output file as the LAST positional arg.
      // stty inside the PTY sets the kernel-side dimensions so claude's
      // ioctl(TIOCGWINSZ) returns the same cols/rows the browser xterm has.
      const safe      = String(pending.prompt || '').replace(/'/g, "'\\''");
      const dangerArg = pending.dangerous ? ' --dangerously-skip-permissions' : '';
      const inner     = pending.prompt ? `claude${dangerArg} '${safe}'` : `claude${dangerArg}`;
      const cmd       = `script -q -c 'stty cols ${initCols} rows ${initRows} 2>/dev/null; ${inner.replace(/'/g, "'\\''")}' /dev/null`;
      proc = spawn('wsl.exe', ['-d', 'Ubuntu', '--', 'bash', '-lc', cmd], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: ptyEnv,
      });
    } else if (!IS_WINDOWS) {
      const safe      = String(pending.prompt || '').replace(/'/g, "'\\''");
      const dangerArg = pending.dangerous ? ' --dangerously-skip-permissions' : '';
      const inner     = pending.prompt ? `claude${dangerArg} '${safe}'` : `claude${dangerArg}`;
      const cmd       = `script -q -c 'stty cols ${initCols} rows ${initRows} 2>/dev/null; ${inner.replace(/'/g, "'\\''")}' /dev/null`;
      proc = spawn('bash', ['-lc', cmd], { stdio: ['pipe', 'pipe', 'pipe'], env: ptyEnv });
    } else {
      ws.send(JSON.stringify({ type: 'error', msg: 'browser terminal requires WSL on Windows' }));
      ws.close();
      return;
    }
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', msg: 'spawn failed: ' + e.message }));
    ws.close();
    return;
  }

  activeSessions.set(sessionId, { ws, proc });
  ws.send(JSON.stringify({ type: 'ready', session: sessionId }));

  proc.stdout.on('data', (chunk) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'data', data: chunk.toString() }));
  });
  proc.stderr.on('data', (chunk) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'data', data: chunk.toString() }));
  });
  proc.on('exit', (code) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit', code: code ?? 0 }));
    activeSessions.delete(sessionId);
    ws.close();
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && proc.stdin && proc.stdin.writable) {
        proc.stdin.write(msg.data);
      }
    } catch { /* ignore malformed messages */ }
  });

  ws.on('close', () => {
    if (proc && !proc.killed) proc.kill();
    activeSessions.delete(sessionId);
  });
});

// ============================================================
// Warm whisper-server manager (v0.7.1)
//
// whisper.cpp ships a `whisper-server` binary alongside `whisper-cli`. It
// loads the model once at startup and serves transcriptions over HTTP at
// POST /inference. Eliminates the per-request 150 MB model mmap penalty that
// made base.en run ~1 second per word on Steam Deck (Zen 2) when other
// processes evicted model pages between calls.
//
// Lazy-spawn on first STT request, keep alive, restart on death. Falls back
// to one-shot whisper-cli if the server binary is missing or fails to start.
//
// Override port with DISPATCH_WHISPER_PORT. Disable warm mode with
// DISPATCH_WHISPER_WARM=0 (forces fallback path).
// ============================================================
const WHISPER_WARM = process.env.DISPATCH_WHISPER_WARM !== '0';
const WHISPER_PORT = Number(process.env.DISPATCH_WHISPER_PORT) || 8780;

// v0.7.2: optionally proxy to a remote whisper-server (e.g. PC over Tailscale).
// When DISPATCH_WHISPER_REMOTE is set, the deck dashboard skips spawning a local
// whisper-server entirely and forwards every POST /stt/transcribe to the remote.
// Format: "http://host:port" or "host:port" (scheme defaults to http). MagicDNS
// hostnames are fine, e.g. "http://my-pc.tail-abc123.ts.net:8780".
const WHISPER_REMOTE_RAW = (process.env.DISPATCH_WHISPER_REMOTE || '').trim();
const WHISPER_REMOTE = WHISPER_REMOTE_RAW
  ? (WHISPER_REMOTE_RAW.match(/^https?:\/\//) ? WHISPER_REMOTE_RAW : `http://${WHISPER_REMOTE_RAW}`)
  : '';

// v0.7.2: optional dictionary biases whisper's transcription toward your
// vocabulary (acronyms, project names, proper nouns). One term or phrase per
// line. Up to ~150 words; whisper truncates at its ~224-token prompt limit.
// Path: $XDG_CONFIG_HOME/multideck/dictionary.txt (defaults to ~/.config/...)
const WHISPER_DICT_PATH = path.join(
  process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '', '.config'),
  'multideck', 'dictionary.txt'
);

function loadDictionaryPrompt() {
  try {
    if (!fs.existsSync(WHISPER_DICT_PATH)) return '';
    const lines = fs.readFileSync(WHISPER_DICT_PATH, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
    if (!lines.length) return '';
    // Comma-join terms into a single context sentence. Whisper interprets the
    // prompt as preceding context, so a flat list of nouns works well in
    // practice (per whisper.cpp issue threads on prompt biasing).
    return lines.join(', ');
  } catch {
    return '';
  }
}

const whisperServer = (() => {
  let proc = null;
  let starting = null; // Promise<void> while spawning
  let ready = false;
  let lastError = null;
  let restarts = 0;

  function resolveServerBin() {
    const cli = process.env.DISPATCH_WHISPER_BIN || '';
    if (!cli) return null;
    // Sibling lookup: same dir as whisper-cli, named whisper-server.
    const candidate = path.join(path.dirname(cli), 'whisper-server');
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
  }

  async function ensureRunning() {
    // Remote mode short-circuits local spawn entirely.
    if (WHISPER_REMOTE) {
      ready = true; // best-effort flag; real liveness is checked per-request
      return;
    }
    if (!WHISPER_WARM) throw new Error('warm mode disabled (DISPATCH_WHISPER_WARM=0)');
    if (proc && ready) return;
    if (starting) return starting;

    const serverBin = resolveServerBin();
    if (!serverBin) throw new Error('whisper-server binary not found alongside DISPATCH_WHISPER_BIN');

    const model = process.env.DISPATCH_WHISPER_MODEL;
    if (!model || !fs.existsSync(model)) throw new Error('DISPATCH_WHISPER_MODEL missing');

    starting = new Promise((resolve, reject) => {
      console.log(`[stt] starting whisper-server on 127.0.0.1:${WHISPER_PORT} (model=${path.basename(model)})`);
      const child = spawn(serverBin, [
        '-m', model,
        '--host', '127.0.0.1',
        '--port', String(WHISPER_PORT),
        '-t', String(Math.min(4, require('os').cpus().length)),
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      let bootBuf = '';
      const onLog = (chunk) => { bootBuf += chunk.toString(); };
      child.stderr.on('data', onLog);
      child.stdout.on('data', onLog);

      // whisper-server silently binds its port without printing a readiness
      // line, so log-scanning is unreliable. We poll the port instead: try
      // a quick TCP connect every 250ms until it succeeds or we hit timeout.
      const net = require('net');
      let resolved = false;
      const finishOk = () => {
        if (resolved) return;
        resolved = true;
        ready = true;
        proc = child;
        starting = null;
        console.log(`[stt] whisper-server ready on 127.0.0.1:${WHISPER_PORT}`);
        resolve();
      };
      const finishFail = (msg) => {
        if (resolved) return;
        resolved = true;
        starting = null;
        try { child.kill(); } catch {}
        lastError = msg;
        reject(new Error(msg));
      };

      const probeOnce = () => new Promise((res) => {
        const sock = net.connect({ host: '127.0.0.1', port: WHISPER_PORT }, () => { sock.destroy(); res(true); });
        sock.on('error', () => res(false));
        sock.setTimeout(500, () => { sock.destroy(); res(false); });
      });

      const startedAt = Date.now();
      const poll = async () => {
        if (resolved) return;
        if (Date.now() - startedAt > 15000) return finishFail(`boot timeout after 15s: ${bootBuf.slice(-300)}`);
        if (child.killed || child.exitCode !== null) return; // exit handler will reject
        if (await probeOnce()) return finishOk();
        setTimeout(poll, 250);
      };
      setTimeout(poll, 200); // small initial delay so we don't probe before bind starts

      child.on('exit', (code, signal) => {
        const wasReady = ready;
        ready = false;
        proc = null;
        if (!wasReady) {
          finishFail(`whisper-server exited before ready (code=${code} signal=${signal}): ${bootBuf.slice(-300)}`);
        } else {
          console.warn(`[stt] whisper-server exited post-readiness code=${code} signal=${signal}`);
          restarts += 1;
        }
      });

      child.on('error', (e) => {
        ready = false;
        proc = null;
        finishFail(`spawn failed: ${e.message}`);
      });
    });

    return starting;
  }

  async function transcribe(wavPath) {
    await ensureRunning();

    // Build the multipart body. Node 22 has no built-in FormData/Blob and we
    // want zero runtime deps so we hand-roll it.
    const wav = fs.readFileSync(wavPath);
    const boundary = '----multideck-' + Math.random().toString(36).slice(2);

    const parts = [];
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    ));
    parts.push(wav);
    parts.push(Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `json`
    ));

    // Inject the dictionary as the whisper `prompt` if present. whisper.cpp
    // accepts a `prompt` form field and biases decoding toward terms in it.
    // ~224 token limit; long dictionaries truncate from the right.
    const dictPrompt = loadDictionaryPrompt();
    if (dictPrompt) {
      parts.push(Buffer.from(
        `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
        dictPrompt
      ));
    }

    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    // Resolve target host/port: remote URL wins; otherwise local warm server.
    let targetHost, targetPort, targetProto;
    if (WHISPER_REMOTE) {
      const u = new URL(WHISPER_REMOTE);
      targetHost = u.hostname;
      targetPort = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
      targetProto = u.protocol === 'https:' ? 'https' : 'http';
    } else {
      targetHost = '127.0.0.1';
      targetPort = WHISPER_PORT;
      targetProto = 'http';
    }

    const driver = targetProto === 'https' ? https : http;

    return await new Promise((resolve, reject) => {
      const opts = {
        hostname: targetHost,
        port: targetPort,
        path: '/inference',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      };
      const req2 = driver.request(opts, (res2) => {
        let data = '';
        res2.on('data', (c) => { data += c.toString(); });
        res2.on('end', () => {
          if (res2.statusCode !== 200) {
            return reject(new Error(`whisper HTTP ${res2.statusCode}: ${data.slice(0, 300)}`));
          }
          try {
            const parsed = JSON.parse(data);
            const text = (parsed.text || '').replace(/\s+/g, ' ').trim();
            resolve(text);
          } catch (e) {
            reject(new Error(`whisper response not JSON: ${data.slice(0, 200)}`));
          }
        });
      });
      req2.on('error', reject);
      req2.setTimeout(60000, () => req2.destroy(new Error('whisper timeout (60s)')));
      req2.write(body);
      req2.end();
    });
  }

  function status() {
    const dictPrompt = loadDictionaryPrompt();
    return {
      mode: WHISPER_REMOTE ? 'remote' : (WHISPER_WARM ? 'local-warm' : 'local-fallback'),
      remoteUrl: WHISPER_REMOTE || null,
      warmEnabled: WHISPER_WARM,
      port: WHISPER_PORT,
      ready,
      running: !!proc,
      restarts,
      lastError,
      serverBin: resolveServerBin(),
      dictionaryPath: WHISPER_DICT_PATH,
      dictionaryLoaded: !!dictPrompt,
      dictionaryTerms: dictPrompt ? dictPrompt.split(',').length : 0,
    };
  }

  function shutdown() {
    if (proc && !proc.killed) {
      try { proc.kill(); } catch {}
    }
  }

  return { ensureRunning, transcribe, status, shutdown };
})();

// ============================================================
// Audio autoplay manager (v0.7 - replaces multideck-audio.service)
//
// Watches TTS_OUTPUT_DIR for new MP3s and pipes them to ffplay.
// Disable with DISPATCH_AUDIO_AUTOPLAY=0. Override player with
// DISPATCH_AUDIO_PLAYER (default ffplay).
//
// Lives inside the dashboard process so it shares lifecycle with the server,
// no systemd-user dependency, no separate process to monitor. Replaces the
// standalone multideck-audio-daemon.sh + multideck-audio.service installed
// pre-v0.7. See docs/DEPLOYMENT.md for rationale.
// ============================================================
const AUDIO_AUTOPLAY = process.env.DISPATCH_AUDIO_AUTOPLAY !== '0';
const AUDIO_PLAYER = process.env.DISPATCH_AUDIO_PLAYER || 'ffplay';
const AUDIO_SEEN_FILE = path.join(
  process.env.XDG_CACHE_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache'),
  'multideck', 'audio-seen.txt'
);

const audioState = {
  enabled: AUDIO_AUTOPLAY,
  player: AUDIO_PLAYER,
  seen: new Set(),
  queue: [],
  playing: null,
  lastError: null,
  totalPlayed: 0,
  startedAt: null,
};

function loadAudioSeen() {
  try {
    const data = fs.readFileSync(AUDIO_SEEN_FILE, 'utf8');
    for (const line of data.split(/\r?\n/)) {
      const f = line.trim();
      if (f) audioState.seen.add(f);
    }
  } catch {}
}

function persistAudioSeen(filename) {
  try {
    fs.mkdirSync(path.dirname(AUDIO_SEEN_FILE), { recursive: true });
    fs.appendFileSync(AUDIO_SEEN_FILE, filename + '\n');
  } catch {}
}

function playNextAudio() {
  if (audioState.playing || audioState.queue.length === 0) return;
  const filename = audioState.queue.shift();
  const full = path.join(TTS_OUTPUT_DIR, filename);
  if (!fs.existsSync(full)) return playNextAudio();

  const args = audioState.player === 'ffplay'
    ? ['-nodisp', '-autoexit', '-loglevel', 'quiet', full]
    : [full];

  let proc;
  try {
    proc = spawn(audioState.player, args, { stdio: 'ignore', detached: false });
  } catch (e) {
    audioState.lastError = `spawn ${audioState.player} failed: ${e.message}`;
    console.error(`[audio] ${audioState.lastError}`);
    return playNextAudio();
  }

  audioState.playing = { filename, pid: proc.pid, startedAt: Date.now() };
  console.log(`[audio] playing ${filename} (pid ${proc.pid})`);

  proc.on('exit', (code) => {
    audioState.totalPlayed += 1;
    audioState.playing = null;
    if (code !== 0 && code !== null) {
      audioState.lastError = `${audioState.player} exited ${code} on ${filename}`;
    }
    setTimeout(playNextAudio, 50);
  });
  proc.on('error', (e) => {
    audioState.lastError = `${audioState.player} error: ${e.message}`;
    console.error(`[audio] ${audioState.lastError}`);
    audioState.playing = null;
    setTimeout(playNextAudio, 50);
  });
}

function scanAudioDir() {
  try {
    if (!fs.existsSync(TTS_OUTPUT_DIR)) return;
    const files = fs.readdirSync(TTS_OUTPUT_DIR)
      .filter((f) => f.toLowerCase().endsWith('.mp3'))
      .map((f) => {
        try {
          return { filename: f, mtime: fs.statSync(path.join(TTS_OUTPUT_DIR, f)).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.mtime - b.mtime);

    for (const { filename } of files) {
      if (!audioState.seen.has(filename)) {
        audioState.seen.add(filename);
        persistAudioSeen(filename);
        audioState.queue.push(filename);
      }
    }
    if (audioState.queue.length > 0) playNextAudio();
  } catch (e) {
    audioState.lastError = `scan failed: ${e.message}`;
  }
}

function startAudioAutoplay() {
  if (!audioState.enabled) {
    console.log(`[audio] autoplay disabled (DISPATCH_AUDIO_AUTOPLAY=0)`);
    return;
  }

  try {
    const probe = spawn(audioState.player, ['-version'], { stdio: 'ignore' });
    probe.on('error', () => {
      console.warn(`[audio] player '${audioState.player}' not found on PATH; autoplay inert`);
      audioState.enabled = false;
    });
  } catch {
    audioState.enabled = false;
  }
  if (!audioState.enabled) return;

  loadAudioSeen();

  // Seed seen set with anything already on disk so we only autoplay files
  // generated AFTER server start. Prevents replay storm on restart.
  try {
    if (fs.existsSync(TTS_OUTPUT_DIR)) {
      for (const f of fs.readdirSync(TTS_OUTPUT_DIR)) {
        if (f.toLowerCase().endsWith('.mp3') && !audioState.seen.has(f)) {
          audioState.seen.add(f);
          persistAudioSeen(f);
        }
      }
    }
  } catch {}

  audioState.startedAt = Date.now();
  console.log(`[audio] autoplay watching ${TTS_OUTPUT_DIR} (player=${audioState.player})`);
  setInterval(scanAudioDir, 2000);
}

function handleAudioStatus(req, res, url) {
  if (url === '/audio-feed/status') {
    sendJson(res, 200, {
      enabled: audioState.enabled,
      player: audioState.player,
      ttsOutputDir: TTS_OUTPUT_DIR,
      seenCount: audioState.seen.size,
      queueLength: audioState.queue.length,
      nowPlaying: audioState.playing,
      totalPlayed: audioState.totalPlayed,
      lastError: audioState.lastError,
      uptimeSec: audioState.startedAt ? Math.floor((Date.now() - audioState.startedAt) / 1000) : 0,
    });
    return true;
  }
  return false;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MultiDeck Dashboard running on http://localhost:${PORT}`);
  console.log(`  /                        Main dashboard`);
  console.log(`  /launcher                MultiDeck launcher (cyberpunk character select)`);
  console.log(`  /briefing                Morning briefing`);
  console.log(`  /audio-feed              Auto-play Kokoro TTS feed`);
  console.log(`  /audio-feed/status       Audio autoplay diagnostics (v0.7+)`);
  console.log(`  /jobs                    Visual job board dashboard (multi-view, lessons, patterns)`);
  console.log(`  /jobs-classic            Legacy server-rendered job board (WS-0011)`);
  console.log(`  /state.json              Live state bundle (job-boards + lessons + briefing)`);
  console.log(`  /builder                 Interactive Persona Builder (form UI + pipeline API)`);
  console.log(`  /api/kokoro/stats        Kokoro queue depth + drop counters`);
  console.log(`  /terminal/ws             Browser terminal WebSocket (use BROWSER transport in launcher)`);
  console.log(``);
  console.log(`  State directory: ${STATE_DIR}`);
  console.log(`  Personas registry: ${PERSONAS_PATH}`);
  console.log(`  TTS output: ${TTS_OUTPUT_DIR}`);

  startAudioAutoplay();
});

process.on('SIGTERM', () => {
  if (audioState.playing) { try { process.kill(audioState.playing.pid); } catch {} }
  whisperServer.shutdown();
  process.exit(0);
});
process.on('SIGINT', () => {
  if (audioState.playing) { try { process.kill(audioState.playing.pid); } catch {} }
  whisperServer.shutdown();
  process.exit(0);
});
