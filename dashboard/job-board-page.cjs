// MultiDeck Job Board dashboard page renderer.
// Serves a cyberpunk-themed visual job board that reads all project boards
// from state/job-board-*.json and renders them as filterable, interactive lists.

const fs = require('fs');
const path = require('path');

function getJobBoards(stateDir) {
  const boards = [];

  // 1. Local state directory — job-board-*.json files
  try {
    const files = fs.readdirSync(stateDir).filter(f => f.startsWith('job-board') && f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf-8'));
        const stem = file.replace('.json', '').replace('job-board-', '').replace('job-board', 'default');
        boards.push({ key: stem, file: path.join(stateDir, file), jobs: data.jobs || [], meta: data.meta || {} });
      } catch (e) { /* skip corrupt files */ }
    }
  } catch (e) { /* state dir missing */ }

  // 2. Workspace scan — discover JOB_BOARD.json and job-board*.json in known project locations
  const workspaceRoot = process.env.DISPATCH_WORKSPACE_ROOT || process.env.DISPATCH_PROJECTS_DIR || '';
  if (workspaceRoot) {
    scanForBoards(workspaceRoot, boards, 6);
  }

  // Dedupe by file path
  const seen = new Set();
  return boards.filter(b => {
    const resolved = path.resolve(b.file);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return true;
  });
}

function scanForBoards(dir, boards, maxDepth) {
  if (maxDepth <= 0) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        if ((entry.name === 'JOB_BOARD.json' || (entry.name.startsWith('job-board') && entry.name.endsWith('.json')))) {
          try {
            const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
            // Determine a human-readable key from path or meta
            const projectName = data.meta?.project || deriveProjectName(full);
            const jobs = data.jobs || [];
            boards.push({ key: projectName, file: full, jobs, meta: data.meta || {} });
          } catch (e) { /* skip */ }
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('node_modules')) {
        scanForBoards(full, boards, maxDepth - 1);
      }
    }
  } catch (e) { /* permission denied or missing */ }
}

function deriveProjectName(filePath) {
  // Try to extract a meaningful name from the file path
  const parts = filePath.replace(/\\/g, '/').split('/');
  // Look for known project directories
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].toLowerCase();
    if (p === 'state' || p === 'coordination' || p === 'dashboards') continue;
    if (p.includes('job-board') || p === 'JOB_BOARD.json') continue;
    if (p.length > 2 && !p.match(/^\d+$/)) return p;
  }
  return path.basename(filePath, '.json');
}

