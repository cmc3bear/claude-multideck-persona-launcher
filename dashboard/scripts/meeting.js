// MEETING ROOM — create, browse, and run agent round-table meetings.
// Supports multiple meeting types, job linking, and past-meeting archive.

(function () {

  // ---- Meeting types ------------------------------------------------
  const MEETING_TYPES = {
    "ratification":  { label: "RATIFICATION",  desc: "Cross-project governance vote on a proposal or protocol change" },
    "triage":        { label: "TRIAGE",        desc: "Prioritize and assign open jobs, clear blockers" },
    "retrospective": { label: "RETROSPECTIVE", desc: "Review completed work, surface lessons, identify improvements" },
    "standup":       { label: "STANDUP",       desc: "Quick status sync across active agents" },
    "review":        { label: "REVIEW",        desc: "Technical review of a specific job or deliverable" },
    "planning":      { label: "PLANNING",      desc: "Scope and plan upcoming work, define criteria" },
  };

  // ---- State --------------------------------------------------------
  let MR = {
    view: "list",       // "list" | "create" | "detail"
    activeId: null,
    filter: "all",      // "all" | "active" | "closed"
  };

  // ---- Persona-shaped scripted positions (legacy ratification demo) --
  const SCRIPTED_RATIFICATION = {
    "dispatch": {
      stance: "RATIFY",
      opening: "Cross-project memory has been the missing piece. We've shipped the same class of mistake under three different job IDs in the last quarter. The matcher closes that.",
      concerns: [
        "Tag-overlap matching is only as good as tag hygiene. We need a tag glossary, not a free-for-all.",
        "Who decides ratification? If it's me, I'm the bottleneck. If it's anyone, it's noise.",
      ],
      commitments: [
        "Maintain the tag glossary at docs/TAGS.md. Reject lessons that invent ad-hoc tags.",
        "Run a weekly ratification review: drafts older than 7 days get reviewed or archived.",
      ],
      questions: ["What's the SLA on ratifying a POST_ACCEPTANCE lesson? These are the expensive ones."],
    },
    "architect": {
      stance: "RATIFY",
      opening: "The schema is clean. Six tenets is the right cardinality: fewer would lose precision, more would bleed into bureaucracy.",
      concerns: [
        "T6 (Version before Declaration) is the weakest tenet. Watch for it being broken trivially and inflating the heatmap.",
        "applies_to_tags is doing two jobs: retrieval AND domain classification. That'll bite us when the v2 semantic matcher lands.",
      ],
      commitments: [
        "Audit every ratified lesson at quarter boundaries: is the root_cause actually abstract?",
        "Own the schema. No additive fields without an architecture review.",
      ],
      questions: ["Should mitigations carry their own evidence_strength rating?"],
    },
    "engineer": {
      stance: "RATIFY-WITH-AMENDMENTS",
      opening: "I'll implement against this. The matcher is deterministic which makes it testable. Good.",
      concerns: [
        "Hybrid scoring weights are magic numbers. 3/1/2/0.5/0.5: where did these come from? Need a calibration job.",
        "No fallback when JOBS isn't loaded. The matcher silently returns no transitive matches.",
      ],
      commitments: [
        "Write a calibration test suite: known job-lesson pairs, target rank, regression on weight changes.",
        "Add a debug mode that logs every match score breakdown to console.",
      ],
      questions: [],
    },
    "reviewer": {
      stance: "RATIFY",
      opening: "This is exactly the structure that makes my job possible. Right now I'm pattern-matching from memory; with this I have a corpus.",
      concerns: [
        "POST_ACCEPTANCE lessons are flagged as 'most expensive' but there's no incentive to surface them.",
        "Mitigations check 'actionable' is judgment-based. Two reviewers will disagree.",
      ],
      commitments: [
        "Become second-reviewer on all draft lessons. Bottleneck risk acknowledged.",
        "Publish a 'what counts as actionable' rubric within 5 days of ratification.",
      ],
      questions: ["Can lessons be downgraded back to draft? When new evidence reverses a ratification?"],
    },
    "researcher": {
      stance: "RATIFY",
      opening: "The hybrid matcher is the right starting point. Tags-only would miss cross-domain patterns; pure-semantic would be unauditable.",
      concerns: [
        "Confidence calibration is implicit. We say HIGH/MODERATE/LOW but there's no rubric.",
        "applies_to_tags creates vocabulary lock-in. Tag inflation is a real risk.",
      ],
      commitments: [
        "Author the confidence rubric by end of week.",
        "Quarterly tag-vocabulary review: prune unused tags, merge near-duplicates.",
      ],
      questions: ["Can we A/B the matcher? Half match ratified-only, half ratified+draft."],
    },
    "launcher-engineer": {
      stance: "RATIFY-WITH-AMENDMENTS",
      opening: "Fine on the principle. My concern is throughput. Every job acceptance now has a context-loading step.",
      concerns: [
        "Score threshold (minScore: 1) is permissive. We'll surface noise on small-tag-overlap jobs.",
        "No mechanism for an agent to mark a lesson as 'read and addressed' on a specific job.",
      ],
      commitments: [
        "Tune minScore against real agent throughput. Likely needs to be >= 2.",
        "Add an 'acknowledge' action on PRIOR LESSONS cards.",
      ],
      questions: ["Can mitigations expire? A mitigation for refactored code might be wrong."],
    },
    "voice-technician": {
      stance: "RATIFY",
      opening: "I'm in. Lesson 6 (synthetic-data fixtures) is the one that bit me. If the matcher had fired that before I closed it, the issue would have surfaced earlier.",
      concerns: [
        "Audio + TTS work has tenets that don't quite fit T1-T6. Are domain-specific tenets allowed?",
        "Code-snippet mitigations don't render in the panel.",
      ],
      commitments: [
        "Write 3 audio-domain lessons within the first month to stress-test the schema.",
        "Submit a mitigation-rendering enhancement: code snippets in fenced blocks.",
      ],
      questions: ["Are domain-extension tenets (T1.A, T1.B style) allowed, or strictly six?"],
    },
    "persona-author": {
      stance: "RATIFY",
      opening: "The schema models the failure shape well. That's the right abstraction. Most retrospective tools model the bug; this models the decision.",
      concerns: [
        "Personas are missing from the lesson schema. The agent who wrote the lesson may not be the agent who made the decision.",
        "Cross-persona transfer: a lesson from Architect's domain may be irrelevant to Voice-Technician even with overlapping tags.",
      ],
      commitments: [
        "Add decision_agent field to schema. (Schema amendment.)",
        "Author persona-aware match weighting as a v2-matcher contribution.",
      ],
      questions: ["Should the matcher down-weight lessons from agents whose scope doesn't overlap?"],
    },
  };

  // ---- Meetings data ------------------------------------------------
  function getMeetings() {
    return window.MEETINGS || [];
  }

  function saveMeeting(meeting) {
    window.MEETINGS = window.MEETINGS || [];
    const idx = window.MEETINGS.findIndex(m => m.id === meeting.id);
    if (idx >= 0) window.MEETINGS[idx] = meeting;
    else window.MEETINGS.push(meeting);
    window.MEETINGS_BY_ID = window.MEETINGS_BY_ID || {};
    window.MEETINGS_BY_ID[meeting.id] = meeting;
  }

  function nextMeetingId() {
    const meetings = getMeetings();
    let max = 0;
    meetings.forEach(m => {
      const n = parseInt((m.id || "").replace(/^MTG-/, ""), 10);
      if (n > max) max = n;
    });
    return "MTG-" + String(max + 1).padStart(4, "0");
  }

  function getNonClosedJobs() {
    return (window.JOBS || []).filter(j => j.status !== "closed");
  }

  // ---- Top-level renderer -------------------------------------------
  function renderMeetingRoomView(root) {
    root.classList.remove("view-board","view-radar","view-reviewer-log","view-pattern-detector");
    root.className = "view-meeting-room";

    if (window.__mrOpenJobId) {
      const jobId = window.__mrOpenJobId;
      delete window.__mrOpenJobId;
      MR.view = "create";
      MR.prefillJobId = jobId;
    }

    if (MR.view === "create") renderCreateView(root);
    else if (MR.view === "detail" && MR.activeId) renderDetailView(root, MR.activeId);
    else renderListView(root);

    wireMeetingRoom(root);
  }

  // ---- LIST VIEW ----------------------------------------------------
  function renderListView(root) {
    const meetings = getMeetings();
    const filtered = MR.filter === "all" ? meetings
      : MR.filter === "active" ? meetings.filter(m => m.status !== "closed")
      : meetings.filter(m => m.status === "closed");

    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    root.innerHTML = `
      <div class="mr-shell">
        <header class="mr-head">
          <div class="mr-head-l">
            <span class="mr-eyebrow">CROSS-PROJECT GOVERNANCE</span>
            <h2 class="mr-title">MEETING ROOM</h2>
            <span class="mr-sub">${meetings.length} meeting${meetings.length===1?'':'s'} on record</span>
          </div>
          <div class="mr-head-r">
            <button class="mr-btn mr-new" data-mr-action="new-meeting">+ NEW MEETING</button>
          </div>
        </header>

        <div class="mr-filters">
          ${["all","active","closed"].map(f =>
            `<button class="mr-filter-btn ${MR.filter===f?'on':''}" data-mr-filter="${f}">${f.toUpperCase()}</button>`
          ).join("")}
        </div>

        <div class="mr-meeting-list">
          ${filtered.length ? filtered.map(renderMeetingCard).join("") :
            `<div class="mr-empty">
              <div class="mr-empty-mark">∅</div>
              <div>NO MEETINGS${MR.filter!=='all'?' ('+MR.filter.toUpperCase()+')':''}</div>
              <div class="mr-empty-hint">Click + NEW MEETING to convene a round-table</div>
            </div>`}
        </div>
      </div>
    `;
  }

  function renderMeetingCard(m) {
    const typeInfo = MEETING_TYPES[m.type] || { label: m.type.toUpperCase(), desc: "" };
    const job = m.job_id ? (window.JOBS || []).find(j => j.id === m.job_id) : null;
    const agentCount = (m.attendees || []).length;
    const isClosed = m.status === "closed";
    return `
      <article class="mr-meeting-card ${isClosed?'mr-closed':''}" data-mr-open="${m.id}">
        <div class="mr-mc-top">
          <span class="mr-mc-type mr-type-${m.type}">${typeInfo.label}</span>
          <span class="mr-mc-status mr-mc-status-${m.status}">${(m.status||'active').toUpperCase()}</span>
          <span class="mr-mc-id">${m.id}</span>
          <span class="mr-mc-date">${relTimeShort(m.created_at)}</span>
        </div>
        <div class="mr-mc-title">${escapeHtml(m.title)}</div>
        ${m.job_id ? `<div class="mr-mc-job">
          <span class="mr-mc-job-label">JOB</span>
          <span class="mr-mc-job-id">#${m.job_id}</span>
          ${job ? `<span class="mr-mc-job-subject">${escapeHtml(job.subject)}</span>` : ''}
        </div>` : ''}
        <div class="mr-mc-meta">${agentCount} agent${agentCount===1?'':'s'} convened</div>
      </article>
    `;
  }

  // ---- CREATE VIEW --------------------------------------------------
  function renderCreateView(root) {
    const openJobs = getNonClosedJobs();
    const prefill = MR.prefillJobId || "";

    root.innerHTML = `
      <div class="mr-shell">
        <header class="mr-head">
          <div class="mr-head-l">
            <span class="mr-eyebrow">NEW MEETING</span>
            <h2 class="mr-title">CONVENE ROUND-TABLE</h2>
          </div>
          <div class="mr-head-r">
            <button class="mr-btn mr-cancel" data-mr-action="cancel-create">CANCEL</button>
          </div>
        </header>

        <form class="mr-create-form" autocomplete="off" onsubmit="event.preventDefault();return false;">
          <div class="mr-form-field">
            <label class="mr-form-label">MEETING TITLE</label>
            <input id="mrTitle" class="mr-input" placeholder="e.g. Triage open P0 blockers" />
          </div>

          <div class="mr-form-field">
            <label class="mr-form-label">MEETING TYPE</label>
            <div class="mr-type-picker">
              ${Object.entries(MEETING_TYPES).map(([key, t]) =>
                `<button type="button" class="mr-type-opt" data-mr-type="${key}">
                  <span class="mr-type-opt-label">${t.label}</span>
                  <span class="mr-type-opt-desc">${t.desc}</span>
                </button>`
              ).join("")}
            </div>
            <input type="hidden" id="mrType" value="" />
          </div>

          <div class="mr-form-field">
            <label class="mr-form-label">LINKED JOB <span class="mr-form-opt">optional</span></label>
            <select id="mrJobId" class="mr-select">
              <option value="">— no linked job —</option>
              ${openJobs.map(j => {
                const p = personaOf(j.assigned_to);
                return `<option value="${j.id}" ${j.id===prefill?'selected':''}>#${j.id} · ${escapeHtml(j.subject).slice(0,60)} [${escapeHtml(p.callsign)}]</option>`;
              }).join("")}
            </select>
          </div>

          <div class="mr-form-field">
            <label class="mr-form-label">ATTENDEES</label>
            <div class="mr-attendee-picker">
              ${Object.entries(window.PERSONAS || {}).map(([key, p]) =>
                `<button type="button" class="mr-att-pick on" data-mr-att="${key}" style="--att-color:${p.color||'#888'}">
                  <span class="mr-att-dot" style="background:${p.color||'#888'}"></span>${escapeHtml(p.callsign||key)}
                </button>`
              ).join("")}
            </div>
          </div>

          <div class="mr-form-field">
            <label class="mr-form-label">AGENDA NOTES <span class="mr-form-opt">optional</span></label>
            <textarea id="mrAgenda" class="mr-textarea" rows="3" placeholder="Key topics, decisions needed, context..."></textarea>
          </div>

          <div class="mr-form-actions">
            <button type="button" class="mr-btn mr-create-submit" data-mr-action="submit-meeting" disabled>
              CONVENE MEETING
            </button>
            <span class="mr-form-hint" id="mrFormHint">Select a meeting type to proceed</span>
          </div>
        </form>
      </div>
    `;

    delete MR.prefillJobId;
  }

  // ---- DETAIL VIEW (single meeting) --------------------------------
  function renderDetailView(root, meetingId) {
    const m = (getMeetings()).find(x => x.id === meetingId);
    if (!m) {
      MR.view = "list";
      renderListView(root);
      return;
    }

    const typeInfo = MEETING_TYPES[m.type] || { label: m.type.toUpperCase(), desc: "" };
    const job = m.job_id ? (window.JOBS || []).find(j => j.id === m.job_id) : null;
    const positions = m.positions || {};
    const attendees = m.attendees || Object.keys(positions);
    const counts = { RATIFY: 0, "RATIFY-WITH-AMENDMENTS": 0, REJECT: 0, PENDING: 0 };
    attendees.forEach(k => {
      const p = positions[k];
      if (p && p.stance) counts[p.stance] = (counts[p.stance]||0) + 1;
      else counts.PENDING++;
    });
    const total = attendees.length;
    const pctFavor = total ? Math.round(((counts.RATIFY + counts["RATIFY-WITH-AMENDMENTS"]) / total) * 100) : 0;

    root.innerHTML = `
      <div class="mr-shell">
        <header class="mr-head">
          <div class="mr-head-l">
            <span class="mr-eyebrow">${typeInfo.label} · ${m.id}</span>
            <h2 class="mr-title">${escapeHtml(m.title)}</h2>
            <span class="mr-sub">
              ${job ? `Job #${m.job_id} · ` : ''}${total} agents convened · ${relTimeShort(m.created_at)}
              ${m.status === 'closed' ? ' · CLOSED' : ''}
            </span>
          </div>
          <div class="mr-head-r">
            <button class="mr-btn" data-mr-action="back-to-list">BACK</button>
            ${m.status !== 'closed' ? `
              <button class="mr-btn mr-rerun" data-mr-action="rerun-live" title="Re-invoke each agent live via Claude">
                <span class="mr-btn-pulse"></span>RE-RUN LIVE
              </button>
              <button class="mr-btn mr-record" data-mr-action="close-meeting">CLOSE MEETING</button>
            ` : ''}
          </div>
        </header>

        ${m.agenda ? `<div class="mr-agenda">
          <div class="mr-agenda-label">AGENDA</div>
          <p>${escapeHtml(m.agenda)}</p>
        </div>` : ''}

        <div class="mr-tally">
          ${tallyCard("RATIFY", counts["RATIFY"], total, "good")}
          ${tallyCard("AMEND", counts["RATIFY-WITH-AMENDMENTS"], total, "warn")}
          ${tallyCard("REJECT", counts["REJECT"], total, "bad")}
          ${counts.PENDING ? tallyCard("PENDING", counts.PENDING, total, "mute") : ""}
          <div class="mr-tally-spacer"></div>
          <div class="mr-tally-summary">
            <div class="mr-tally-pct">${pctFavor}%</div>
            <div class="mr-tally-pct-label">VOTING RATIFY OR AMEND</div>
          </div>
        </div>

        <div class="mr-table">
          ${attendees.map(k => {
            const pos = positions[k];
            if (pos && pos.stance) return renderSeat(k, pos);
            return renderEmptySeat(k);
          }).join("")}
        </div>

        <footer class="mr-footer">
          <div class="mr-footer-l">
            <span class="mr-footer-label">STATUS</span>
            <span class="mr-footer-text">
              ${m.status === 'closed' ? `Meeting closed. ${m.decision || ''}` :
                counts.PENDING > 0 ? `${counts.PENDING} agent${counts.PENDING===1?'':'s'} have not yet responded.` :
                counts.REJECT === 0 ? `All agents responded. Quorum reached with ${counts["RATIFY-WITH-AMENDMENTS"]} amendment${counts["RATIFY-WITH-AMENDMENTS"]===1?'':'s'} pending.` :
                `Vote split: ${counts.REJECT} reject. Address rejections before closing.`}
            </span>
          </div>
        </footer>

        <div class="mr-live-banner" id="mrLiveBanner" hidden></div>
      </div>
    `;
  }

  // ---- Seat renderers -----------------------------------------------
  function renderSeat(personaKey, script) {
    const p = (window.PERSONAS || {})[personaKey] || { callsign: personaKey, color: "#888", scope: "" };
    const stanceTone = script.stance === "RATIFY" ? "good" :
                       script.stance === "RATIFY-WITH-AMENDMENTS" ? "warn" : "bad";
    const concerns = (script.concerns || []).map(c =>
      `<li><span class="mr-bullet mr-bullet-warn">▲</span><span>${escapeHtml(c)}</span></li>`).join("");
    const commitments = (script.commitments || []).map(c =>
      `<li><span class="mr-bullet mr-bullet-good">●</span><span>${escapeHtml(c)}</span></li>`).join("");
    const questions = (script.questions || []).map(q =>
      `<li><span class="mr-bullet mr-bullet-q">?</span><span>${escapeHtml(q)}</span></li>`).join("");

    return `
      <article class="mr-seat" style="--seat-color:${p.color}" data-mr-seat="${personaKey}">
        <header class="mr-seat-head">
          <div class="mr-seat-id">
            <span class="mr-dot" style="background:${p.color};box-shadow:0 0 8px ${p.color}"></span>
            <div>
              <div class="mr-callsign">${escapeHtml(p.callsign)}</div>
              <div class="mr-scope">${escapeHtml(p.scope || '')}</div>
            </div>
          </div>
          <div class="mr-stance mr-stance-${stanceTone}">${escapeHtml(script.stance)}</div>
        </header>
        <div class="mr-opening">"${escapeHtml(script.opening)}"</div>
        ${concerns ? `<div class="mr-block"><div class="mr-block-label">CONCERNS</div><ul class="mr-list">${concerns}</ul></div>` : ''}
        ${commitments ? `<div class="mr-block"><div class="mr-block-label">COMMITMENTS</div><ul class="mr-list">${commitments}</ul></div>` : ''}
        ${questions ? `<div class="mr-block"><div class="mr-block-label">OPEN QUESTIONS</div><ul class="mr-list">${questions}</ul></div>` : ''}
      </article>
    `;
  }

  function renderEmptySeat(personaKey) {
    const p = (window.PERSONAS || {})[personaKey] || { callsign: personaKey, color: "#888", scope: "" };
    return `
      <article class="mr-seat mr-seat-pending" style="--seat-color:${p.color}" data-mr-seat="${personaKey}">
        <header class="mr-seat-head">
          <div class="mr-seat-id">
            <span class="mr-dot" style="background:${p.color};box-shadow:0 0 8px ${p.color}"></span>
            <div>
              <div class="mr-callsign">${escapeHtml(p.callsign)}</div>
              <div class="mr-scope">${escapeHtml(p.scope || '')}</div>
            </div>
          </div>
          <div class="mr-stance mr-stance-mute">PENDING</div>
        </header>
        <div class="mr-opening mr-opening-pending">Awaiting response...</div>
      </article>
    `;
  }

  function tallyCard(label, n, total, tone) {
    const pct = total ? Math.round((n/total)*100) : 0;
    return `<div class="mr-tally-card mr-tone-${tone}">
      <div class="mr-tally-n">${n}</div>
      <div class="mr-tally-label">${label}</div>
      <div class="mr-tally-bar"><div class="mr-tally-fill" style="width:${pct}%"></div></div>
    </div>`;
  }

  // ---- Live re-run via window.claude.complete -----------------------
  async function rerunLive(root, meetingId) {
    const m = (getMeetings()).find(x => x.id === meetingId);
    if (!m) return;

    const banner = root.querySelector("#mrLiveBanner");
    banner.hidden = false;
    banner.className = "mr-live-banner mr-live-running";
    banner.textContent = "INVOKING SUB-AGENTS LIVE — STREAMING RESPONSES…";

    const attendees = m.attendees || [];
    const docExcerpt = await fetchDocExcerpt();
    const job = m.job_id ? (window.JOBS || []).find(j => j.id === m.job_id) : null;

    let completed = 0;
    for (const key of attendees) {
      const seat = root.querySelector(`[data-mr-seat="${key}"]`);
      if (!seat) continue;
      seat.classList.add("mr-seat-thinking");
      try {
        const persona = (window.PERSONAS || {})[key] || { callsign: key, scope: "" };
        const prompt = buildPersonaPrompt(persona, key, m, job, docExcerpt);
        const text = await window.claude.complete(prompt);
        const parsed = parseLiveResponse(text);
        if (parsed) {
          m.positions = m.positions || {};
          m.positions[key] = parsed;
          saveMeeting(m);
          replaceSeatContent(seat, persona, parsed);
        }
        seat.classList.remove("mr-seat-thinking");
        seat.classList.add("mr-seat-live");
      } catch (err) {
        seat.classList.remove("mr-seat-thinking");
        seat.classList.add("mr-seat-live-fail");
        const stance = seat.querySelector(".mr-stance");
        if (stance) stance.textContent = "OFFLINE";
      }
      completed++;
      banner.textContent = `INVOKING SUB-AGENTS LIVE — ${completed}/${attendees.length} RESPONDED`;
    }

    banner.className = "mr-live-banner mr-live-done";
    banner.textContent = `LIVE ROUND COMPLETE — ${completed}/${attendees.length} agents responded.`;
  }

  function buildPersonaPrompt(persona, key, meeting, job, docExcerpt) {
    const typeInfo = MEETING_TYPES[meeting.type] || { label: meeting.type, desc: "" };
    const jobCtx = job ? `\nLinked job: #${job.id} — ${job.subject}\nDescription: ${job.description || 'N/A'}` : '';
    return `You are ${persona.callsign}, an agent on the OQE 2.0 multi-agent system. Your scope is "${persona.scope || ''}".

You are at a ${typeInfo.label.toLowerCase()} meeting: "${meeting.title}"${jobCtx}
${meeting.agenda ? `\nAgenda notes: ${meeting.agenda}` : ''}

Other agents at the table: ${(meeting.attendees || []).filter(a => a !== key).map(a => {
  const ap = (window.PERSONAS || {})[a];
  return ap ? ap.callsign : a;
}).join(", ")}. Don't restate things they would say — speak from YOUR scope.

Respond ONLY in this exact JSON format (no prose, no code fence):

{
  "stance": "RATIFY" | "RATIFY-WITH-AMENDMENTS" | "REJECT",
  "opening": "One sentence — your overall take.",
  "concerns": ["Specific concern 1", "Specific concern 2"],
  "commitments": ["Concrete commitment 1", "Concrete commitment 2"],
  "questions": ["Open question for the room"]
}

Keep each string under 200 characters. Be specific to YOUR scope. No filler.

PROTOCOL EXCERPT:
${docExcerpt}`;
  }

  function parseLiveResponse(text) {
    try {
      const cleaned = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start < 0 || end < 0) return null;
      const json = JSON.parse(cleaned.slice(start, end + 1));
      if (!json.stance || !json.opening) return null;
      return json;
    } catch (e) {
      return null;
    }
  }

  function replaceSeatContent(seat, persona, script) {
    const stanceTone = script.stance === "RATIFY" ? "good" :
                       script.stance === "RATIFY-WITH-AMENDMENTS" ? "warn" : "bad";
    const concerns = (script.concerns || []).map(c =>
      `<li><span class="mr-bullet mr-bullet-warn">▲</span><span>${escapeHtml(c)}</span></li>`).join("");
    const commitments = (script.commitments || []).map(c =>
      `<li><span class="mr-bullet mr-bullet-good">●</span><span>${escapeHtml(c)}</span></li>`).join("");
    const questions = (script.questions || []).map(q =>
      `<li><span class="mr-bullet mr-bullet-q">?</span><span>${escapeHtml(q)}</span></li>`).join("");

    const stanceEl = seat.querySelector(".mr-stance");
    if (stanceEl) {
      stanceEl.className = `mr-stance mr-stance-${stanceTone}`;
      stanceEl.textContent = script.stance;
    }
    const opening = seat.querySelector(".mr-opening");
    if (opening) opening.textContent = `"${script.opening}"`;

    seat.querySelectorAll(".mr-block").forEach(b => b.remove());
    const insertAfter = seat.querySelector(".mr-opening");
    const blocksHtml = `
      ${concerns ? `<div class="mr-block"><div class="mr-block-label">CONCERNS</div><ul class="mr-list">${concerns}</ul></div>` : ''}
      ${commitments ? `<div class="mr-block"><div class="mr-block-label">COMMITMENTS</div><ul class="mr-list">${commitments}</ul></div>` : ''}
      ${questions ? `<div class="mr-block"><div class="mr-block-label">OPEN QUESTIONS</div><ul class="mr-list">${questions}</ul></div>` : ''}
    `;
    insertAfter.insertAdjacentHTML('afterend', blocksHtml);
  }

  async function fetchDocExcerpt() {
    try {
      const resp = await fetch("docs/REVIEWER_LOG.md");
      if (!resp.ok) throw new Error("doc not found");
      const text = await resp.text();
      return text.length > 2400 ? text.slice(0, 2400) + "\n…[truncated]" : text;
    } catch (e) {
      return "[Doc unreachable — agent must respond from training context.]";
    }
  }

  // ---- Wiring -------------------------------------------------------
  function wireMeetingRoom(root) {
    // List view: new meeting button
    root.querySelector('[data-mr-action="new-meeting"]')?.addEventListener("click", () => {
      MR.view = "create";
      renderMeetingRoomView(root);
    });

    // List view: filter buttons
    root.querySelectorAll("[data-mr-filter]").forEach(el => {
      el.addEventListener("click", () => {
        MR.filter = el.dataset.mrFilter;
        renderMeetingRoomView(root);
      });
    });

    // List view: open meeting card
    root.querySelectorAll("[data-mr-open]").forEach(el => {
      el.addEventListener("click", () => {
        MR.view = "detail";
        MR.activeId = el.dataset.mrOpen;
        renderMeetingRoomView(root);
      });
    });

    // Create view: cancel
    root.querySelector('[data-mr-action="cancel-create"]')?.addEventListener("click", () => {
      MR.view = "list";
      renderMeetingRoomView(root);
    });

    // Create view: type picker
    root.querySelectorAll("[data-mr-type]").forEach(el => {
      el.addEventListener("click", () => {
        root.querySelectorAll("[data-mr-type]").forEach(b => b.classList.remove("on"));
        el.classList.add("on");
        const typeInput = root.querySelector("#mrType");
        if (typeInput) typeInput.value = el.dataset.mrType;
        updateCreateFormState(root);
      });
    });

    // Create view: attendee toggle
    root.querySelectorAll("[data-mr-att]").forEach(el => {
      el.addEventListener("click", () => {
        el.classList.toggle("on");
      });
    });

    // Create view: title input updates submit state
    const titleInput = root.querySelector("#mrTitle");
    if (titleInput) {
      titleInput.addEventListener("input", () => updateCreateFormState(root));
    }

    // Create view: submit
    root.querySelector('[data-mr-action="submit-meeting"]')?.addEventListener("click", () => {
      const title = (root.querySelector("#mrTitle")?.value || "").trim();
      const type = (root.querySelector("#mrType")?.value || "").trim();
      const jobId = root.querySelector("#mrJobId")?.value || "";
      const agenda = (root.querySelector("#mrAgenda")?.value || "").trim();
      const attendees = [];
      root.querySelectorAll("[data-mr-att].on").forEach(el => attendees.push(el.dataset.mrAtt));

      if (!title || !type || !attendees.length) return;

      const meeting = {
        id: nextMeetingId(),
        title,
        type,
        job_id: jobId || null,
        agenda: agenda || null,
        attendees,
        positions: {},
        status: "active",
        created_at: new Date().toISOString(),
        decision: null,
      };

      // For ratification type, seed with scripted positions if available
      if (type === "ratification") {
        attendees.forEach(k => {
          if (SCRIPTED_RATIFICATION[k]) {
            meeting.positions[k] = JSON.parse(JSON.stringify(SCRIPTED_RATIFICATION[k]));
          }
        });
      }

      saveMeeting(meeting);
      MR.view = "detail";
      MR.activeId = meeting.id;
      renderMeetingRoomView(root);
    });

    // Detail view: back
    root.querySelector('[data-mr-action="back-to-list"]')?.addEventListener("click", () => {
      MR.view = "list";
      MR.activeId = null;
      renderMeetingRoomView(root);
    });

    // Detail view: rerun live
    root.querySelector('[data-mr-action="rerun-live"]')?.addEventListener("click", () => {
      rerunLive(root, MR.activeId);
    });

    // Detail view: close meeting
    root.querySelector('[data-mr-action="close-meeting"]')?.addEventListener("click", () => {
      const m = getMeetings().find(x => x.id === MR.activeId);
      if (m) {
        m.status = "closed";
        m.closed_at = new Date().toISOString();
        const counts = { RATIFY: 0, "RATIFY-WITH-AMENDMENTS": 0, REJECT: 0 };
        (m.attendees || []).forEach(k => {
          const p = (m.positions || {})[k];
          if (p && counts[p.stance] !== undefined) counts[p.stance]++;
        });
        m.decision = counts.REJECT === 0
          ? `Ratified with ${counts["RATIFY-WITH-AMENDMENTS"]} amendment${counts["RATIFY-WITH-AMENDMENTS"]===1?'':'s'}.`
          : `Split vote: ${counts.REJECT} reject.`;
        saveMeeting(m);
        renderMeetingRoomView(root);
      }
    });
  }

  function updateCreateFormState(root) {
    const title = (root.querySelector("#mrTitle")?.value || "").trim();
    const type = (root.querySelector("#mrType")?.value || "").trim();
    const btn = root.querySelector('[data-mr-action="submit-meeting"]');
    const hint = root.querySelector("#mrFormHint");
    if (btn) btn.disabled = !title || !type;
    if (hint) {
      if (!type) hint.textContent = "Select a meeting type to proceed";
      else if (!title) hint.textContent = "Enter a meeting title";
      else hint.textContent = "";
    }
  }

  // ---- Helpers ------------------------------------------------------
  function personaOf(key) {
    if (!key) return { callsign: "Unassigned", color: "#5B637A", scope: "" };
    const p = (window.PERSONAS || {})[key];
    return p ? { callsign: p.callsign || key, color: p.color || "#888", scope: p.scope || "" }
             : { callsign: key, color: "#5B637A", scope: "" };
  }

  function relTimeShort(iso) {
    if (!iso) return "—";
    const sec = (Date.now() - new Date(iso).getTime()) / 1000;
    if (sec < 60) return "just now";
    if (sec < 3600) return Math.round(sec/60) + "m ago";
    if (sec < 86400) return Math.round(sec/3600) + "h ago";
    return Math.round(sec/86400) + "d ago";
  }

  function escapeHtml(s) {
    return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // ---- Expose -------------------------------------------------------
  window.renderMeetingRoomView = renderMeetingRoomView;
  window.MEETING_TYPES = MEETING_TYPES;

  // Called from job drawer / ticket to jump directly to meeting creation with a job prefilled
  window.startMeetingForJob = function(jobId) {
    window.__mrOpenJobId = jobId;
    App.activeVariation = "meeting-room";
    localStorage.setItem("mdk-variation", App.activeVariation);
    if (typeof window.renderAll === "function") window.renderAll();
  };
})();
