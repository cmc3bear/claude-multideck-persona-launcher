// Main app — wires shell, tweaks, drawer, and view switching.

function openDrawer(id) {
  const j = JOBS.find(x => x.id === id);
  if (!j) return;
  const p = personaOf(j.assigned_to);
  const poster = j.posted_by || "—";
  const deps = (j.depends_on||[]).map(d => `<span class="tag">#${d}</span>`).join(" ") || "—";
  const tags = (j.tags||[]).map(t => `<span class="tag">${t}</span>`).join(" ") || "—";

  const tl = [];
  if (j.created_at)   tl.push({t:j.created_at, e:`Posted by ${poster}`});
  if (j.accepted_at)  tl.push({t:j.accepted_at, e:`Accepted by ${p.callsign}`});
  if (j.submitted_at) tl.push({t:j.submitted_at, e:`Submitted for review`});
  (j.review_history||[]).forEach(r => tl.push({t:r.timestamp||j.submitted_at, e:`${r.reviewer}: ${r.verdict.toUpperCase()}${r.note?' — '+r.note:''}`}));
  if (j.closed_at)    tl.push({t:j.closed_at, e:`Closed`});
  tl.sort((a,b) => new Date(a.t) - new Date(b.t));

  const body = document.getElementById("drawer");
  body.innerHTML = `
    <button class="closebtn" onclick="closeDrawer()">×</button>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span class="pbadge ${j.priority.toLowerCase()}">${j.priority}</span>
      <span style="font-family:var(--mono);color:var(--ink-mute);font-size:11px;letter-spacing:0.08em">#${j.id} · ${j.project.toUpperCase()} · ${STATUS_LABEL[j.status]}</span>
    </div>
    <h3>${j.subject}</h3>
    <div class="assignee" style="color:${p.color};font-size:12px;margin-top:6px">
      <span class="dot" style="background:${p.color}"></span>${p.callsign} · ${p.scope}
    </div>

    <div class="label">DESCRIPTION</div>
    <p>${j.description || "—"}</p>

    ${j.result ? `<div class="label">RESULT</div><p>${j.result}</p>` : ""}
    ${j.blocked_reason ? `<div class="label" style="color:var(--p0)">BLOCKER</div><p style="color:var(--p0)">${j.blocked_reason}</p>` : ""}
    ${j.alternatives_considered ? `<div class="label">ALTERNATIVES</div><p>${j.alternatives_considered}</p>` : ""}

    <div class="label">METADATA</div>
    <dl class="kvs">
      <dt>Posted</dt><dd>${poster} · ${relTime(j.created_at)} ago</dd>
      <dt>Deps</dt><dd>${deps}</dd>
      <dt>Tags</dt><dd>${tags}</dd>
      ${j.eta_hours !== undefined ? `<dt>ETA</dt><dd>${j.eta_hours}h</dd>` : ""}
      ${j.progress !== undefined && j.status!=="closed" ? `<dt>Progress</dt><dd>${Math.round(j.progress*100)}%</dd>` : ""}
    </dl>

    <div class="label">TIMELINE</div>
    <div class="timeline">
      ${tl.map(ev => `<div class="ev">
        <div style="color:var(--ink-mute);font-size:10.5px;letter-spacing:0.08em">${new Date(ev.t).toLocaleString([], {hour12:false})}</div>
        <div>${ev.e}</div>
      </div>`).join("") || '<div style="color:var(--ink-mute);font-size:11px">No events yet.</div>'}
    </div>
  `;
  document.getElementById("drawer").setAttribute("data-on","true");
  document.getElementById("backdrop").setAttribute("data-on","true");
}
function closeDrawer() {
  document.getElementById("drawer").setAttribute("data-on","false");
  document.getElementById("backdrop").setAttribute("data-on","false");
}

function renderView() {
  const root = document.getElementById("view-root");
  root.innerHTML = "";
  if (App.activeVariation === "board") renderBoardView(root);
  else if (App.activeVariation === "radar") renderRadarView(root);
  else renderClusterView(root);
}

function renderAll() {
  document.getElementById("brand").innerHTML = renderBrand();
  document.getElementById("topbar").innerHTML = renderTopbar();
  document.getElementById("rail").innerHTML = renderRail();
  document.getElementById("controls").innerHTML = renderControls();
  renderView();
  wireShell();
}