function renderJobBoardPage(stateDir) {
  const boards = getJobBoards(stateDir);
  const boardsJson = JSON.stringify(boards);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>// MULTIDECK JOB BOARD //</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0014;
    color: #c0e0ff;
    font-family: 'VT323', monospace;
    min-height: 100vh;
    padding: 20px;
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
    margin-bottom: 4px;
  }
  .sub { font-size: 14px; color: #607090; letter-spacing: 2px; margin-bottom: 20px; }

  /* Board tabs */
  .board-tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .board-tab {
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    padding: 8px 16px;
    background: transparent;
    border: 2px solid #607090;
    color: #c0e0ff;
    cursor: pointer;
    letter-spacing: 2px;
    transition: all 0.15s;
  }
  .board-tab:hover { border-color: #00FFCC; color: #00FFCC; }
  .board-tab.active { background: rgba(0,255,204,0.1); border-color: #00FFCC; color: #00FFCC; }

  /* Filters */
  .filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .filter-btn {
    font-family: 'VT323', monospace;
    font-size: 16px;
    padding: 6px 14px;
    background: transparent;
    border: 1px solid #607090;
    color: #90a0c0;
    cursor: pointer;
    transition: all 0.15s;
  }
  .filter-btn:hover { border-color: #FF00AA; color: #FF00AA; }
  .filter-btn.active { background: rgba(255,0,170,0.1); border-color: #FF00AA; color: #FF00AA; }
  .filter-label { font-size: 13px; color: #607090; margin-right: 4px; letter-spacing: 1px; }

  /* Stats bar */
  .stats {
    display: flex; gap: 20px; margin-bottom: 20px; padding: 12px;
    border: 1px solid #1a1a2e;
  }
  .stat { text-align: center; }
  .stat-val { font-family: 'Press Start 2P', monospace; font-size: 16px; color: #00FFCC; }
  .stat-label { font-size: 13px; color: #607090; margin-top: 4px; }

  /* Job list */
  .job-list { list-style: none; }
  .job-item {
    display: grid;
    grid-template-columns: 60px 60px 120px 1fr 120px;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border-left: 3px solid #607090;
    margin-bottom: 2px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .job-item:hover { background: rgba(255,255,255,0.03); border-left-color: #00FFCC; }
  .job-item.expanded { background: rgba(0,255,204,0.05); border-left-color: #00FFCC; }

  .job-id { font-family: 'Press Start 2P', monospace; font-size: 9px; color: #607090; }
  .job-priority { font-family: 'Press Start 2P', monospace; font-size: 9px; }
  .job-priority.P0 { color: #EF4444; text-shadow: 0 0 4px #EF4444; }
  .job-priority.P1 { color: #F59E0B; text-shadow: 0 0 4px #F59E0B; }
  .job-priority.P2 { color: #00FFCC; }
  .job-priority.P3 { color: #607090; }

  .job-status {
    font-size: 13px;
    padding: 2px 8px;
    border: 1px solid;
    text-align: center;
    letter-spacing: 1px;
  }
  .job-status.open { border-color: #3B82F6; color: #3B82F6; }
  .job-status.assigned { border-color: #F59E0B; color: #F59E0B; }
  .job-status.active, .job-status.in_progress { border-color: #00FFCC; color: #00FFCC; }
  .job-status.submitted, .job-status.pending_review { border-color: #A855F7; color: #A855F7; }
  .job-status.passed, .job-status.approved { border-color: #22C55E; color: #22C55E; }
  .job-status.flagged { border-color: #EF4444; color: #EF4444; }
  .job-status.closed, .job-status.completed { border-color: #607090; color: #607090; }

  .job-subject { font-size: 16px; color: #c0e0ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .job-agent { font-size: 14px; color: #90a0c0; text-align: right; }

  /* Expanded detail — animated grow/shrink */
  .job-detail {
    max-height: 0;
    overflow: hidden;
    padding: 0 12px 0 72px;
    font-size: 15px;
    color: #90a0c0;
    line-height: 1.6;
    border-left: 3px solid #00FFCC;
    background: rgba(0,255,204,0.02);
    margin-bottom: 2px;
    transition: max-height 0.3s ease, padding 0.3s ease, opacity 0.2s ease;
    opacity: 0;
  }
  .job-detail.show {
    max-height: 300px;
    padding: 12px 12px 12px 72px;
    opacity: 1;
  }
  .job-detail .field { margin-bottom: 4px; }
  .job-detail .field-label { color: #607090; }
  .job-detail .field-val { color: #c0e0ff; }

  /* Boundary reminder */
  .boundary {
    padding: 8px 12px;
    border: 1px solid #EF4444;
    color: #EF4444;
    font-size: 13px;
    margin-bottom: 16px;
    letter-spacing: 1px;
  }

  /* Column header */
  .col-header {
    display: grid;
    grid-template-columns: 60px 60px 120px 1fr 120px;
    gap: 12px;
    padding: 6px 12px;
    font-size: 12px;
    color: #607090;
    letter-spacing: 1px;
    border-bottom: 1px solid #1a1a2e;
    margin-bottom: 4px;
  }

  .empty { color: #607090; font-size: 16px; padding: 40px; text-align: center; }
</style>
</head>
<body>
  <h1>// MULTIDECK JOB BOARD //</h1>
  <div class="sub">// project work queues and status tracking</div>

  <div class="boundary">AGENTS: You are viewing job boards. Each board is scoped to ONE project. Cross-project work routes through Dispatch.</div>

  <div class="board-tabs" id="board-tabs"></div>

  <div class="stats" id="stats"></div>

  <div class="filters">
    <span class="filter-label">STATUS:</span>
    <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">ALL</button>
    <button class="filter-btn" data-filter="open" onclick="setFilter('open')">OPEN</button>
    <button class="filter-btn" data-filter="active" onclick="setFilter('active')">ACTIVE</button>
    <button class="filter-btn" data-filter="flagged" onclick="setFilter('flagged')">FLAGGED</button>
    <button class="filter-btn" data-filter="closed" onclick="setFilter('closed')">CLOSED</button>
  </div>

  <div class="col-header">
    <span>ID</span>
    <span>PRI</span>
    <span>STATUS</span>
    <span>SUBJECT</span>
    <span style="text-align:right">AGENT</span>
  </div>

  <ul class="job-list" id="job-list"></ul>

<script>
  const allBoards = ${boardsJson};
  let currentBoard = allBoards.length > 0 ? allBoards[0].key : null;
  let currentFilter = 'all';

  function renderTabs() {
    const el = document.getElementById('board-tabs');
    el.innerHTML = allBoards.map(b =>
      '<button class="board-tab' + (b.key === currentBoard ? ' active' : '') +
      '" onclick="selectBoard(\\'' + b.key + '\\')">' +
      b.key.toUpperCase() + ' (' + b.jobs.length + ')</button>'
    ).join('');
  }

  function selectBoard(key) {
    currentBoard = key;
    renderTabs();
    renderJobs();
  }

  function setFilter(f) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
    renderJobs();
  }

  function getBoard() {
    return allBoards.find(b => b.key === currentBoard) || { jobs: [] };
  }

  function renderStats() {
    const board = getBoard();
    const jobs = board.jobs;
    const open = jobs.filter(j => j.status === 'open' || j.status === 'assigned').length;
    const active = jobs.filter(j => ['active', 'in_progress', 'submitted', 'pending_review'].includes(j.status)).length;
    const flagged = jobs.filter(j => j.status === 'flagged').length;
    const closed = jobs.filter(j => ['closed', 'completed', 'passed', 'approved'].includes(j.status)).length;
    const p0 = jobs.filter(j => j.priority === 'P0' && j.status !== 'closed' && j.status !== 'completed').length;

    document.getElementById('stats').innerHTML =
      '<div class="stat"><div class="stat-val">' + jobs.length + '</div><div class="stat-label">TOTAL</div></div>' +
      '<div class="stat"><div class="stat-val" style="color:#3B82F6">' + open + '</div><div class="stat-label">OPEN</div></div>' +
      '<div class="stat"><div class="stat-val" style="color:#00FFCC">' + active + '</div><div class="stat-label">ACTIVE</div></div>' +
      '<div class="stat"><div class="stat-val" style="color:#EF4444">' + flagged + '</div><div class="stat-label">FLAGGED</div></div>' +
      '<div class="stat"><div class="stat-val" style="color:#607090">' + closed + '</div><div class="stat-label">CLOSED</div></div>' +
      (p0 > 0 ? '<div class="stat"><div class="stat-val" style="color:#EF4444">' + p0 + '</div><div class="stat-label">P0 OPEN</div></div>' : '');
  }

  function filterJobs(jobs) {
    if (currentFilter === 'all') return jobs;
    if (currentFilter === 'open') return jobs.filter(j => j.status === 'open' || j.status === 'assigned');
    if (currentFilter === 'active') return jobs.filter(j => ['active', 'in_progress', 'submitted', 'pending_review'].includes(j.status));
    if (currentFilter === 'flagged') return jobs.filter(j => j.status === 'flagged');
    if (currentFilter === 'closed') return jobs.filter(j => ['closed', 'completed', 'passed', 'approved'].includes(j.status));
    return jobs;
  }

  function renderJobs() {
    renderStats();
    const board = getBoard();
    const jobs = filterJobs(board.jobs);
    const el = document.getElementById('job-list');

    if (jobs.length === 0) {
      el.innerHTML = '<div class="empty">No jobs match this filter.</div>';
      return;
    }

    // Sort: open/active first, then by priority, then by ID desc
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    const statusOrder = { flagged: 0, active: 1, in_progress: 1, submitted: 2, pending_review: 2, open: 3, assigned: 3, passed: 4, approved: 4, closed: 5, completed: 5 };
    const sorted = [...jobs].sort((a, b) => {
      const sa = statusOrder[a.status] ?? 9;
      const sb = statusOrder[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const pa = priorityOrder[a.priority] ?? 9;
      const pb = priorityOrder[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return parseInt(b.id) - parseInt(a.id);
    });

    el.innerHTML = sorted.map(j => {
      const id = 'JOB-' + j.id.toString().padStart(4, '0');
      const statusClass = j.status.replace(/ /g, '_');
      return '<li class="job-item" onclick="toggleDetail(\\'' + j.id + '\\')" data-id="' + j.id + '">' +
        '<span class="job-id">' + id + '</span>' +
        '<span class="job-priority ' + (j.priority || 'P2') + '">' + (j.priority || 'P2') + '</span>' +
        '<span class="job-status ' + statusClass + '">' + j.status.toUpperCase() + '</span>' +
        '<span class="job-subject">' + escapeHtml(j.subject) + '</span>' +
        '<span class="job-agent">' + escapeHtml(j.assigned_to || '-') + '</span>' +
        '</li>' +
        '<div class="job-detail" id="detail-' + j.id + '">' +
          (j.created_at ? '<div class="field"><span class="field-label">CREATED: </span><span class="field-val">' + j.created_at + '</span></div>' : '') +
          (j.accepted_at ? '<div class="field"><span class="field-label">ACCEPTED: </span><span class="field-val">' + j.accepted_at + '</span></div>' : '') +
          (j.submitted_at ? '<div class="field"><span class="field-label">SUBMITTED: </span><span class="field-val">' + j.submitted_at + '</span></div>' : '') +
          (j.output_path ? '<div class="field"><span class="field-label">OUTPUT: </span><span class="field-val">' + escapeHtml(j.output_path) + '</span></div>' : '') +
          (j.depends_on ? '<div class="field"><span class="field-label">DEPENDS ON: </span><span class="field-val">JOB-' + j.depends_on + '</span></div>' : '') +
          (j.review_history && j.review_history.length > 0 ?
            '<div class="field"><span class="field-label">REVIEWS: </span><span class="field-val">' +
            j.review_history.map(r => r.verdict.toUpperCase() + (r.note ? ': ' + escapeHtml(r.note) : '')).join(' | ') +
            '</span></div>' : '') +
        '</div>';
    }).join('');
  }

  function toggleDetail(id) {
    const el = document.getElementById('detail-' + id);
    const item = document.querySelector('.job-item[data-id="' + id + '"]');
    if (el) {
      el.classList.toggle('show');
      if (item) item.classList.toggle('expanded');
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  renderTabs();
  renderJobs();
</script>
</body>
</html>`;
}

module.exports = { renderJobBoardPage };
