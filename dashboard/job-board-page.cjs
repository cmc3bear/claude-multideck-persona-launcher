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
            const meta = data.meta || {};
            const projectName = meta.project_name || meta.project || deriveProjectName(full);
            const jobs = data.jobs || [];
            boards.push({ key: projectName, file: full, jobs, meta });
          } catch (e) { /* skip */ }
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('node_modules')) {
        scanForBoards(full, boards, maxDepth - 1);
      }
    }
  } catch (e) { /* permission denied or missing */ }
}

function deriveProjectName(filePath) {
  const basename = path.basename(filePath, '.json');

  // If the filename itself encodes a project name (job-board-multideck.json → multideck), use it
  if (basename.startsWith('job-board-') && basename.length > 'job-board-'.length) {
    return basename.replace('job-board-', '');
  }

  // For generic names like JOB_BOARD.json, walk up the path to find the project
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const skip = new Set(['state', 'coordination', 'dashboards', 'data', 'config', '.']);
  for (let i = parts.length - 2; i >= 0; i--) {
    const p = parts[i];
    const lower = p.toLowerCase();
    if (skip.has(lower)) continue;
    if (lower.includes('job-board')) continue;
    if (/^\d{2}-/.test(p)) continue;
    if (p.length > 2) return p;
  }
  return basename;
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
    max-height: 600px;
    padding: 12px 12px 12px 72px;
    opacity: 1;
    overflow-y: auto;
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
    <button class="filter-btn active" data-group="status" data-filter="all" onclick="setFilter('status','all')">ALL</button>
    <button class="filter-btn" data-group="status" data-filter="open" onclick="setFilter('status','open')">OPEN</button>
    <button class="filter-btn" data-group="status" data-filter="active" onclick="setFilter('status','active')">ACTIVE</button>
    <button class="filter-btn" data-group="status" data-filter="flagged" onclick="setFilter('status','flagged')">FLAGGED</button>
    <button class="filter-btn" data-group="status" data-filter="closed" onclick="setFilter('status','closed')">CLOSED</button>
  </div>
  <div class="filters">
    <span class="filter-label">PRIORITY:</span>
    <button class="filter-btn active" data-group="priority" data-filter="all" onclick="setFilter('priority','all')">ALL</button>
    <button class="filter-btn" data-group="priority" data-filter="P0" onclick="setFilter('priority','P0')">P0</button>
    <button class="filter-btn" data-group="priority" data-filter="P1" onclick="setFilter('priority','P1')">P1</button>
    <button class="filter-btn" data-group="priority" data-filter="P2" onclick="setFilter('priority','P2')">P2</button>
    <button class="filter-btn" data-group="priority" data-filter="P3" onclick="setFilter('priority','P3')">P3</button>
  </div>
  <div class="filters">
    <span class="filter-label">AGENT:</span>
    <button class="filter-btn active" data-group="agent" data-filter="all" onclick="setFilter('agent','all')">ALL</button>
    <div id="agent-filters"></div>
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
  const filters = { status: 'all', priority: 'all', agent: 'all' };

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
    renderAgentFilters();
    renderJobs();
  }

  function setFilter(group, value) {
    filters[group] = value;
    document.querySelectorAll('.filter-btn[data-group="' + group + '"]').forEach(
      b => b.classList.toggle('active', b.dataset.filter === value)
    );
    renderJobs();
  }

  function renderAgentFilters() {
    const board = getBoard();
    const agents = [...new Set(board.jobs.map(j => j.assigned_to).filter(Boolean))].sort();
    const el = document.getElementById('agent-filters');
    el.innerHTML = agents.map(a =>
      '<button class="filter-btn' + (filters.agent === a ? ' active' : '') +
      '" data-group="agent" data-filter="' + a + '" onclick="setFilter(\\'agent\\',\\'' + a + '\\')">' +
      a.toUpperCase() + '</button>'
    ).join('');
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
    let result = jobs;

    // Status filter
    if (filters.status !== 'all') {
      if (filters.status === 'open') result = result.filter(j => j.status === 'open' || j.status === 'assigned' || j.status === 'pending');
      else if (filters.status === 'active') result = result.filter(j => ['active', 'in_progress', 'submitted', 'pending_review', 'accepted'].includes(j.status));
      else if (filters.status === 'flagged') result = result.filter(j => j.status === 'flagged' || j.status === 'blocked');
      else if (filters.status === 'closed') result = result.filter(j => ['closed', 'completed', 'passed', 'approved', 'cancelled'].includes(j.status));
    }

    // Priority filter
    if (filters.priority !== 'all') {
      result = result.filter(j => j.priority === filters.priority);
    }

    // Agent filter
    if (filters.agent !== 'all') {
      result = result.filter(j => j.assigned_to === filters.agent);
    }

    return result;
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
      const rawId = String(j.id || '');
      const id = rawId.startsWith('JOB-') ? rawId : 'JOB-' + rawId.padStart(4, '0');
      const statusClass = j.status.replace(/ /g, '_');
      return '<li class="job-item" onclick="toggleDetail(\\'' + j.id + '\\')" data-id="' + j.id + '">' +
        '<span class="job-id">' + id + '</span>' +
        '<span class="job-priority ' + (j.priority || 'P2') + '">' + (j.priority || 'P2') + '</span>' +
        '<span class="job-status ' + statusClass + '">' + j.status.toUpperCase() + '</span>' +
        '<span class="job-subject">' + escapeHtml(j.subject) + '</span>' +
        '<span class="job-agent">' + escapeHtml(j.assigned_to || '-') + '</span>' +
        '</li>' +
        '<div class="job-detail" id="detail-' + j.id + '">' +
          // Description / objective
          (j.description ? '<div class="field"><span class="field-label">DESCRIPTION: </span><span class="field-val">' + escapeHtml(j.description) + '</span></div>' : '') +
          // Posted by (OQE format)
          (j.posted_by ? '<div class="field"><span class="field-label">POSTED BY: </span><span class="field-val">' + escapeHtml(j.posted_by) + '</span></div>' : '') +
          // Lifecycle timestamps
          '<div class="field"><span class="field-label">LIFECYCLE: </span><span class="field-val">' +
            (j.created_at ? 'Created ' + formatDate(j.created_at) : '') +
            (j.accepted_at ? ' &#8594; Accepted ' + formatDate(j.accepted_at) : '') +
            (j.submitted_at ? ' &#8594; Submitted ' + formatDate(j.submitted_at) : '') +
            (j.completed_at ? ' &#8594; Completed ' + formatDate(j.completed_at) : '') +
          '</span></div>' +
          // Dependencies
          (j.depends_on ? '<div class="field"><span class="field-label">DEPENDS ON: </span><span class="field-val">JOB-' + j.depends_on + '</span></div>' : '') +
          // Meeting reference (OQE format)
          (j.meeting_ref ? '<div class="field"><span class="field-label">MEETING: </span><span class="field-val">' + escapeHtml(j.meeting_ref) + '</span></div>' : '') +
          // Output path
          (j.output_path ? '<div class="field"><span class="field-label">OUTPUT: </span><span class="field-val">' + escapeHtml(j.output_path) + '</span></div>' : '') +
          // Result (OQE format — the OQE evidence/outcome)
          (j.result ? '<div class="field"><span class="field-label">RESULT: </span><span class="field-val">' + escapeHtml(j.result) + '</span></div>' : '') +
          // Review history (MultiDeck format)
          (j.review_history && j.review_history.length > 0 ?
            '<div class="field"><span class="field-label">REVIEWS: </span><span class="field-val">' +
            j.review_history.map(r => r.verdict.toUpperCase() + (r.note ? ': ' + escapeHtml(r.note) : '')).join(' | ') +
            '</span></div>' : '') +
          // Tags (OQE format)
          (j.tags && j.tags.length > 0 ? '<div class="field"><span class="field-label">TAGS: </span><span class="field-val">' + j.tags.join(', ') + '</span></div>' : '') +
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

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return d.getFullYear() + '-' + month + '-' + day + ' ' + hours + ':' + mins;
    } catch (e) { return iso; }
  }

  renderTabs();
  renderAgentFilters();
  renderJobs();
</script>
</body>
</html>`;
}

module.exports = { renderJobBoardPage };
