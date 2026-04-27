// Shared app state + utility helpers
const App = {
  activeVariation: localStorage.getItem("mdk-variation") || "board",
  activeProject: "all",
  activePriorities: new Set(),
  activeAssignee: "all",
  search: "",
  showClosed: localStorage.getItem("mdk-show-closed") === "true",
  tweaksOn: false,
  density: localStorage.getItem("mdk-density") || "balanced",
  accent: localStorage.getItem("mdk-accent") || "cyan",
  scanlines: localStorage.getItem("mdk-scanlines") !== "off",
};

const STATUS_ORDER = ["open","accepted","submitted","in_review","blocked","closed"];
const STATUS_LABEL = {
  open: "OPEN",
  accepted: "ACCEPTED",
  submitted: "SUBMITTED",
  in_review: "IN REVIEW",
  blocked: "BLOCKED",
  closed: "CLOSED",
};

function relTime(iso) {
  if (!iso) return "—";
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000;
  const abs = Math.abs(diffSec);
  const sign = diffSec >= 0 ? "" : "+";
  if (abs < 60) return sign + Math.round(abs) + "s";
  if (abs < 3600) return sign + Math.round(abs/60) + "m";
  if (abs < 86400) return sign + Math.round(abs/3600) + "h";
  return sign + Math.round(abs/86400) + "d";
}

function personaOf(key) {
  return PERSONAS[key] || { callsign: key, color: "#8B94AE", scope: "" };
}

