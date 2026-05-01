// =========================================================
// Variation A — BOARD (kanban)
// =========================================================

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// Synthesize additional plausible dependencies for jobs that have none.
// Heuristics, applied once:
//   - Closed audit/design jobs in the same project become prereqs for
//     active build jobs posted after them.
//   - Refactor/infra jobs block feature work in the same project.
//   - "Dispatch access/blocker" jobs gate any kernel/inspector work.
// This runs once on load; we never mutate if a job already has deps.
(function synthesizeDeps() {
  if (!window.JOBS || window.__depsSynthesized) return;
  window.__depsSynthesized = true;

  const byId = Object.fromEntries(JOBS.map(j => [j.id, j]));
  const addDep = (job, blockerId) => {
    if (!byId[blockerId]) return;
    if (job.id === blockerId) return;
    job.depends_on = job.depends_on || [];
    if (!job.depends_on.includes(blockerId)) job.depends_on.push(blockerId);
  };

  const tagLike = (j, kw) =>
    (j.tags||[]).some(t => t.toLowerCase().includes(kw)) ||
    j.subject.toLowerCase().includes(kw);

  JOBS.forEach(job => {
    const active = job.status !== "closed";
    if (!active) return;
    if (job.depends_on && job.depends_on.length) return;

    const sameProj = JOBS.filter(j =>
      j.id !== job.id && j.project === job.project
    );

    // 1. If job is a build/feature/ui job, depend on closed audits/design
    if (tagLike(job, "ui") || tagLike(job, "refactor") || tagLike(job, "feature") || tagLike(job, "redesign")) {
      const designDeps = sameProj.filter(j =>
        (tagLike(j, "audit") || tagLike(j, "design") || tagLike(j, "protocol")) &&
        (j.status === "closed" || j.status === "submitted" || j.status === "in_review")
      ).slice(0, 2);
      designDeps.forEach(d => addDep(job, d.id));
    }

    // 2. Reliability/SSE/queue work blocks later feature work in same proj
    if (tagLike(job, "feature") || tagLike(job, "ui")) {
      const infra = sameProj.filter(j =>
        (tagLike(j, "reliability") || tagLike(j, "sse") || tagLike(j, "queue")) &&
        j.status !== "closed"
      ).slice(0, 1);
      infra.forEach(d => addDep(job, d.id));
    }

    // 3. Access/blocker jobs gate security/audit work
    if (tagLike(job, "audit") || tagLike(job, "security")) {
      const access = JOBS.filter(j =>
        (tagLike(j, "access") || tagLike(j, "blocker")) && j.status !== "closed"
      );
      access.forEach(d => addDep(job, d.id));
    }

    // 4. Commercial/VO work: extended cuts depend on VO audition
    if (tagLike(job, "commercial") && tagLike(job, "extend")) {
      const vo = JOBS.find(j => tagLike(j, "audition") || tagLike(j, "vo"));
      if (vo) addDep(job, vo.id);
    }

    // 5. Persona/archive work depends on governance boundaries
    if (tagLike(job, "persona") || tagLike(job, "archive")) {
      const gov = JOBS.find(j => tagLike(j, "governance") || tagLike(j, "boundaries"));
      if (gov) addDep(job, gov.id);
    }

    // 6. Observability/ML jobs depend on governance + any closed changelog
    if (tagLike(job, "observability") || tagLike(job, "ml")) {
      const boundary = JOBS.find(j => tagLike(j, "boundaries"));
      const changelog = JOBS.find(j => tagLike(j, "changelog"));
      if (boundary) addDep(job, boundary.id);
      if (changelog) addDep(job, changelog.id);
    }
  });

  // Chain closed work for visual depth in "closed" view too
  const byProj = {};
  JOBS.filter(j => j.status === "closed").forEach(j => {
    (byProj[j.project] = byProj[j.project] || []).push(j);
  });
  Object.values(byProj).forEach(list => {
    list.sort((a,b) => new Date(a.closed_at||a.created_at) - new Date(b.closed_at||b.created_at));
    for (let i = 1; i < list.length; i++) {
      if (list[i].depends_on && list[i].depends_on.length) continue;
      if (Math.random() < 0.5) addDep(list[i], list[i-1].id);
    }
  });
})();

