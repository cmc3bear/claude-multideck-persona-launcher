const http = require('http');
const { renderAudioFeedPage } = require('./audio-feed-page.cjs');
const fs = require('fs');
const path = require('path');

// Configuration via environment variables
const PORT = Number(process.env.DISPATCH_PORT) || 3045;
const STATE_DIR = process.env.DISPATCH_STATE_DIR || path.join(__dirname, '..', 'state');
const DISPATCH_ROOT = process.env.DISPATCH_ROOT || path.join(__dirname, '..');
const TTS_OUTPUT_DIR = process.env.DISPATCH_TTS_OUTPUT || path.join(DISPATCH_ROOT, 'tts-output');

// Ensure state directory exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

const SOURCES = [
  'actions',
  'dispatch-log',
  'calendar',
  'escalations',
  'followups',
  'project-summary',
  'inbox-flags',
  'state-meta',
  'morning-pipeline',
  'pulse-log',
  'weather',
  'job-board',
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
<title>MultiDeck Dashboard</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  h1 { color: #0088FF; margin-top: 0; }
  h2 { color: #333; border-bottom: 2px solid #0088FF; padding-bottom: 8px; }
  .card { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  .stat { font-size: 24px; font-weight: bold; color: #0088FF; }
  .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { text-align: left; padding: 10px; border-bottom: 2px solid #0088FF; background: #f9f9f9; }
  td { padding: 10px; border-bottom: 1px solid #eee; }
  tr:hover { background: #f9f9f9; }
  .muted { color: #999; font-size: 13px; }
  .red { color: #d32f2f; }
  .yellow { color: #f57f17; }
  .green { color: #388e3c; }
  a { color: #0088FF; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .nav { margin-bottom: 20px; }
  .nav a { display: inline-block; padding: 8px 16px; margin-right: 10px; background: #0088FF; color: white; border-radius: 4px; }
  .nav a:hover { opacity: 0.9; }
</style>
</head>
<body>
<h1>MultiDeck Dashboard</h1>

<div class="nav">
  <a href="/">Dashboard</a>
  <a href="/briefing">Briefing</a>
  <a href="/audio-feed">Audio Feed</a>
  <a href="/state.json">State</a>
</div>

<div class="card">
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px;">
    <div>
      <div class="stat">${actionCount}</div>
      <div class="stat-label">Action Items</div>
    </div>
    <div>
      <div class="stat">${eventCount}</div>
      <div class="stat-label">Events Today</div>
    </div>
    <div>
      <div class="stat ${escalations > 0 ? 'red' : ''}">${escalations}</div>
      <div class="stat-label">Escalations</div>
    </div>
  </div>
</div>

<h2>Actions</h2>
<div class="card">
  ${state.actions && state.actions.personal && state.actions.personal.length > 0
    ? '<table>' + state.actions.personal.map(a => `<tr><td><strong>${esc(a.what)}</strong></td><td class="muted">${esc(a.due || '-')}</td></tr>`).join('') + '</table>'
    : '<div class="muted">No action items.</div>'
  }
</div>

<h2>Today's Schedule</h2>
<div class="card">
  ${state.calendar && state.calendar.agenda && state.calendar.agenda.length > 0
    ? '<table>' + state.calendar.agenda.map(e => `<tr><td>${esc(e.time)}</td><td><strong>${esc(e.title)}</strong></td><td class="muted">${esc(e.duration_min || '-')} min</td></tr>`).join('') + '</table>'
    : '<div class="muted">No events scheduled.</div>'
  }
</div>

<h2>Weather</h2>
<div class="card">
  ${state.weather && state.weather.current
    ? \`<div>\${esc(state.weather.current.temperature_f)}°F &mdash; \${esc(state.weather.current.description)}</div>\`
    : '<div class="muted">No weather data available.</div>'
  }
</div>

<footer style="margin-top: 40px; color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">
  <p>MultiDeck Framework &mdash; State directory: ${esc(STATE_DIR)}</p>
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
<pre>${JSON.stringify(briefingData, null, 2)}</pre>
</body>
</html>`;
}

function listAudioFiles() {
  try {
    if (!fs.existsSync(TTS_OUTPUT_DIR)) {
      return [];
    }
    const files = fs.readdirSync(TTS_OUTPUT_DIR)
      .filter(f => f.endsWith('.mp3'))
      .map(f => ({
        filename: f,
        path: path.join(TTS_OUTPUT_DIR, f),
        time: fs.statSync(path.join(TTS_OUTPUT_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    return files;
  } catch {
    return [];
  }
}

function handleAudioFeed(req, res) {
  const files = listAudioFiles();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ files: files.map(f => ({ filename: f.filename })) }));
}

function handleAudioFile(req, res, filename) {
  const safeFilename = path.basename(filename);
  const filepath = path.join(TTS_OUTPUT_DIR, safeFilename);

  // Security check: ensure path is within TTS_OUTPUT_DIR
  if (!filepath.startsWith(TTS_OUTPUT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filepath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
  fs.createReadStream(filepath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderMainDashboard());
  } else if (pathname === '/briefing') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderBriefing());
  } else if (pathname === '/audio-feed') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderAudioFeedPage());
  } else if (pathname === '/audio-feed/list') {
    handleAudioFeed(req, res);
  } else if (pathname.startsWith('/audio-feed/mp3/')) {
    const filename = pathname.slice('/audio-feed/mp3/'.length);
    handleAudioFile(req, res, filename);
  } else if (pathname === '/state.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(loadState(), null, 2));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`MultiDeck Dashboard running on http://localhost:${PORT}`);
  console.log(`  State directory: ${STATE_DIR}`);
  console.log(`  TTS output: ${TTS_OUTPUT_DIR}`);
});
