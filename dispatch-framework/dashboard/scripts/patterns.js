// PATTERN DETECTOR — cross-job trends.
// This is the "self-improvement" overview: which tenets are trending,
// which worktypes break which tenets, mitigation reuse rate,
// and where the system's blind spots cluster.

(function () {
  const TENET_COLORS = {
    1: "#00FFCC", 2: "#FFB700", 3: "#A855F7",
    4: "#FF3366", 5: "#0088FF", 6: "#14B8A6",
  };
  const PHASE_COLOR = {
    O: "#00FFCC", Q: "#A855F7", E: "#0088FF",
    COMPLETION: "#FFB700", POST_ACCEPTANCE: "#FF3366",
  };

  function renderPatternDetectorView(root) {
    root.classList.remove("view-board", "view-radar", "view-reviewer-log");
    root.className = "view-pattern-detector";

    const lessons = window.LESSONS || [];
    const ratified = lessons.filter(l => l.status === "ratified");
    const jobs = window.JOBS || [];

    // ---- Compute analytics --------------------------------------
    const tenetCounts = window.computeTenetCounts(ratified);
    const totalBreaks = Object.values(tenetCounts).reduce((a,b)=>a+b, 0);

    // Worktype × tenet matrix
    const matrix = {}; // [worktype][tenet] = count
    const worktypes = new Set();
    for (const l of ratified) {
      const job = jobs.find(j => j.id === l.job_id);
      const wt = job ? jobWorktype(job) : null;
      if (!wt) continue;
      worktypes.add(wt);
      matrix[wt] = matrix[wt] || {};
      for (const t of (l.tenets_broken||[])) {
        matrix[wt][t.tenet] = (matrix[wt][t.tenet] || 0) + 1;
      }
    }

    // Phase distribution — where lessons are caught
    const phaseCounts = { O:0, Q:0, E:0, COMPLETION:0, POST_ACCEPTANCE:0 };
    for (const l of ratified) phaseCounts[l.noted_at_phase] = (phaseCounts[l.noted_at_phase]||0)+1;

    // Coverage — how many open jobs are protected by ≥1 ratified lesson
    const openJobs = jobs.filter(j => j.status !== "closed");
    const coverage = openJobs.map(j => {
      const matches = window.matchLessonsToJob ? window.matchLessonsToJob(j, { minScore: 1, limit: 99 }) : [];
      return { job: j, matches };
    });
    const protectedCount = coverage.filter(c => c.matches.length > 0).length;
    const totalMitigations = ratified.reduce((a, l) => a + (l.mitigations||[]).length, 0);

    // Tag-frequency across applies_to_tags
    const tagFreq = {};
    for (const l of ratified) for (const t of (l.applies_to_tags||[])) tagFreq[t] = (tagFreq[t]||0)+1;
    const topTags = Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0, 10);

    // ---- Render --------------------------------------------------
    root.innerHTML = `
      <div class="pd-shell">
        <header class="pd-head">
          <div class="pd-title-block">
            <span class="pd-eyebrow">SELF-IMPROVEMENT TELEMETRY</span>
            <h2 class="pd-title">PATTERN DETECTOR</h2>
            <span class="pd-sub">cross-job trend analysis · ${ratified.length} ratified lessons · ${totalBreaks} tenet breaks · ${totalMitigations} mitigations packed</span>
          </div>
          <div class="pd-stats">
            ${stat("OPEN JOBS", openJobs.length)}
            ${stat("PROTECTED", `${protectedCount}/${openJobs.length}`,
              protectedCount === openJobs.length ? "good" :
              protectedCount >= openJobs.length / 2 ? "warn" : "bad")}
            ${stat("RATIFIED", ratified.length)}
            ${stat("DRAFT", lessons.length - ratified.length)}
          </div>
        </header>

        <div class="pd-grid">

          <section class="pd-card pd-trend">
            <div class="pd-card-head">
              <span class="pd-card-label">TENET BREAK TRENDS</span>
              <span class="pd-card-sub">all six tenets · ratified-only</span>
            </div>
            ${renderTenetTrend(tenetCounts, totalBreaks)}
          </section>

          <section class="pd-card pd-phase">
            <div class="pd-card-head">
              <span class="pd-card-label">PHASE OF DETECTION</span>
              <span class="pd-card-sub">where in the lifecycle the failure was caught</span>
            </div>
            ${renderPhaseDist(phaseCounts, ratified.length)}
          </section>

          <section class="pd-card pd-matrix">
            <div class="pd-card-head">
              <span class="pd-card-label">WORKTYPE × TENET MATRIX</span>
              <span class="pd-card-sub">heatmap — which worktypes break which tenets</span>
            </div>
            ${renderMatrix([...worktypes].sort(), matrix)}
          </section>

          <section class="pd-card pd-tags">
            <div class="pd-card-head">
              <span class="pd-card-label">TOP APPLIES-TO TAGS</span>
              <span class="pd-card-sub">most-cited problem domains in ratified lessons</span>
            </div>
            ${renderTopTags(topTags)}
          </section>

          <section class="pd-card pd-coverage">
            <div class="pd-card-head">
              <span class="pd-card-label">OPEN JOB COVERAGE</span>
              <span class="pd-card-sub">which open jobs have prior-lesson context packed in</span>
            </div>
            ${renderCoverageList(coverage)}
          </section>

        </div>
      </div>
    `;

    // wire coverage row clicks → open drawer
    root.querySelectorAll('[data-pd-job]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-pd-job');
        if (window.openDrawer) window.openDrawer(id);
      });
    });
  }

  // ===== sub-renderers ============================================
  function stat(label, val, tone) {
    return `<div class="pd-stat ${tone||''}">
      <div class="pd-stat-val">${val}</div>
      <div class="pd-stat-label">${label}</div>
    </div>`;
  }

  function renderTenetTrend(counts, total) {
    const max = Math.max(1, ...Object.values(counts));
    return `<div class="pd-trend-grid">
      ${(window.TENETS || []).map(t => {
        const c = counts[t.n] || 0;
        const pct = (c / max) * 100;
        const pctOfTotal = total ? Math.round((c/total)*100) : 0;
        const isHot = c === max && c > 0;
        return `
          <div class="pd-trend-row ${isHot?'hot':''}" style="--t-color:${TENET_COLORS[t.n]}">
            <div class="pd-trend-id">T${t.n}</div>
            <div class="pd-trend-name">${t.short}</div>
            <div class="pd-trend-bar">
              <div class="pd-trend-fill" style="width:${pct}%"></div>
            </div>
            <div class="pd-trend-count">${c}</div>
            <div class="pd-trend-pct">${pctOfTotal}%</div>
          </div>
        `;
      }).join("")}
    </div>`;
  }

  function renderPhaseDist(counts, total) {
    const phases = ["O","Q","E","COMPLETION","POST_ACCEPTANCE"];
    const max = Math.max(1, ...phases.map(p=>counts[p]||0));
    return `<div class="pd-phase-grid">
      ${phases.map(p => {
        const c = counts[p] || 0;
        const h = max ? Math.max(4, (c/max)*100) : 4;
        const pct = total ? Math.round((c/total)*100) : 0;
        return `
          <div class="pd-phase-col">
            <div class="pd-phase-bar-wrap">
              <div class="pd-phase-bar" style="height:${h}%; --c:${PHASE_COLOR[p]}">
                <span class="pd-phase-num">${c}</span>
              </div>
            </div>
            <div class="pd-phase-label">${p === 'POST_ACCEPTANCE' ? 'POST-ACC' : p}</div>
            <div class="pd-phase-pct">${pct}%</div>
          </div>
        `;
      }).join("")}
    </div>`;
  }

  function renderMatrix(worktypes, matrix) {
    if (!worktypes.length) {
      return `<div class="pd-empty">No worktype data — lessons without job_id matches.</div>`;
    }
    // find max for heat scaling
    let max = 0;
    for (const wt of worktypes) for (const t of [1,2,3,4,5,6]) max = Math.max(max, (matrix[wt]||{})[t] || 0);

    return `<div class="pd-matrix-wrap">
      <table class="pd-matrix-table">
        <thead>
          <tr>
            <th class="pd-matrix-corner">WORKTYPE</th>
            ${[1,2,3,4,5,6].map(n => {
              const t = (window.TENETS||[]).find(x => x.n === n);
              return `<th title="${t?t.short:''}" style="--t-color:${TENET_COLORS[n]}">T${n}</th>`;
            }).join("")}
            <th class="pd-matrix-tot">Σ</th>
          </tr>
        </thead>
        <tbody>
          ${worktypes.map(wt => {
            const rowTotal = [1,2,3,4,5,6].reduce((a,n)=>a+((matrix[wt]||{})[n]||0), 0);
            return `<tr>
              <th>${wt}</th>
              ${[1,2,3,4,5,6].map(n => {
                const v = (matrix[wt]||{})[n] || 0;
                const intensity = max ? v / max : 0;
                return `<td class="pd-matrix-cell ${v?'has':''}" style="--t-color:${TENET_COLORS[n]}; --i:${intensity}">${v||''}</td>`;
              }).join("")}
              <td class="pd-matrix-tot">${rowTotal}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
  }

  function renderTopTags(topTags) {
    if (!topTags.length) return `<div class="pd-empty">No tags yet.</div>`;
    const max = topTags[0][1];
    return `<div class="pd-tags-list">
      ${topTags.map(([t, c]) => {
        const pct = (c / max) * 100;
        return `<div class="pd-tag-row">
          <div class="pd-tag-name">${t}</div>
          <div class="pd-tag-bar"><div class="pd-tag-fill" style="width:${pct}%"></div></div>
          <div class="pd-tag-count">${c}</div>
        </div>`;
      }).join("")}
    </div>`;
  }

  function renderCoverageList(coverage) {
    if (!coverage.length) return `<div class="pd-empty">No open jobs.</div>`;
    // sort: protected jobs first by score, unprotected at bottom
    const sorted = [...coverage].sort((a,b) => {
      const aScore = a.matches.reduce((s,m)=>s+m.score, 0);
      const bScore = b.matches.reduce((s,m)=>s+m.score, 0);
      return bScore - aScore;
    });
    return `<div class="pd-coverage-list">
      ${sorted.map(c => {
        const j = c.job;
        const total = c.matches.reduce((s,m)=>s+m.score, 0);
        const tone = c.matches.length === 0 ? 'unprot' :
                     c.matches.length >= 3 ? 'strong' : 'warn';
        return `<div class="pd-cov-row ${tone}" data-pd-job="${j.id}" title="Open job">
          <div class="pd-cov-id">${j.id}</div>
          <div class="pd-cov-subj">${escapeHtml(j.subject)}</div>
          <div class="pd-cov-chips">
            ${c.matches.length === 0
              ? `<span class="pd-cov-zero">∅ NO PRIOR LESSONS</span>`
              : c.matches.slice(0,4).map(m =>
                  `<span class="pd-cov-mchip" title="${escapeAttr(m.lesson.root_cause)}">${m.lesson.id} · ${m.score.toFixed(1)}</span>`
                ).join("") + (c.matches.length > 4 ? `<span class="pd-cov-more">+${c.matches.length-4}</span>` : '')
            }
          </div>
          <div class="pd-cov-score">${total ? total.toFixed(1) : '—'}</div>
        </div>`;
      }).join("")}
    </div>`;
  }

  // ===== helpers ==================================================
  function jobWorktype(job) {
    if (!job || !job.id) return null;
    const m = String(job.id).match(/^[A-Z]+-([A-Z]+)-\d{4}$/);
    return m ? m[1] : null;
  }
  function escapeHtml(s) {
    return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  window.renderPatternDetectorView = renderPatternDetectorView;
})();