function renderBoardView(root) {
  const columns = STATUS_ORDER.filter(s => App.showClosed || s !== "closed");
  const jobs = filteredJobs();
  const byStatus = {};
  columns.forEach(s => byStatus[s] = []);
  jobs.forEach(j => { if (byStatus[j.status]) byStatus[j.status].push(j); });

  // Sort within column: P0 first, newest first
  const prioRank = {P0:0,P1:1,P2:2,P3:3};
  columns.forEach(s => byStatus[s].sort((a,b) =>
    (prioRank[a.priority]-prioRank[b.priority]) ||
    (new Date(b.created_at) - new Date(a.created_at))
  ));

  root.className = "view-board";
  root.innerHTML = columns.map(s => `
    <div class="col" data-status="${s}">
      <div class="col-head">
        <div><span class="swatch" style="display:inline-block"></span>${STATUS_LABEL_SHORT[s]}</div>
        <div class="n">${byStatus[s].length}</div>
      </div>
      <div class="col-list" data-drop="${s}">
        ${byStatus[s].map(ticket).join("") || '<div style="color:var(--ink-mute);font-size:11px;letter-spacing:0.1em;text-align:center;padding:20px 0">— EMPTY —</div>'}
      </div>
    </div>
  `).join("");

  // drag + drop
  root.querySelectorAll(".ticket").forEach(el => {
    el.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", el.dataset.id);
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
    el.addEventListener("click", () => openDrawer(el.dataset.id));
  });
  root.querySelectorAll(".col-list").forEach(list => {
    list.addEventListener("dragover", e => { e.preventDefault(); list.classList.add("drop-target"); });
    list.addEventListener("dragleave", () => list.classList.remove("drop-target"));
    list.addEventListener("drop", e => {
      e.preventDefault(); list.classList.remove("drop-target");
      const id = e.dataTransfer.getData("text/plain");
      const job = JOBS.find(j => j.id === id);
      if (job) { job.status = list.dataset.drop; renderAll(); }
    });
  });
}

// =========================================================
// Variation B — DISPATCH RADAR (pipeline lanes)
// Horizontal axis = lifecycle phase (OPEN → CLOSED).
// Bar length = time-in-phase (aging pressure).
// =========================================================
const PHASES = [
  { key:"open",      label:"OPEN",      color:"var(--accent)" },
  { key:"accepted",  label:"ACCEPTED",  color:"#60A5FA" },
  { key:"submitted", label:"SUBMITTED", color:"#A855F7" },
  { key:"in_review", label:"IN REVIEW", color:"var(--p1)" },
  { key:"closed",    label:"CLOSED",    color:"var(--pass)" },
];
const BLOCKED_PHASE = { key:"blocked", label:"BLOCKED", color:"var(--p0)" };

function phaseIndex(j) {
  if (j.status === "blocked") return 0.5; // sits between open and accepted visually
  const i = PHASES.findIndex(p => p.key === j.status);
  return i < 0 ? 0 : i;
}

// Time a job entered its current phase
function phaseEnteredAt(j) {
  if (j.status === "closed"    && j.closed_at)    return new Date(j.closed_at).getTime();
  if (j.status === "in_review" && j.submitted_at) return new Date(j.submitted_at).getTime();
  if (j.status === "submitted" && j.submitted_at) return new Date(j.submitted_at).getTime();
  if (j.status === "accepted"  && j.accepted_at)  return new Date(j.accepted_at).getTime();
  return new Date(j.created_at).getTime();
}