function wireShell() {
  // Project selection
  document.querySelectorAll(".rail [data-project]").forEach(el => {
    el.addEventListener("click", () => {
      App.activeProject = el.dataset.project;
      renderAll();
    });
  });
  // View switch (rail + seg)
  document.querySelectorAll("[data-view]").forEach(el => {
    el.addEventListener("click", () => {
      App.activeVariation = el.dataset.view;
      localStorage.setItem("mdk-variation", App.activeVariation);
      renderAll();
    });
  });
  // Roster filter by assignee (toggle)
  document.querySelectorAll(".rail [data-assignee]").forEach(el => {
    el.addEventListener("click", () => {
      App.activeAssignee = (App.activeAssignee === el.dataset.assignee) ? "all" : el.dataset.assignee;
      renderAll();
    });
  });
  // Priority chips
  document.querySelectorAll(".chip[data-priority]").forEach(el => {
    el.addEventListener("click", () => {
      const p = el.dataset.priority;
      if (App.activePriorities.has(p)) App.activePriorities.delete(p);
      else App.activePriorities.add(p);
      renderAll();
    });
  });
  // Closed toggle
  const closedChip = document.querySelector('.chip[data-toggle="closed"]');
  closedChip && closedChip.addEventListener("click", () => {
    App.showClosed = !App.showClosed;
    localStorage.setItem("mdk-show-closed", String(App.showClosed));
    renderAll();
  });
  // Search
  const search = document.getElementById("search");
  if (search) {
    search.addEventListener("input", e => {
      App.search = e.target.value;
      renderView();
    });
  }
}

// -------- Tweaks (host-wired) ------------------------------------
function applyTweakState() {
  document.documentElement.setAttribute("data-density", App.density);
  document.documentElement.setAttribute("data-accent", App.accent);
  document.body.setAttribute("data-scanlines", App.scanlines ? "on" : "off");
  document.getElementById("tweaks").setAttribute("data-on", App.tweaksOn ? "true" : "false");
}

function renderTweaks() {
  const t = document.getElementById("tweaks");
  t.innerHTML = `
    <h4>▸ TWEAKS</h4>
    <div class="tweak-row">
      <span>VARIATION</span>
      <div class="opts">
        ${["board","radar","cluster"].map(v =>
          `<button class="${App.activeVariation===v?'on':''}" data-tweak="variation" data-val="${v}">${v.toUpperCase()}</button>`
        ).join("")}
      </div>
    </div>
    <div class="tweak-row">
      <span>DENSITY</span>
      <div class="opts">
        ${["compact","balanced","roomy"].map(v =>
          `<button class="${App.density===v?'on':''}" data-tweak="density" data-val="${v}">${v[0].toUpperCase()}</button>`
        ).join("")}
      </div>
    </div>
    <div class="tweak-row">
      <span>ACCENT</span>
      <div class="opts">
        ${["cyan","amber","magenta"].map(v =>
          `<button class="${App.accent===v?'on':''}" data-tweak="accent" data-val="${v}">${v.toUpperCase()}</button>`
        ).join("")}
      </div>
    </div>
    <div class="tweak-row">
      <span>SCANLINES</span>
      <div class="opts">
        <button class="${App.scanlines?'on':''}" data-tweak="scanlines" data-val="on">ON</button>
        <button class="${!App.scanlines?'on':''}" data-tweak="scanlines" data-val="off">OFF</button>
      </div>
    </div>
    <div class="tweak-row">
      <span>CLOSED JOBS</span>
      <div class="opts">
        <button class="${App.showClosed?'on':''}" data-tweak="closed" data-val="on">SHOW</button>
        <button class="${!App.showClosed?'on':''}" data-tweak="closed" data-val="off">HIDE</button>
      </div>
    </div>
  `;
  t.querySelectorAll("button[data-tweak]").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.tweak, v = btn.dataset.val;
      if (k === "variation") { App.activeVariation = v; localStorage.setItem("mdk-variation", v); }
      else if (k === "density") { App.density = v; localStorage.setItem("mdk-density", v); }
      else if (k === "accent") { App.accent = v; localStorage.setItem("mdk-accent", v); }
      else if (k === "scanlines") { App.scanlines = v === "on"; localStorage.setItem("mdk-scanlines", App.scanlines?"on":"off"); }
      else if (k === "closed") { App.showClosed = v === "on"; localStorage.setItem("mdk-show-closed", String(App.showClosed)); }
      applyTweakState();
      renderTweaks();
      renderAll();
    });
  });
}

// Host messaging protocol for tweaks toolbar
window.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "__activate_edit_mode") { App.tweaksOn = true; applyTweakState(); }
  if (d.type === "__deactivate_edit_mode") { App.tweaksOn = false; applyTweakState(); }
});

// Keyboard: '/' focuses search, esc closes drawer
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    const s = document.getElementById("search");
    s && s.focus();
  }
  if (e.key === "Escape") closeDrawer();
});

document.getElementById("backdrop").addEventListener("click", closeDrawer);

// Tick the clock every 30s
setInterval(() => {
  const tb = document.getElementById("topbar");
  if (tb) tb.innerHTML = renderTopbar();
}, 30000);

// Boot
window.addEventListener("load", () => {
  applyTweakState();
  renderTweaks();
  renderAll();
  // announce tweaks support
  try { window.parent.postMessage({type:"__edit_mode_available"}, "*"); } catch {}
});
