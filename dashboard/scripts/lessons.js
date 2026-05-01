// Reviewer Log — OQE 2.0 structured lesson view
// Master/detail layout with tenet-counter rail.
// State: App.activeLesson (lesson id) and App.lessonEdit (bool, in-flight edit).

(function () {
  const TENET_COLORS = {
    1: "#00FFCC", 2: "#FFB700", 3: "#A855F7",
    4: "#FF3366", 5: "#0088FF", 6: "#14B8A6",
  };

  const PHASE_COLOR = {
    O:               "#FFB700",
    Q:               "#A855F7",
    E:               "#0088FF",
    COMPLETION:      "#22C55E",
    POST_ACCEPTANCE: "#FF3366",
  };

  const GATE_LABEL = {
    CREATION: "CREATION GATE",
    REVIEW:   "REVIEW GATE",
    STANDING: "STANDING GATE",
    NONE:     "SLIPPED PAST",
  };

  const STRENGTH_COLOR = {
    STRONG:   "#22C55E",
    MODERATE: "#FFB700",
    LIMITED:  "#FF3366",
  };

  const CONFIDENCE_COLOR = {
    HIGH:     "#22C55E",
    MODERATE: "#FFB700",
    LOW:      "#FF3366",
  };

  // ------- top-level renderer ------------------------------------
  function renderReviewerLogView(root) {
    root.classList.remove("view-board", "view-radar");
    root.className = "view-reviewer-log";

    const lessons = window.LESSONS || [];

    // Honor incoming jump request from PRIOR LESSONS card click
    if (window.__rlSelectId && lessons.find(l => l.id === window.__rlSelectId)) {
      App.activeLesson = window.__rlSelectId;
      window.__rlSelectId = null;
    }
    if (!App.activeLesson || !lessons.find(l => l.id === App.activeLesson)) {
      App.activeLesson = lessons[0] && lessons[0].id;
    }

    root.innerHTML = `
      <div class="rl-tenet-rail">${renderTenetRail(lessons)}</div>
      <div class="rl-body">
        <aside class="rl-list">${renderLessonList(lessons)}</aside>
        <section class="rl-detail">${renderLessonDetail(App.activeLesson)}</section>
      </div>
    `;

    wireReviewerLog();
  }

  // ------- tenet rail (frequency telescope) ----------------------
  function renderTenetRail(lessons) {
    const counts = window.computeTenetCounts(lessons);
    const max = Math.max(1, ...Object.values(counts));
    const totalBreaks = Object.values(counts).reduce((a, b) => a + b, 0);

    const cells = window.TENETS.map(t => {
      const c = counts[t.n] || 0;
      const pct = (c / max) * 100;
      const isHot = c === max && c > 0;
      const color = TENET_COLORS[t.n];
      return `
        <div class="rl-tenet-cell ${isHot ? 'hot' : ''}" title="${t.short}: ${t.long}" style="--t-color:${color}">
          <div class="rl-tenet-id">T${t.n}</div>
          <div class="rl-tenet-bar"><span style="height:${pct}%; background:${color}"></span></div>
          <div class="rl-tenet-count">${c}</div>
          <div class="rl-tenet-name">${t.short.toUpperCase()}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="rl-rail-head">
        <div class="rl-rail-label">TENET BREAK FREQUENCY · last ${lessons.length} lessons · ${totalBreaks} total breaks</div>
      </div>
      <div class="rl-tenet-grid">${cells}</div>
    `;
  }

  // ------- master list -------------------------------------------
  function renderLessonList(lessons) {
    const sorted = [...lessons].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return `
      <div class="rl-list-head">
        <div class="rl-list-title">LESSON LOG <span class="rl-count">${lessons.length}</span></div>
        <button class="rl-new-btn" data-rl-new title="New lesson">+ NEW</button>
      </div>
      <div class="rl-list-body">
        ${sorted.map(l => renderLessonRow(l)).join("")}
      </div>
    `;
  }

  function renderLessonRow(l) {
    const active = App.activeLesson === l.id;
    const phaseColor = PHASE_COLOR[l.noted_at_phase] || "#5B637A";
    const tenetChips = (l.tenets_broken || [])
      .map(t => `<span class="rl-row-tchip" style="--t-color:${TENET_COLORS[t.tenet]}">T${t.tenet}</span>`)
      .join("");
    const job = (window.JOBS || []).find(j => j.id === l.job_id);
    const jobLabel = job ? job.subject : l.job_id;

    return `
      <div class="rl-row ${active ? 'on' : ''}" data-rl-row="${l.id}">
        <div class="rl-row-head">
          <span class="rl-row-id">${l.id}</span>
          <span class="rl-row-phase" style="--p-color:${phaseColor}">${l.noted_at_phase}</span>
        </div>
        <div class="rl-row-job">${jobLabel}</div>
        <div class="rl-row-foot">
          <div class="rl-row-tenets">${tenetChips}</div>
          <span class="rl-row-conf" style="--c-color:${CONFIDENCE_COLOR[l.confidence_at_decision]}">${l.confidence_at_decision}</span>
        </div>
      </div>
    `;
  }

  // ------- detail view -------------------------------------------
  function renderLessonDetail(id) {
    const l = (window.LESSONS || []).find(x => x.id === id);
    if (!l) {
      return `<div class="rl-empty">
        <div class="rl-empty-mark">∅</div>
        <div>NO LESSON SELECTED</div>
      </div>`;
    }
    if (App.lessonEdit && App.activeLesson === id) {
      return renderLessonEditor(l);
    }

    const job = (window.JOBS || []).find(j => j.id === l.job_id);
    const phaseColor = PHASE_COLOR[l.noted_at_phase] || "#5B637A";
    const created = new Date(l.created_at);

    // header
    const header = `
      <div class="rl-detail-head">
        <div class="rl-detail-id">${l.id}</div>
        <div class="rl-detail-meta">
          <span class="rl-pill" style="--p-color:${phaseColor}">
            ${window.PHASE_LABEL[l.noted_at_phase] || l.noted_at_phase}
          </span>
          <span class="rl-pill rl-gate">${GATE_LABEL[l.noted_at_gate] || l.noted_at_gate}</span>
          <span class="rl-pill" style="--p-color:${CONFIDENCE_COLOR[l.confidence_at_decision]}">
            CONFIDENCE · ${l.confidence_at_decision}
          </span>
          <span class="rl-pill ${l.oqe_path ? 'rl-oqe-yes' : 'rl-oqe-no'}">
            OQE PATH · ${l.oqe_path ? 'YES' : 'NO'}
          </span>
        </div>
        <div class="rl-detail-actions">
          <button data-rl-edit="${l.id}" class="rl-action-btn">EDIT</button>
        </div>
      </div>
      <div class="rl-detail-job">
        <span class="rl-job-label">JOB</span>
        <span class="rl-job-id">${l.job_id}</span>
        ${job ? `<span class="rl-job-subject">— ${job.subject}</span>` : ''}
        <span class="rl-job-when">noted ${formatRel(created)} ago</span>
      </div>
    `;

    // what happened
    const whatHappened = section("WHAT HAPPENED",
      `<p class="rl-prose">${escapeHtml(l.what_happened)}</p>`);

    // alternatives
    const alts = section("ALTERNATIVES CONSIDERED",
      `<p class="rl-prose">${escapeHtml(l.alternatives_considered || '—')}</p>`);

    // criteria passed
    const criteriaPassed = section(
      `CRITERIA THAT PASSED <span class="rl-sec-count">${(l.criteria_passed||[]).length}</span>`,
      `<div class="rl-criteria-list">
        ${(l.criteria_passed || []).map(c => `
          <div class="rl-criterion">
            <span class="rl-strength rl-strength-${c.evidence_strength.toLowerCase()}" style="--s-color:${STRENGTH_COLOR[c.evidence_strength]}">
              ${c.evidence_strength}
            </span>
            <span class="rl-criterion-text">${escapeHtml(c.criterion)}</span>
          </div>
        `).join("") || '<div class="rl-empty-small">—</div>'}
      </div>`
    );

    // tenets broken — the spine of the lesson
    const tenetsBroken = section(
      `TENETS BROKEN <span class="rl-sec-count">${(l.tenets_broken||[]).length}</span>`,
      `<div class="rl-tenets-list">
        ${(l.tenets_broken || []).map(t => {
          const tenet = window.TENETS.find(x => x.n === t.tenet);
          return `
            <div class="rl-tenet-card" style="--t-color:${TENET_COLORS[t.tenet]}">
              <div class="rl-tenet-card-head">
                <span class="rl-tenet-card-id">T${t.tenet}</span>
                <span class="rl-tenet-card-name">${tenet ? tenet.short : '—'}</span>
              </div>
              <div class="rl-tenet-card-rule">${tenet ? tenet.long : ''}</div>
              <div class="rl-tenet-card-how">
                <span class="rl-tenet-card-how-label">HOW BROKEN</span>
                <span>${escapeHtml(t.how)}</span>
              </div>
            </div>
          `;
        }).join("") || '<div class="rl-empty-small">—</div>'}
      </div>`
    );

    // root cause + applies to
    const analysis = `
      <div class="rl-analysis-grid">
        ${section("ROOT CAUSE", `<p class="rl-prose">${escapeHtml(l.root_cause)}</p>`)}
        ${section("APPLIES TO", `<p class="rl-prose">${escapeHtml(l.applies_to)}</p>`)}
      </div>
    `;

    // tags + worktypes
    const tagsRow = (l.applies_to_tags && l.applies_to_tags.length) || (l.matches_worktypes && l.matches_worktypes.length)
      ? `<div class="rl-tags-row">
          ${(l.applies_to_tags||[]).length ? section("APPLIES-TO TAGS",
            `<div class="rl-tag-list">${l.applies_to_tags.map(t =>
              `<span class="rl-tag">${escapeHtml(t)}</span>`).join("")}</div>`) : ""}
          ${(l.matches_worktypes||[]).length ? section("MATCHES WORKTYPES",
            `<div class="rl-tag-list">${l.matches_worktypes.map(t =>
              `<span class="rl-tag rl-tag-wt">${escapeHtml(t)}</span>`).join("")}</div>`)
            : section("MATCHES WORKTYPES", `<div class="rl-tag-list"><span class="rl-tag rl-tag-universal">ALL</span></div>`)}
        </div>`
      : "";

    // mitigations
    const mitigations = section(
      `MITIGATIONS <span class="rl-sec-count">${(l.mitigations||[]).length}</span>`,
      `<ol class="rl-mitigations">
        ${(l.mitigations || []).map((m, i) => `
          <li><span class="rl-mit-n">${String(i+1).padStart(2,'0')}</span><span>${escapeHtml(m)}</span></li>
        `).join("")}
      </ol>`
    );

    return `
      <div class="rl-detail-scroll">
        ${header}
        ${whatHappened}
        ${alts}
        ${criteriaPassed}
        ${tenetsBroken}
        ${analysis}
        ${tagsRow}
        ${mitigations}
      </div>
    `;
  }

  function section(title, body) {
    return `
      <div class="rl-section">
        <div class="rl-sec-head">${title}</div>
        <div class="rl-sec-body">${body}</div>
      </div>
    `;
  }

  // ------- editor (validation-enforced) --------------------------
  function renderLessonEditor(l) {
    // Use a clone in App.lessonDraft to support cancel.
    if (!App.lessonDraft || App.lessonDraft.id !== l.id) {
      App.lessonDraft = JSON.parse(JSON.stringify(l));
    }
    const d = App.lessonDraft;
    const errs = validateLesson(d);

    const phaseOpts = window.PHASES.map(p =>
      `<option value="${p}" ${d.noted_at_phase===p?'selected':''}>${p}</option>`).join("");
    const gateOpts = window.GATES.map(g =>
      `<option value="${g}" ${d.noted_at_gate===g?'selected':''}>${g}</option>`).join("");
    const confOpts = window.CONFIDENCE_LEVELS.map(c =>
      `<option value="${c}" ${d.confidence_at_decision===c?'selected':''}>${c}</option>`).join("");

    return `
      <form class="rl-detail-scroll rl-editor" autocomplete="off" onsubmit="event.preventDefault();return false;">
        <div class="rl-detail-head">
          <div class="rl-detail-id">${d.id} <span class="rl-edit-badge">EDITING</span></div>
          <div class="rl-detail-actions">
            <button type="button" class="rl-action-btn rl-cancel" data-rl-cancel>CANCEL</button>
            <button type="button" class="rl-action-btn rl-save ${errs.length?'rl-disabled':''}" data-rl-save ${errs.length?'disabled':''}>
              SAVE${errs.length?` · ${errs.length} ISSUE${errs.length>1?'S':''}`:''}
            </button>
          </div>
        </div>

        ${errs.length ? `<div class="rl-validation">
          <div class="rl-val-head">VALIDATION FAILURES — fix before save</div>
          <ul>${errs.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
        </div>` : ''}

        ${editorField("JOB ID", `<input data-rl-field="job_id" value="${escapeAttr(d.job_id)}" placeholder="PROJECT-WORKTYPE-NNNN" />`)}

        ${editorRow([
          { label: "PHASE NOTED", html: `<select data-rl-field="noted_at_phase">${phaseOpts}</select>` },
          { label: "GATE", html: `<select data-rl-field="noted_at_gate">${gateOpts}</select>` },
          { label: "CONFIDENCE AT DECISION", html: `<select data-rl-field="confidence_at_decision">${confOpts}</select>` },
          { label: "OQE PATH", html: `
              <div class="rl-toggle">
                <button type="button" data-rl-toggle="oqe_path" data-val="true"  class="${d.oqe_path?'on':''}">YES</button>
                <button type="button" data-rl-toggle="oqe_path" data-val="false" class="${!d.oqe_path?'on':''}">NO</button>
              </div>` },
        ])}

        ${editorField("WHAT HAPPENED",
          `<textarea data-rl-field="what_happened" rows="4">${escapeHtml(d.what_happened||'')}</textarea>`)}

        ${editorField("ALTERNATIVES CONSIDERED",
          `<textarea data-rl-field="alternatives_considered" rows="3">${escapeHtml(d.alternatives_considered||'')}</textarea>`)}

        <div class="rl-section">
          <div class="rl-sec-head">CRITERIA THAT PASSED <span class="rl-sec-count">${(d.criteria_passed||[]).length}</span></div>
          <div class="rl-sec-body">
            ${(d.criteria_passed||[]).map((c, i) => `
              <div class="rl-edit-criterion">
                <select data-rl-crit-strength="${i}">
                  ${window.EVIDENCE_STRENGTHS.map(s =>
                    `<option value="${s}" ${c.evidence_strength===s?'selected':''}>${s}</option>`).join("")}
                </select>
                <input data-rl-crit-text="${i}" value="${escapeAttr(c.criterion)}" placeholder="Criterion text…"/>
                <button type="button" data-rl-crit-del="${i}" class="rl-mini-btn">×</button>
              </div>
            `).join("")}
            <button type="button" data-rl-crit-add class="rl-mini-add">+ ADD CRITERION</button>
          </div>
        </div>

        <div class="rl-section">
          <div class="rl-sec-head">TENETS BROKEN <span class="rl-sec-count">${(d.tenets_broken||[]).length}</span></div>
          <div class="rl-sec-body">
            <div class="rl-tenet-picker">
              ${window.TENETS.map(t => {
                const sel = (d.tenets_broken||[]).find(x => x.tenet === t.n);
                return `<button type="button" class="rl-tenet-pick ${sel?'on':''}"
                  data-rl-tenet-toggle="${t.n}"
                  style="--t-color:${TENET_COLORS[t.n]}"
                  title="${t.long}">
                  T${t.n} · ${t.short}
                </button>`;
              }).join("")}
            </div>
            ${(d.tenets_broken||[]).map(t => {
              const tenet = window.TENETS.find(x => x.n === t.tenet);
              return `
                <div class="rl-edit-tenet" style="--t-color:${TENET_COLORS[t.tenet]}">
                  <div class="rl-edit-tenet-head">T${t.tenet} · ${tenet?tenet.short:''}</div>
                  <textarea data-rl-tenet-how="${t.tenet}" rows="2" placeholder="How was this tenet broken?">${escapeHtml(t.how||'')}</textarea>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        ${editorField("ROOT CAUSE",
          `<textarea data-rl-field="root_cause" rows="3">${escapeHtml(d.root_cause||'')}</textarea>`)}

        ${editorField("APPLIES TO",
          `<textarea data-rl-field="applies_to" rows="3">${escapeHtml(d.applies_to||'')}</textarea>`)}

        <div class="rl-section">
          <div class="rl-sec-head">MITIGATIONS <span class="rl-sec-count">${(d.mitigations||[]).length}</span> <span class="rl-sec-min">min 3</span></div>
          <div class="rl-sec-body">
            ${(d.mitigations||[]).map((m, i) => `
              <div class="rl-edit-mit">
                <span class="rl-mit-n">${String(i+1).padStart(2,'0')}</span>
                <textarea data-rl-mit="${i}" rows="2" placeholder="Concrete mitigation…">${escapeHtml(m)}</textarea>
                <button type="button" data-rl-mit-del="${i}" class="rl-mini-btn">×</button>
              </div>
            `).join("")}
            <button type="button" data-rl-mit-add class="rl-mini-add">+ ADD MITIGATION</button>
          </div>
        </div>

        ${editorField("APPLIES-TO TAGS <span class=\"rl-sec-min\">min 1, comma-separated</span>",
          `<input data-rl-tags="applies_to_tags" value="${escapeAttr((d.applies_to_tags||[]).join(', '))}" placeholder="e.g. ui, dashboard, voice, spawning" />`)}

        <div class="rl-section">
          <div class="rl-sec-head">MATCHES WORKTYPES <span class="rl-sec-min">empty = all</span></div>
          <div class="rl-sec-body">
            <div class="rl-wt-picker">
              ${["FEAT","FIX","INFRA","UI","OQE","DOCS","GOV","PERSONA","SPEC","GATE","ASSET"].map(wt => {
                const sel = (d.matches_worktypes||[]).includes(wt);
                return `<button type="button" class="rl-wt-pick ${sel?'on':''}" data-rl-wt-toggle="${wt}">${wt}</button>`;
              }).join("")}
            </div>
          </div>
        </div>
      </form>
    `;
  }

  function editorField(label, html) {
    return `<div class="rl-section"><div class="rl-sec-head">${label}</div><div class="rl-sec-body">${html}</div></div>`;
  }

  function editorRow(fields) {
    return `<div class="rl-edit-row">${fields.map(f =>
      `<div class="rl-edit-cell"><div class="rl-edit-label">${f.label}</div>${f.html}</div>`
    ).join("")}</div>`;
  }

  // ------- validation (enforced) ---------------------------------
  // MULTI-FEAT-0067: delegate to window.validateLessonSchema (the canonical
  // implementation in scripts/lessons-validate.js, which encodes
  // docs/REVIEWER_LOG.md §2 field rules). Fallback to the inline rules
  // below preserves the editor's behavior if the validator script
  // failed to load — same checks, just less visible to the Reviewer.
  function validateLesson(d) {
    if (typeof window.validateLessonSchema === "function") {
      return window.validateLessonSchema(d);
    }
    const errs = [];
    if (!/^[A-Z]+-[A-Z]+-\d{4}$/.test(d.job_id || ""))
      errs.push("JOB ID must match PROJECT-WORKTYPE-NNNN format (OQE 2.0 §13).");
    if (!d.what_happened || d.what_happened.trim().length < 30)
      errs.push("WHAT HAPPENED must be ≥30 characters of plain narrative.");
    if (!d.noted_at_phase || !window.PHASES.includes(d.noted_at_phase))
      errs.push("PHASE NOTED required.");
    if (!d.noted_at_gate || !window.GATES.includes(d.noted_at_gate))
      errs.push("GATE required (use NONE if no gate caught it).");
    if (!d.confidence_at_decision || !window.CONFIDENCE_LEVELS.includes(d.confidence_at_decision))
      errs.push("CONFIDENCE AT DECISION required (HIGH/MODERATE/LOW).");
    if (typeof d.oqe_path !== "boolean")
      errs.push("OQE PATH must be set (YES or NO).");
    if (!d.alternatives_considered || d.alternatives_considered.trim().length < 10)
      errs.push("ALTERNATIVES CONSIDERED must be ≥10 characters.");
    if (!Array.isArray(d.tenets_broken) || d.tenets_broken.length < 1)
      errs.push("At least one TENET BROKEN required.");
    else {
      d.tenets_broken.forEach((t, i) => {
        if (!t.how || t.how.trim().length < 10)
          errs.push(`Tenet T${t.tenet}: HOW must be ≥10 characters.`);
      });
    }
    if (!d.root_cause || d.root_cause.trim().length < 20)
      errs.push("ROOT CAUSE must be ≥20 characters.");
    if (!d.applies_to || d.applies_to.trim().length < 20)
      errs.push("APPLIES TO must be ≥20 characters.");
    if (!Array.isArray(d.mitigations) || d.mitigations.length < 3)
      errs.push(`MITIGATIONS: 3 minimum required (currently ${(d.mitigations||[]).length}).`);
    else {
      d.mitigations.forEach((m, i) => {
        if (!m || m.trim().length < 15)
          errs.push(`Mitigation #${i+1}: must be ≥15 characters.`);
      });
    }
    return errs;
  }

  // ------- wiring -------------------------------------------------
  function wireReviewerLog() {
    // Row click — switch active lesson
    document.querySelectorAll("[data-rl-row]").forEach(el => {
      el.addEventListener("click", () => {
        if (App.lessonEdit && App.lessonDraft && validateLesson(App.lessonDraft).length === 0) {
          // silently leave drafts alone — user has to explicitly cancel/save
        }
        App.activeLesson = el.dataset.rlRow;
        App.lessonEdit = false;
        App.lessonDraft = null;
        renderView();
      });
    });

    // Edit button
    document.querySelectorAll("[data-rl-edit]").forEach(el => {
      el.addEventListener("click", () => {
        App.activeLesson = el.dataset.rlEdit;
        App.lessonEdit = true;
        App.lessonDraft = null;
        renderView();
      });
    });

    // New lesson
    const newBtn = document.querySelector("[data-rl-new]");
    if (newBtn) {
      newBtn.addEventListener("click", () => {
        const nextN = (window.LESSONS.length + 1).toString().padStart(4, "0");
        const blank = {
          id: "LESSON-" + nextN,
          job_id: "",
          status: "draft",
          created_at: new Date().toISOString(),
          what_happened: "",
          noted_at_phase: "POST_ACCEPTANCE",
          noted_at_gate: "NONE",
          confidence_at_decision: "MODERATE",
          alternatives_considered: "",
          oqe_path: true,
          criteria_passed: [],
          tenets_broken: [],
          root_cause: "",
          applies_to: "",
          applies_to_tags: [],
          matches_worktypes: [],
          mitigations: ["", "", ""],
        };
        window.LESSONS.unshift(blank);
        window.LESSONS_BY_ID[blank.id] = blank;
        App.activeLesson = blank.id;
        App.lessonEdit = true;
        App.lessonDraft = null;
        renderView();
      });
    }

    // Editor field bindings
    document.querySelectorAll("[data-rl-field]").forEach(el => {
      el.addEventListener("input", () => {
        if (!App.lessonDraft) return;
        App.lessonDraft[el.dataset.rlField] = el.value;
        rerenderEditorMeta();
      });
      el.addEventListener("change", () => {
        if (!App.lessonDraft) return;
        App.lessonDraft[el.dataset.rlField] = el.value;
        rerenderEditorMeta();
      });
    });

    // OQE toggle
    document.querySelectorAll("[data-rl-toggle]").forEach(el => {
      el.addEventListener("click", () => {
        if (!App.lessonDraft) return;
        const k = el.dataset.rlToggle;
        App.lessonDraft[k] = el.dataset.val === "true";
        renderView();
      });
    });

    // Criteria
    document.querySelectorAll("[data-rl-crit-text]").forEach(el => {
      el.addEventListener("input", () => {
        const i = +el.dataset.rlCritText;
        App.lessonDraft.criteria_passed[i].criterion = el.value;
        rerenderEditorMeta();
      });
    });
    document.querySelectorAll("[data-rl-crit-strength]").forEach(el => {
      el.addEventListener("change", () => {
        const i = +el.dataset.rlCritStrength;
        App.lessonDraft.criteria_passed[i].evidence_strength = el.value;
        rerenderEditorMeta();
      });
    });
    document.querySelectorAll("[data-rl-crit-del]").forEach(el => {
      el.addEventListener("click", () => {
        App.lessonDraft.criteria_passed.splice(+el.dataset.rlCritDel, 1);
        renderView();
      });
    });
    const critAdd = document.querySelector("[data-rl-crit-add]");
    if (critAdd) critAdd.addEventListener("click", () => {
      App.lessonDraft.criteria_passed = App.lessonDraft.criteria_passed || [];
      App.lessonDraft.criteria_passed.push({ criterion: "", evidence_strength: "MODERATE" });
      renderView();
    });

    // Tenets
    document.querySelectorAll("[data-rl-tenet-toggle]").forEach(el => {
      el.addEventListener("click", () => {
        const n = +el.dataset.rlTenetToggle;
        App.lessonDraft.tenets_broken = App.lessonDraft.tenets_broken || [];
        const idx = App.lessonDraft.tenets_broken.findIndex(t => t.tenet === n);
        if (idx >= 0) App.lessonDraft.tenets_broken.splice(idx, 1);
        else App.lessonDraft.tenets_broken.push({ tenet: n, how: "" });
        renderView();
      });
    });
    document.querySelectorAll("[data-rl-tenet-how]").forEach(el => {
      el.addEventListener("input", () => {
        const n = +el.dataset.rlTenetHow;
        const t = App.lessonDraft.tenets_broken.find(x => x.tenet === n);
        if (t) t.how = el.value;
        rerenderEditorMeta();
      });
    });

    // Mitigations
    document.querySelectorAll("[data-rl-mit]").forEach(el => {
      el.addEventListener("input", () => {
        App.lessonDraft.mitigations[+el.dataset.rlMit] = el.value;
        rerenderEditorMeta();
      });
    });
    document.querySelectorAll("[data-rl-mit-del]").forEach(el => {
      el.addEventListener("click", () => {
        App.lessonDraft.mitigations.splice(+el.dataset.rlMitDel, 1);
        renderView();
      });
    });
    const mitAdd = document.querySelector("[data-rl-mit-add]");
    if (mitAdd) mitAdd.addEventListener("click", () => {
      App.lessonDraft.mitigations = App.lessonDraft.mitigations || [];
      App.lessonDraft.mitigations.push("");
      renderView();
    });

    // Applies-to tags (comma-separated input)
    document.querySelectorAll("[data-rl-tags]").forEach(el => {
      el.addEventListener("input", () => {
        if (!App.lessonDraft) return;
        const key = el.dataset.rlTags;
        App.lessonDraft[key] = el.value.split(",").map(s => s.trim()).filter(Boolean);
        rerenderEditorMeta();
      });
    });

    // Matches worktypes (toggle buttons)
    document.querySelectorAll("[data-rl-wt-toggle]").forEach(el => {
      el.addEventListener("click", () => {
        if (!App.lessonDraft) return;
        const wt = el.dataset.rlWtToggle;
        App.lessonDraft.matches_worktypes = App.lessonDraft.matches_worktypes || [];
        const idx = App.lessonDraft.matches_worktypes.indexOf(wt);
        if (idx >= 0) App.lessonDraft.matches_worktypes.splice(idx, 1);
        else App.lessonDraft.matches_worktypes.push(wt);
        renderView();
      });
    });

    // Cancel / Save
    const cancel = document.querySelector("[data-rl-cancel]");
    if (cancel) cancel.addEventListener("click", () => {
      // If this was a brand-new blank lesson, drop it
      const orig = window.LESSONS_BY_ID[App.activeLesson];
      if (orig && !orig.what_happened && !orig.root_cause) {
        const i = window.LESSONS.findIndex(l => l.id === App.activeLesson);
        if (i >= 0) window.LESSONS.splice(i, 1);
        delete window.LESSONS_BY_ID[App.activeLesson];
        App.activeLesson = (window.LESSONS[0] || {}).id || null;
      }
      App.lessonEdit = false;
      App.lessonDraft = null;
      renderView();
    });
    const save = document.querySelector("[data-rl-save]");
    if (save) save.addEventListener("click", () => {
      const errs = validateLesson(App.lessonDraft);
      if (errs.length) return;
      const i = window.LESSONS.findIndex(l => l.id === App.lessonDraft.id);
      if (i >= 0) {
        window.LESSONS[i] = JSON.parse(JSON.stringify(App.lessonDraft));
        window.LESSONS_BY_ID[App.lessonDraft.id] = window.LESSONS[i];
      }
      App.lessonEdit = false;
      App.lessonDraft = null;
      renderView();
    });
  }

  // Re-render only the validation banner + save button label without rebuilding the entire form
  // (avoids losing focus mid-typing). Also refreshes the small section counts.
  function rerenderEditorMeta() {
    if (!App.lessonDraft) return;
    const errs = validateLesson(App.lessonDraft);
    const saveBtn = document.querySelector("[data-rl-save]");
    if (saveBtn) {
      saveBtn.disabled = errs.length > 0;
      saveBtn.classList.toggle("rl-disabled", errs.length > 0);
      saveBtn.textContent = errs.length ? `SAVE · ${errs.length} ISSUE${errs.length>1?'S':''}` : 'SAVE';
    }
    // Update validation banner
    let banner = document.querySelector(".rl-validation");
    const head = document.querySelector(".rl-detail-head");
    if (errs.length) {
      const html = `<div class="rl-validation">
        <div class="rl-val-head">VALIDATION FAILURES — fix before save</div>
        <ul>${errs.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
      </div>`;
      if (banner) banner.outerHTML = html;
      else if (head) head.insertAdjacentHTML("afterend", html);
    } else if (banner) {
      banner.remove();
    }
  }

  // ------- helpers ------------------------------------------------
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
  function formatRel(d) {
    const sec = (Date.now() - d.getTime()) / 1000;
    if (sec < 3600) return Math.round(sec/60) + 'm';
    if (sec < 86400) return Math.round(sec/3600) + 'h';
    return Math.round(sec/86400) + 'd';
  }

  // expose
  window.renderReviewerLogView = renderReviewerLogView;

  // ===========================================================
  // PRIOR LESSONS PANEL — surfaces matched lessons inside the
  // job drawer so context is packed at acceptance time.
  // ===========================================================
  function renderPriorLessonsPanel(job) {
    if (!window.matchLessonsToJob) return "";
    const matches = window.matchLessonsToJob(job, { minScore: 1, limit: 5 });
    if (!matches.length) {
      return `<div class="prior-lessons">
        <div class="pl-head">
          <span class="pl-label">PRIOR LESSONS</span>
          <span class="pl-count pl-empty">∅ NONE MATCHED</span>
        </div>
        <div class="pl-empty-hint">No ratified lessons match this job's tags + worktype. Be the first to log one.</div>
      </div>`;
    }

    const items = matches.map(m => renderPriorLessonRow(m)).join("");
    return `
      <div class="prior-lessons">
        <div class="pl-head">
          <span class="pl-label">PRIOR LESSONS</span>
          <span class="pl-count">${matches.length} MATCHED · CONTEXT-PACKED FOR THIS JOB</span>
        </div>
        ${items}
      </div>
    `;
  }

  function renderPriorLessonRow(match) {
    const l = match.lesson;
    const tenetChips = (l.tenets_broken || []).map(t =>
      `<span class="pl-tchip" style="--t-color:${TENET_COLORS[t.tenet]}">T${t.tenet}</span>`
    ).join("");
    const reasonChips = match.why.map(r =>
      `<span class="pl-reason pl-reason-${r.kind}" title="${escapeAttr(r.detail)}">${labelReason(r)}</span>`
    ).join("");

    // Top 2 mitigations as the actionable payload — the rest fold under expander
    const mits = (l.mitigations || []);
    const headMits = mits.slice(0, 2);
    const restMits = mits.slice(2);

    return `
      <div class="pl-card" data-pl-jump="${l.id}" title="Click to open in Reviewer Log">
        <div class="pl-card-head">
          <span class="pl-id">${l.id}</span>
          <span class="pl-score">${match.score.toFixed(1)}</span>
          <div class="pl-tenets">${tenetChips}</div>
        </div>
        <div class="pl-rootcause">${escapeHtml(l.root_cause)}</div>
        <div class="pl-reasons">${reasonChips}</div>
        <div class="pl-mits-label">MITIGATIONS TO APPLY</div>
        <ul class="pl-mits">
          ${headMits.map((m, i) => `<li><span class="pl-mit-n">${String(i+1).padStart(2,'0')}</span><span>${escapeHtml(m)}</span></li>`).join("")}
          ${restMits.length ? `<li class="pl-mits-more">+ ${restMits.length} more on detail page</li>` : ""}
        </ul>
      </div>
    `;
  }

  function labelReason(r) {
    switch (r.kind) {
      case "tag-overlap":      return `TAG · ${r.detail.split(", ").slice(0,2).join(", ")}`;
      case "transitive-tags":  return `RELATED · ${r.detail.split(", ").slice(0,2).join(", ")}`;
      case "worktype":         return `WORKTYPE · ${r.detail}`;
      case "universal":        return `UNIVERSAL`;
      case "same-project":     return `PROJECT · ${r.detail.toUpperCase()}`;
      default:                 return r.kind.toUpperCase();
    }
  }

  // expose for drawer + future surfaces
  window.renderPriorLessonsPanel = renderPriorLessonsPanel;
})();