function renderRadarView(root) {
  const jobs = filteredJobs();
  const agents = [...new Set(jobs.map(j => j.assigned_to))]
    .sort((a,b) => (JOBS.filter(j=>j.assigned_to===b && j.status!=="closed").length)
                 - (JOBS.filter(j=>j.assigned_to===a && j.status!=="closed").length));

  // Phase-axis layout: each phase is one equal column.
  const cols = PHASES.length;
  const colPct = 100 / cols;

  // Age scale: map 0..72h time-in-phase to 55%..95% of a column's width.
  const HOUR = 3600e3;
  const MAX_AGE = 72 * HOUR;
  const ageToWidth = (ageMs) => {
    const n = Math.max(0, Math.min(1, ageMs / MAX_AGE));
    return colPct * (0.55 + n * 0.4); // 55% min, 95% max within a column
  };

  const phaseHeader = PHASES.map(ph => {
    const countInPhase = jobs.filter(j => j.status === ph.key).length;
    return `<div class="tick" style="grid-column:span 1;color:${ph.color}">
      <div style="font-family:var(--pixel);font-size:8px;letter-spacing:0.18em">▸ ${ph.label}</div>
      <div style="font-family:var(--display);color:var(--ink);font-size:13px;font-weight:600;margin-top:2px">${countInPhase}</div>
    </div>`;
  }).join("");

  const laneGutter = agents.map(k => {
    const p = personaOf(k);
    const activeCount = JOBS.filter(j=>j.assigned_to===k && j.status!=="closed").length;
    const maxLoad = 8;
    const loadPct = Math.min(100, activeCount/maxLoad*100);
    const on = App.activeAssignee === k;
    return `<div class="lane-row ${on?'active':''}" style="--agent-color:${p.color}" data-assignee="${k}">
      <div class="avatar" style="color:${p.color}">${escapeHtml(p.callsign.slice(0,2).toUpperCase())}</div>
      <div class="meta">
        <div class="name">${escapeHtml(p.callsign)}</div>
        <div class="load" title="${activeCount} of ${maxLoad} max concurrent jobs">
          <span class="loadbar"><span style="width:${loadPct}%"></span></span>
          <span class="lpct">${activeCount}/${maxLoad}</span>
        </div>
      </div>
    </div>`;
  }).join("");

  // Track backgrounds: vertical column separators for phases
  // First pass: count bars per (agent, column) so we can vertically center them.
  const stackTotalsByAgent = {};
  agents.forEach(k => {
    stackTotalsByAgent[k] = {};
    jobs.filter(j => j.assigned_to === k).forEach(j => {
      const isBlocked = j.status === "blocked";
      const colKey = isBlocked ? "blocked" : PHASES[phaseIndex(j)].key;
      stackTotalsByAgent[k][colKey] = (stackTotalsByAgent[k][colKey] || 0) + 1;
    });
  });

  const TRACK_H = 110;
  const BAR_H = 28;
  const BAR_GAP = 4;

  const laneTracks = agents.map(k => {
    const p = personaOf(k);
    const agentJobs = jobs.filter(j => j.assigned_to === k)
      .sort((a,b) => phaseIndex(a) - phaseIndex(b));

    // Stack bars within the same phase column
    const stackByCol = {};
    const bars = agentJobs.map(j => {
      const isBlocked = j.status === "blocked";
      const col = isBlocked ? 0 : phaseIndex(j);
      const enteredAt = phaseEnteredAt(j);
      const age = Date.now() - enteredAt;
      const width = isBlocked ? colPct * 0.55 : ageToWidth(age);
      const left = isBlocked ? colPct * 0.22 : col * colPct + 4; // small gutter inside column

      const ageH = Math.max(0, Math.round(age / HOUR));
      const ageLabel = ageH < 1 ? "<1h" : (ageH < 24 ? ageH+"h" : Math.round(ageH/24)+"d");
      const ageStress = Math.min(1, age / MAX_AGE);
      const stressClass = (j.status !== "closed" && ageStress > 0.6) ? "stale" : "";

      // Vertical centering: total stack height = N*BAR_H + (N-1)*BAR_GAP
      const colKey = isBlocked ? "blocked" : PHASES[col].key;
      const total = Math.min(3, stackTotalsByAgent[k][colKey] || 1);
      const stackH = total * BAR_H + (total - 1) * BAR_GAP;
      const stackTop = (TRACK_H - stackH) / 2;

      const row = stackByCol[colKey] || 0;
      stackByCol[colKey] = row + 1;
      if (row >= 3) return ""; // cap overflow at 3 visible bars
      const top = stackTop + row * (BAR_H + BAR_GAP);

      return `<div class="radar-bar ${j.priority.toLowerCase()} ${j.status} ${stressClass}" data-id="${j.id}"
        style="left:${left}%; width:${width}%; top:${top}px" title="#${j.id} · ${escapeHtml(j.subject)} · ${ageLabel}">
        <span class="pid">#${j.id}</span><span class="bsubj">${escapeHtml(j.subject)}</span>
        <span class="bage">${ageLabel}</span>
      </div>`;
    }).join("");
    return `<div class="radar-track phase-track" style="--agent-color:${p.color}" data-assignee="${k}">${bars}</div>`;
  }).join("");

  // Ticker
  const verdicts = JOBS
    .filter(j => j.review_history && j.review_history.length)
    .slice(0, 12)
    .flatMap(j => j.review_history.map(r => ({id: j.id, subject: j.subject, ...r})));
  const tickerItems = verdicts.concat(verdicts).map(v =>
    `<span class="ticker-item">
      <span class="verdict ${v.verdict}">${escapeHtml(v.verdict.toUpperCase())}</span>
      <span style="color:var(--ink-mute)">#${v.id}</span>
      <span>${escapeHtml(v.subject)}</span>
    </span>`
  ).join("");

  root.className = "view-radar";
  root.innerHTML = `
    <div class="radar-head">
      <div class="corner">OPERATIVE · PIPELINE</div>
      <div class="radar-axis phase-axis" style="grid-template-columns:repeat(${cols},1fr)">${phaseHeader}</div>
    </div>
    <div class="radar-body">
      <div class="lane-gutter">${laneGutter}</div>
      <div class="radar-tracks phase-tracks" style="--cols:${cols}">
        ${laneTracks}
      </div>
    </div>
    <div class="radar-ticker">
      <span class="label">▸ REVIEWER LOG</span>
      <div class="reel">${tickerItems}</div>
    </div>
  `;

  root.querySelectorAll(".radar-bar").forEach(b => {
    b.addEventListener("click", () => openDrawer(b.dataset.id));
  });
  root.querySelectorAll(".lane-row[data-assignee]").forEach(el => {
    el.addEventListener("click", () => {
      App.activeAssignee = (App.activeAssignee === el.dataset.assignee) ? "all" : el.dataset.assignee;
      renderAll();
    });
  });
}