function filteredJobs() {
  return JOBS.filter(j => {
    if (!App.showClosed && j.status === "closed") return false;
    if (App.activeProject !== "all" && j.project !== App.activeProject) return false;
    if (App.activePriorities.size && !App.activePriorities.has(j.priority)) return false;
    if (App.activeAssignee !== "all" && j.assigned_to !== App.activeAssignee) return false;
    if (App.search) {
      const q = App.search.toLowerCase();
      const hay = (j.subject + " " + (j.tags||[]).join(" ") + " " + j.id).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Shell render ---------------------------------------------------
function renderBrand() {
  return `
    <div class="brand-mark">M</div>
    <div class="brand-name">MULTI<em>DECK</em> · OPS</div>
  `;
}

function renderTopbar() {
  const now = new Date();
  const t = now.toLocaleTimeString([], {hour12:false});
  const f = filteredJobs();
  const p0Open = f.filter(j=>j.priority==="P0" && j.status !== "closed").length;
  const inReview = f.filter(j=>j.status==="in_review").length;
  const blocked = f.filter(j=>j.status==="blocked").length;
  return `
    <div class="crumbs">
      <span>OPS</span><span class="sep">/</span>
      <span class="now">JOB-BOARD</span>
    </div>
    <div class="shortcuts">
      <a class="shortcut-btn" href="/launcher" target="_blank" rel="noopener">LAUNCHER</a>
      <a class="shortcut-btn" href="/audio-feed" target="_blank" rel="noopener">AUDIO FEED</a>
      <a class="shortcut-btn" href="/briefing" target="_blank" rel="noopener">BRIEFING</a>
    </div>
    <div class="spacer"></div>
    <div class="stat-strip">
      <div class="stat-pill ${p0Open>0?'red':''}"><div class="n">${p0Open}</div><div class="l">P0 · OPEN</div></div>
      <div class="stat-pill amber"><div class="n">${inReview}</div><div class="l">IN REVIEW</div></div>
      <div class="stat-pill ${blocked>0?'red':''}"><div class="n">${blocked}</div><div class="l">BLOCKED</div></div>
      <div class="stat-pill"><div class="n">${f.length}</div><div class="l">VISIBLE</div></div>
    </div>
    <div class="clock"><span class="pulse"></span>${t} · UTC${-now.getTimezoneOffset()/60>=0?'+':''}${-now.getTimezoneOffset()/60}</div>
  `;
}

function renderRail() {
  const projList = PROJECTS.map(p => {
    const n = JOBS.filter(j=>j.project===p.id && (App.showClosed || j.status!=="closed")).length;
    return `<li class="nav-item ${App.activeProject===p.id?'active':''}" data-project="${p.id}">
      <span class="dot" style="background:${p.color};box-shadow:0 0 6px ${p.color}"></span>
      <span style="flex:1">${p.name}</span>
      <span style="color:var(--ink-mute);font-size:10px">${n}</span>
    </li>`;
  }).join("");

  // roster — group by project, show agents working within each
  const agentsByProject = {};
  PROJECTS.forEach(p => { agentsByProject[p.id] = new Set(); });
  agentsByProject["_other"] = new Set();
  JOBS.forEach(j => {
    if (j.status === "closed") return;
    if (!(j.assigned_to in PERSONAS)) return;
    const bucket = agentsByProject[j.project] ? j.project : "_other";
    agentsByProject[bucket].add(j.assigned_to);
  });

  function agentRow(k, projectId) {
    const p = PERSONAS[k];
    const activeCount = JOBS.filter(j=>j.assigned_to===k && j.project===projectId && j.status!=="closed").length;
    const on = App.activeAssignee === k;
    return `<div class="roster-row ${on?'active':''}" data-assignee="${k}" title="${p.callsign} · ${p.scope}" style="--agent-color:${p.color}">
      <span class="chip" style="background:${p.color};color:${p.color}"></span>
      <span class="name">${p.callsign}</span>
      <span class="load">${activeCount>0?activeCount:"·"}</span>
    </div>`;
  }

  const rosterGroups = PROJECTS.map(proj => {
    const agents = [...agentsByProject[proj.id]];
    if (!agents.length) return "";
    // Sort by active count desc
    agents.sort((a,b) =>
      JOBS.filter(j=>j.assigned_to===b && j.project===proj.id && j.status!=="closed").length -
      JOBS.filter(j=>j.assigned_to===a && j.project===proj.id && j.status!=="closed").length
    );
    const projJobCount = JOBS.filter(j=>j.project===proj.id && j.status!=="closed").length;
    return `<div class="roster-group">
      <div class="roster-group-head">
        <span class="gdot" style="background:${proj.color};box-shadow:0 0 6px ${proj.color}"></span>
        <span class="gname">${proj.name}</span>
        <span class="gcount">${agents.length} · ${projJobCount}</span>
      </div>
      ${agents.map(k => agentRow(k, proj.id)).join("")}
    </div>`;
  }).join("");

  const otherAgents = [...agentsByProject["_other"]];
  const otherGroup = otherAgents.length ? `<div class="roster-group">
    <div class="roster-group-head">
      <span class="gdot"></span>
      <span class="gname">UNASSIGNED PROJECT</span>
      <span class="gcount">${otherAgents.length}</span>
    </div>
    ${otherAgents.map(k => {
      const p = PERSONAS[k];
      const activeCount = JOBS.filter(j=>j.assigned_to===k && j.status!=="closed").length;
      const on = App.activeAssignee === k;
      return `<div class="roster-row ${on?'active':''}" data-assignee="${k}" style="--agent-color:${p.color}">
        <span class="chip" style="background:${p.color};color:${p.color}"></span>
        <span class="name">${p.callsign}</span>
        <span class="load">${activeCount>0?activeCount:"·"}</span>
      </div>`;
    }).join("")}
  </div>` : "";

  const roster = rosterGroups + otherGroup;
  const rosterTotal = PROJECTS.reduce((n, p) => n + agentsByProject[p.id].size, 0) + otherAgents.length;

  return `
    <div class="rail-section">
      <div class="rail-label">PROJECTS</div>
      <ul class="nav-list">
        <li class="nav-item ${App.activeProject==='all'?'active':''}" data-project="all">
          <span class="dot"></span><span style="flex:1">ALL</span>
          <span style="color:var(--ink-mute);font-size:10px">${JOBS.length}</span>
        </li>
        ${projList}
      </ul>
    </div>
    <div class="rail-section">
      <div class="rail-label">VIEW</div>
      <ul class="nav-list">
        <li class="nav-item ${App.activeVariation==='board'?'active':''}" data-view="board">
          <span class="dot"></span>BOARD
        </li>
        <li class="nav-item ${App.activeVariation==='radar'?'active':''}" data-view="radar">
          <span class="dot"></span>DISPATCH RADAR
        </li>
        <li class="nav-item ${App.activeVariation==='cluster'?'active':''}" data-view="cluster">
          <span class="dot"></span>CONSTELLATION
        </li>
      </ul>
    </div>
    <div class="rail-section" style="flex:1;min-height:0;overflow:auto">
      <div class="rail-label">ROSTER <span class="count">${rosterTotal}</span></div>
      ${roster}
    </div>
  `;
}

function renderControls() {
  const priorities = ["P0","P1","P2","P3"];
  const chips = priorities.map(p => {
    const n = JOB_STATS.byPriority[p] || 0;
    const on = App.activePriorities.has(p);
    return `<span class="chip ${p.toLowerCase()} ${on?'on':''}" data-priority="${p}">
      ${p} <span class="n">${n}</span>
    </span>`;
  }).join("");
  return `
    <div class="search">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
      </svg>
      <input id="search" placeholder="search subject, tag, id…" value="${App.search}">
      <span class="kbd">/</span>
    </div>
    ${chips}
    <span class="chip ${App.showClosed?'on':''}" data-toggle="closed">SHOW CLOSED</span>
    <div class="right">
      <div class="seg" id="view-seg">
        <button class="${App.activeVariation==='board'?'on':''}" data-view="board">BOARD</button>
        <button class="${App.activeVariation==='radar'?'on':''}" data-view="radar">RADAR</button>
        <button class="${App.activeVariation==='cluster'?'on':''}" data-view="cluster">CONSTELLATION</button>
      </div>
    </div>
  `;
}

// Ticket renderer (used in board + drawer list)
function ticket(j) {
  const p = personaOf(j.assigned_to);
  const tags = (j.tags||[]).slice(0,3).map(t=>`<span class="tag">${t}</span>`).join("");
  const progress = j.status === "closed" ? null
    : (j.progress !== undefined ? j.progress : (j.status==="submitted" || j.status==="in_review" ? 1 : 0));
  return `
    <div class="ticket ${j.priority.toLowerCase()}" draggable="true" data-id="${j.id}">
      <div class="row">
        <span class="pbadge ${j.priority.toLowerCase()}">${j.priority}</span>
        <span class="id">#${j.id}</span>
      </div>
      <div class="subject">${j.subject}</div>
      <div class="meta">
        <span class="assignee" style="color:${p.color}">
          <span class="dot" style="background:${p.color}"></span>${p.callsign}
        </span>
        <span>·</span>
        <span>${relTime(j.created_at)} ago</span>
        ${j.blocked_reason?`<span>·</span><span style="color:var(--p0)">⚠ ${j.blocked_reason}</span>`:""}
      </div>
      ${progress!==null && progress>0 && progress<1 ? `<div class="progress"><span style="width:${Math.round(progress*100)}%"></span></div>`:""}
      ${tags?`<div class="meta">${tags}</div>`:""}
    </div>
  `;
}