// =========================================================
// Variation C — DEPENDENCY GRAPH (layered DAG)
// Jobs arranged left→right by depth in the dependency chain.
// Arrows flow blocker → blocked. Hover a node to light up its
// upstream (what's blocking it) and downstream (what it blocks).
// =========================================================
function renderClusterView(root) {
  const jobs = filteredJobs();
  const byId = {};
  jobs.forEach(j => byId[j.id] = j);

  // Build adjacency: j.depends_on = blockers. So edges go blocker → j.
  // Only keep edges where both nodes are in current filter.
  const outgoing = {}; // blocker -> [blocked]
  const incoming = {}; // blocked -> [blockers]
  jobs.forEach(j => { outgoing[j.id] = []; incoming[j.id] = []; });
  jobs.forEach(j => {
    (j.depends_on || []).forEach(dep => {
      if (!byId[dep]) return;
      outgoing[dep].push(j.id);
      incoming[j.id].push(dep);
    });
  });

  // Assign depth (longest-path from a root). Roots = nodes with no incoming.
  const depth = {};
  function computeDepth(id, stack = new Set()) {
    if (depth[id] !== undefined) return depth[id];
    if (stack.has(id)) return 0; // cycle guard
    stack.add(id);
    const ins = incoming[id];
    if (!ins.length) { depth[id] = 0; return 0; }
    let d = 0;
    ins.forEach(b => { d = Math.max(d, computeDepth(b, stack) + 1); });
    depth[id] = d;
    stack.delete(id);
    return d;
  }
  jobs.forEach(j => computeDepth(j.id));

  // Group nodes by depth
  const layers = {};
  jobs.forEach(j => {
    const d = depth[j.id];
    (layers[d] = layers[d] || []).push(j);
  });
  const layerKeys = Object.keys(layers).map(Number).sort((a,b)=>a-b);
  const maxDepth = layerKeys[layerKeys.length-1] || 0;

  // Sort within each layer: P0 → P3, then by number of downstream blocked (more critical = higher)
  const prioRank = {P0:0,P1:1,P2:2,P3:3};
  layerKeys.forEach(d => {
    layers[d].sort((a,b) =>
      (prioRank[a.priority]-prioRank[b.priority]) ||
      (outgoing[b.id].length - outgoing[a.id].length) ||
      a.id.localeCompare(b.id)
    );
  });

  // Isolated jobs: depth 0 AND no outgoing edges = no dependency info. Pull them
  // out so they don't pollute the "ROOTS" column with meaningless stacks.
  const isolatedSet = new Set();
  layers[0] = (layers[0] || []).filter(j => {
    if (outgoing[j.id].length === 0) { isolatedSet.add(j.id); return false; }
    return true;
  });
  const isolated = jobs.filter(j => isolatedSet.has(j.id));
  if (layers[0] && layers[0].length === 0) delete layers[0];
  const layerKeysLive = Object.keys(layers).map(Number).sort((a,b)=>a-b);
  const maxDepthLive = layerKeysLive.length ? layerKeysLive[layerKeysLive.length-1] : 0;

  // Dependency stats
  const totalEdges = jobs.reduce((n,j) => n + (incoming[j.id]?.length || 0), 0);
  const connectedCount = jobs.length - isolated.length;

  root.className = "view-cluster";
  root.innerHTML = `
    <div class="dag-shell">
      <div class="dag-intro">
        <div class="di-left">
          <div class="di-label">▸ DEPENDENCY GRAPH</div>
          <div class="di-title">Who's blocking whom</div>
        </div>
        <div class="di-stats">
          <div class="di-kv"><span class="k">${jobs.length}</span><span class="lbl">JOBS</span></div>
          <div class="di-kv"><span class="k">${totalEdges}</span><span class="lbl">LINKS</span></div>
          <div class="di-kv"><span class="k">${connectedCount}</span><span class="lbl">LINKED</span></div>
          <div class="di-kv"><span class="k">${isolated.length}</span><span class="lbl">STANDALONE</span></div>
        </div>
        <div class="di-legend">
          <span class="lg"><span class="sw arrow"></span>FLOW = BLOCKER → BLOCKED</span>
          <span class="lg"><span class="sw root"></span>ROOTS</span>
          <span class="lg"><span class="sw leaf"></span>LEAVES</span>
          <span class="lg">HOVER TO TRACE CHAIN</span>
        </div>
      </div>

      <div class="dag-stage" id="dag-stage">
        <div class="dag-axis">
          ${layerKeysLive.map(d => `
            <div class="dag-layer-head" style="left:calc(${d} * var(--col-w) + var(--col-w)/2 + var(--pad-x, 32px))">
              <div class="ltick">DEPTH ${d}</div>
              <div class="lname">${d===0?'ROOTS':d===maxDepthLive?'LEAVES':'CHAIN L'+d}</div>
              <div class="lcount">${layers[d].length} JOB${layers[d].length===1?'':'S'}</div>
            </div>
          `).join("")}
        </div>
        <svg id="dag-edges"></svg>
        <div class="dag-nodes" id="dag-nodes"></div>
      </div>

      ${isolated.length ? `
      <div class="dag-iso">
        <div class="dag-iso-head">
          <span class="di-label">▸ STANDALONE (${isolated.length})</span>
          <span class="di-hint">No known dependencies in either direction</span>
        </div>
        <div class="dag-iso-grid" id="dag-iso-grid"></div>
      </div>` : ''}
    </div>
    <aside class="cluster-side" id="cluster-side"></aside>
  `;

  const stage = root.querySelector("#dag-stage");
  const svg = root.querySelector("#dag-edges");
  const nodesLayer = root.querySelector("#dag-nodes");
  const side = root.querySelector("#cluster-side");
  const isoGrid = root.querySelector("#dag-iso-grid");

  // Layout: columns per depth, rows within depth spaced evenly.
  const colW = 270;
  const rowH = 92;
  const padX = 36, padY = 78;
  const maxRows = Math.max(1, ...layerKeysLive.map(d => layers[d].length));

  const stageW = padX*2 + (maxDepthLive+1) * colW;
  const stageH = padY + maxRows * rowH + 40;
  stage.style.setProperty("--col-w", colW + "px");
  stage.style.setProperty("--pad-x", padX + "px");
  stage.style.width = stageW + "px";
  stage.style.minHeight = stageH + "px";

  const pos = {};
  layerKeysLive.forEach(d => {
    const list = layers[d];
    const totalH = list.length * rowH;
    const startY = padY + (maxRows * rowH - totalH) / 2;
    list.forEach((j, i) => {
      pos[j.id] = {
        x: padX + d * colW + colW/2,
        y: startY + i * rowH + rowH/2,
      };
    });
  });

  // Render edges first (behind nodes)
  svg.setAttribute("viewBox", `0 0 ${stageW} ${stageH}`);
  svg.setAttribute("width", stageW);
  svg.setAttribute("height", stageH);

  const edgesHtml = jobs.flatMap(j => {
    return (incoming[j.id] || []).map(blocker => {
      const a = pos[blocker], b = pos[j.id];
      if (!a || !b) return "";
      // Cubic bezier horizontal flow
      const dx = (b.x - a.x) * 0.5;
      const c1x = a.x + dx, c1y = a.y;
      const c2x = b.x - dx, c2y = b.y;
      const bJob = byId[blocker];
      const critical = (bJob && bJob.status !== "closed") ? "critical" : "";
      return `<path class="dag-edge ${critical}"
        d="M${a.x+18},${a.y} C${c1x},${c1y} ${c2x},${c2y} ${b.x-18},${b.y}"
        data-from="${blocker}" data-to="${j.id}"
        fill="none" />`;
    });
  }).join("");

  svg.innerHTML = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-mute)"/>
      </marker>
      <marker id="arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/>
      </marker>
      <marker id="arrow-p0" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="var(--p0)"/>
      </marker>
    </defs>
    ${edgesHtml}
  `;
  svg.querySelectorAll("path.dag-edge").forEach(p => {
    p.setAttribute("marker-end", "url(#arrow)");
  });

  // Render nodes (connected only)
  jobs.forEach(j => {
    if (isolatedSet.has(j.id)) return;
    const p = personaOf(j.assigned_to);
    const pt = pos[j.id];
    if (!pt) return;
    const el = document.createElement("div");
    const blockedByCount = (incoming[j.id] || []).filter(id => byId[id] && byId[id].status !== "closed").length;
    const blockingCount = (outgoing[j.id] || []).length;
    const isRoot = (incoming[j.id] || []).length === 0;
    const isLeaf = (outgoing[j.id] || []).length === 0;
    el.className = `dag-node status-${j.status} pri-${j.priority.toLowerCase()} ${isRoot?'root':''} ${isLeaf?'leaf':''} ${blockedByCount>0?'waiting':''}`;
    el.style.left = (pt.x - 115) + "px";
    el.style.top = (pt.y - 36) + "px";
    el.style.setProperty("--agent-color", p.color);
    el.dataset.id = j.id;

    const statusLabel = STATUS_LABEL_SHORT[j.status] || j.status.toUpperCase();
    el.innerHTML = `
      <div class="dn-head">
        <span class="dn-pri ${j.priority.toLowerCase()}">${j.priority}</span>
        <span class="dn-id">#${j.id}</span>
        <span class="dn-agent" title="${escapeHtml(p.callsign)}" style="background:${p.color}"></span>
      </div>
      <div class="dn-sub">${j.subject.length>52?escapeHtml(j.subject.slice(0,50))+'…':escapeHtml(j.subject)}</div>
      <div class="dn-foot">
        <span class="dn-status">${statusLabel}</span>
        ${blockedByCount ? `<span class="dn-count blocked-by" title="${blockedByCount} blocker${blockedByCount===1?'':'s'}">◀ ${blockedByCount}</span>` : ''}
        ${blockingCount ? `<span class="dn-count blocking" title="blocks ${blockingCount} job${blockingCount===1?'':'s'}">${blockingCount} ▶</span>` : ''}
      </div>
    `;
    nodesLayer.appendChild(el);
    el.addEventListener("click", e => { e.stopPropagation(); openDrawer(j.id); });
    el.addEventListener("mouseenter", () => highlightChain(j.id));
    el.addEventListener("mouseleave", () => clearHighlight());
  });

  // Render isolated nodes in their own grid
  if (isoGrid) {
    isolated.forEach(j => {
      const p = personaOf(j.assigned_to);
      const el = document.createElement("div");
      el.className = `dag-iso-node status-${j.status} pri-${j.priority.toLowerCase()}`;
      el.style.setProperty("--agent-color", p.color);
      el.dataset.id = j.id;
      const statusLabel = STATUS_LABEL_SHORT[j.status] || j.status.toUpperCase();
      el.innerHTML = `
        <div class="dn-head">
          <span class="dn-pri ${j.priority.toLowerCase()}">${j.priority}</span>
          <span class="dn-id">#${j.id}</span>
          <span class="dn-agent" style="background:${p.color}"></span>
        </div>
        <div class="dn-sub">${j.subject.length>52?escapeHtml(j.subject.slice(0,50))+'…':escapeHtml(j.subject)}</div>
        <div class="dn-foot"><span class="dn-status">${statusLabel}</span></div>
      `;
      isoGrid.appendChild(el);
      el.addEventListener("click", () => openDrawer(j.id));
    });
  }

  function collectChain(id, dir /* 'up' | 'down' */, set = new Set()) {
    const next = dir === 'up' ? incoming[id] : outgoing[id];
    (next || []).forEach(nid => {
      if (set.has(nid)) return;
      set.add(nid);
      collectChain(nid, dir, set);
    });
    return set;
  }
  function highlightChain(id) {
    const upstream = collectChain(id, 'up');
    const downstream = collectChain(id, 'down');
    nodesLayer.querySelectorAll(".dag-node").forEach(n => {
      const nid = n.dataset.id;
      n.classList.remove("hi-self","hi-up","hi-down","dim");
      if (nid === id) n.classList.add("hi-self");
      else if (upstream.has(nid)) n.classList.add("hi-up");
      else if (downstream.has(nid)) n.classList.add("hi-down");
      else n.classList.add("dim");
    });
    svg.querySelectorAll("path.dag-edge").forEach(p => {
      const f = p.dataset.from, t = p.dataset.to;
      p.classList.remove("hi-up","hi-down","dim");
      // upstream edges: edges where t==id, or t is in upstream
      const isUp = t === id ? true : upstream.has(t);
      const isDown = f === id ? true : downstream.has(f);
      if (isUp && (upstream.has(f) || f === id || t === id)) {
        p.classList.add("hi-up");
        p.setAttribute("marker-end","url(#arrow-hot)");
      } else if (isDown && (downstream.has(t) || f === id)) {
        p.classList.add("hi-down");
        p.setAttribute("marker-end","url(#arrow-hot)");
      } else {
        p.classList.add("dim");
        p.setAttribute("marker-end","url(#arrow)");
      }
    });
  }
  function clearHighlight() {
    nodesLayer.querySelectorAll(".dag-node").forEach(n =>
      n.classList.remove("hi-self","hi-up","hi-down","dim"));
    svg.querySelectorAll("path.dag-edge").forEach(p => {
      p.classList.remove("hi-up","hi-down","dim");
      p.setAttribute("marker-end","url(#arrow)");
    });
  }

  // ------------------------------------------------------------
  // Side panel — blocker impact rail + critical-path digest
  // ------------------------------------------------------------
  // Blocker impact = downstream chain size (how many jobs this one gates)
  function downstreamSize(id) { return collectChain(id, 'down').size; }
  const topBlockers = jobs
    .map(j => ({ j, impact: downstreamSize(j.id), directBlocks: outgoing[j.id].length }))
    .filter(r => r.impact > 0 && r.j.status !== "closed")
    .sort((a,b) => b.impact - a.impact)
    .slice(0, 8);

  const waitingJobs = jobs.filter(j =>
    (incoming[j.id] || []).some(id => byId[id] && byId[id].status !== "closed")
  ).length;
  const readyJobs = jobs.filter(j =>
    j.status === "open" &&
    (incoming[j.id] || []).every(id => !byId[id] || byId[id].status === "closed")
  ).length;

  const maxImpact = Math.max(1, ...topBlockers.map(r=>r.impact));

  side.innerHTML = `
    <div class="dep-stats">
      <div class="ds-row">
        <div class="ds-kv"><span class="k">${jobs.length}</span><span class="lbl">NODES</span></div>
        <div class="ds-kv"><span class="k">${Object.values(outgoing).flat().length}</span><span class="lbl">EDGES</span></div>
      </div>
      <div class="ds-row">
        <div class="ds-kv ready"><span class="k">${readyJobs}</span><span class="lbl">READY</span></div>
        <div class="ds-kv waiting"><span class="k">${waitingJobs}</span><span class="lbl">WAITING</span></div>
      </div>
    </div>

    <div class="dep-section">
      <h5>▸ TOP BLOCKERS</h5>
      <div class="dep-hint">Close these first — each gates N downstream jobs.</div>
      ${topBlockers.length === 0 ? '<div class="dep-empty">— NO ACTIVE BLOCKERS —</div>' : topBlockers.map(r => {
        const p = personaOf(r.j.assigned_to);
        const barPct = (r.impact / maxImpact) * 100;
        return `<div class="blocker-row" data-id="${r.j.id}" style="cursor:pointer">
          <div class="br-top">
            <span class="br-pri ${r.j.priority.toLowerCase()}">${r.j.priority}</span>
            <span class="br-id">#${r.j.id}</span>
            <span class="br-impact">◀ ${r.impact}</span>
          </div>
          <div class="br-sub">${r.j.subject.length>46?escapeHtml(r.j.subject.slice(0,44))+'…':escapeHtml(r.j.subject)}</div>
          <div class="br-bar"><div class="fill" style="width:${barPct}%;background:${p.color}"></div></div>
          <div class="br-foot">
            <span style="color:${p.color}">${escapeHtml(p.callsign)}</span>
            <span>${STATUS_LABEL_SHORT[r.j.status]}</span>
          </div>
        </div>`;
      }).join("")}
    </div>

    <div class="dep-section">
      <h5>▸ LEGEND</h5>
      <div class="dep-legend">
        <div class="ll"><span class="sym arrow"></span>BLOCKER → BLOCKED</div>
        <div class="ll"><span class="sym root"></span>ROOT (no blockers)</div>
        <div class="ll"><span class="sym waiting"></span>WAITING ON OTHERS</div>
        <div class="ll"><span class="sym leaf"></span>LEAF (blocks nothing)</div>
      </div>
    </div>
  `;
  side.querySelectorAll(".blocker-row").forEach(r =>
    r.addEventListener("click", () => openDrawer(r.dataset.id))
  );
}
