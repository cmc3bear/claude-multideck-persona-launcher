// Live data adapter — fetches /state.json from the local MultiDeck server,
// normalizes the schema into what views expect, and replaces window.JOBS / etc.
//
// MULTI-FEAT-0067 changes vs. the claude.design original:
//   - Reads window.MOCK_LESSONS in mock mode (sample lessons, not production)
//   - Pulls state.lessons from /state.json in live mode (production lessons)
//   - In LIVE mode, fetch failures NEVER silently revert to MOCK_JOBS — the
//     adapter holds the last good live snapshot if any, otherwise renders
//     empty live state with a loud console warning. Mock data is only
//     loaded when the operator explicitly switches mdk-data-mode to "mock".
//   - Sample data files are still loaded by job-board-dashboard.html so the
//     mock toggle remains usable for development; criterion 4 is enforced by
//     the fail-hard policy below.

(function () {
  const DEFAULTS = {
    endpoint: localStorage.getItem("mdk-endpoint") || "http://localhost:3045/state.json",
    pollSeconds: Number(localStorage.getItem("mdk-poll")) || 15,
    mode: localStorage.getItem("mdk-data-mode") || "mock",   // "mock" | "live"
  };

  // Claude API proxy — used by meeting.js rerunLive() to invoke agents server-side.
  // The server proxies to Anthropic so the API key never touches the browser.
  window.claude = {
    complete: async (prompt) => {
      const resp = await fetch('/api/claude/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Claude proxy error ' + resp.status);
      }
      const data = await resp.json();
      return data.text;
    },
  };

  // Connection state surfaced for the shell to render
  window.LiveData = {
    cfg: { ...DEFAULTS },
    status: "idle",       // idle | connecting | live | error | mock
    lastError: null,
    lastFetchedAt: null,
    lastSourceLabel: null,
    pollHandle: null,
    listeners: new Set(),
  };

  function emit() {
    LiveData.listeners.forEach((fn) => {
      try { fn(); } catch (e) { console.error(e); }
    });
  }
  window.LiveData.subscribe = (fn) => { LiveData.listeners.add(fn); return () => LiveData.listeners.delete(fn); };

  // ---- Schema normalization -----------------------------------------
  // The repo's state/<scope>/job-board.json is per-project. Each job lacks
  // a `project` field. We synthesize one from the project hint we pass in.
  function normalizeJob(raw, projectId) {
    const j = { ...raw };
    j.project = j.project || projectId || "default";
    j.priority = (j.priority || "P2").toUpperCase();
    j.status = (j.status || "open").toLowerCase();

    // Map repo schema → our richer schema where possible.
    if (!j.description && j.problem) j.description = j.problem;
    if (!j.tags) j.tags = [];
    if (Array.isArray(j.criteria) && !j.tags.length) {
      j.tags = ["oqe", `${j.criteria.length}-criteria`];
    }
    if (!j.posted_by) j.posted_by = j.posted_by || "Dispatch";

    // Latest reviewer verdict → derived state
    if (Array.isArray(j.review_history) && j.review_history.length) {
      const last = j.review_history[j.review_history.length - 1];
      j.last_review = last;
      if (last.verdict === "fail" && j.status !== "closed") {
        j.blocked_reason = j.blocked_reason || ("Review failed: " + (last.note || "no note"));
      }
    }

    // Progress: derive from status if absent
    if (j.progress === undefined) {
      if (j.status === "closed") j.progress = 1;
      else if (j.status === "in_review" || j.status === "submitted") j.progress = 0.9;
      else if (j.status === "accepted") j.progress = 0.4;
      else if (j.status === "blocked") j.progress = 0.5;
      else j.progress = 0;
    }

    return j;
  }

  function normalizeStateBundle(state, sourceLabel) {
    // The server returns ONE project's job-board under state["job-board"].
    // We support a future shape too: state["job-boards"] = { multideck: {...}, planex: {...} }.
    const out = { jobs: [], projects: [], personas: window.MOCK_PERSONAS, lessons: [] };
    const boards = [];

    if (state && state["job-boards"] && typeof state["job-boards"] === "object") {
      for (const [pid, board] of Object.entries(state["job-boards"])) {
        if (board && Array.isArray(board.jobs)) boards.push({ id: pid, board });
      }
    } else if (state && state["job-board"] && Array.isArray(state["job-board"].jobs)) {
      // Single board; infer project id from boundary_rule or fallback to 'workspace'.
      const inferred = inferProjectId(state["job-board"]) || sourceLabel || "workspace";
      boards.push({ id: inferred, board: state["job-board"] });
    }

    if (!boards.length) {
      throw new Error("No job-board data found in /state.json (looked for state['job-board'] and state['job-boards']).");
    }

    const palette = ["#00FFCC", "#FFB700", "#A855F7", "#FF3B6E", "#14B8A6", "#F97316"];
    boards.forEach(({ id, board }, i) => {
      const jobs = board.jobs.map((raw) => normalizeJob(raw, id));
      out.jobs.push(...jobs);
      out.projects.push({
        id,
        name: id.toUpperCase().replace(/-/g, " "),
        jobs: jobs.length,
        color: palette[i % palette.length],
      });
    });

    // MULTI-FEAT-0067 — pull production lessons out of state.lessons
    if (state && Array.isArray(state.lessons)) {
      out.lessons = state.lessons;
    }

    if (state && Array.isArray(state.meetings)) {
      out.meetings = state.meetings;
    }

    return out;
  }

  function inferProjectId(board) {
    // Try boundary_rule text or meta.project for a hint.
    if (board.meta && board.meta.project) return slug(board.meta.project);
    if (typeof board.boundary_rule === "string") {
      const m = board.boundary_rule.match(/scoped to (?:ONE\s+project|project[:\s]+)([a-z0-9_\-]+)/i);
      if (m) return slug(m[1]);
    }
    return null;
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  // ---- Apply / unapply ----------------------------------------------
  function applyLive(bundle, sourceLabel) {
    window.JOBS = bundle.jobs;
    window.PROJECTS = bundle.projects;
    window.PERSONAS = bundle.personas;
    // MULTI-FEAT-0067 — production lessons take over in live mode. Recompute
    // the by-id and by-job indexes the editor expects.
    window.LESSONS = Array.isArray(bundle.lessons) ? bundle.lessons : [];
    window.LESSONS_BY_ID = Object.fromEntries(window.LESSONS.map((l) => [l.id, l]));
    window.LESSONS_BY_JOB = window.LESSONS.reduce((m, l) => {
      (m[l.job_id] = m[l.job_id] || []).push(l);
      return m;
    }, {});
    window.MEETINGS = Array.isArray(bundle.meetings) ? bundle.meetings : [];
    window.MEETINGS_BY_ID = Object.fromEntries(window.MEETINGS.map((m) => [m.id, m]));
    window.JOB_STATS = (window.computeJobStats ? window.computeJobStats(window.JOBS) : { total: window.JOBS.length, byStatus:{}, byPriority:{}, byAgent:{} });
    LiveData.status = "live";
    LiveData.lastError = null;
    LiveData.lastFetchedAt = new Date();
    LiveData.lastSourceLabel = sourceLabel;
    emit();
    if (typeof window.renderAll === "function") window.renderAll();
  }

  function applyMock(reason) {
    // ONLY called when the operator explicitly switches to mock mode.
    // MULTI-FEAT-0067 criterion 4: live mode never silently swaps to MOCK
    // on a fetch failure — see fetchOnce() error branch.
    window.JOBS = window.MOCK_JOBS || window.JOBS || [];
    window.PROJECTS = window.MOCK_PROJECTS || window.PROJECTS || [];
    window.PERSONAS = window.MOCK_PERSONAS || window.PERSONAS || {};
    window.LESSONS = window.MOCK_LESSONS || window.LESSONS || [];
    window.LESSONS_BY_ID = Object.fromEntries(window.LESSONS.map((l) => [l.id, l]));
    window.LESSONS_BY_JOB = window.LESSONS.reduce((m, l) => {
      (m[l.job_id] = m[l.job_id] || []).push(l);
      return m;
    }, {});
    window.MEETINGS = window.MEETINGS || [];
    window.MEETINGS_BY_ID = Object.fromEntries(window.MEETINGS.map((m) => [m.id, m]));
    window.JOB_STATS = (window.computeJobStats ? window.computeJobStats(window.JOBS) : { total: window.JOBS.length, byStatus:{}, byPriority:{}, byAgent:{} });
    LiveData.status = reason ? "error" : "mock";
    LiveData.lastError = reason || null;
    LiveData.lastFetchedAt = new Date();
    LiveData.lastSourceLabel = "mock data";
    emit();
    if (typeof window.renderAll === "function") window.renderAll();
  }

  // Render an empty live snapshot — used when live fetch fails BEFORE we
  // have any good data yet. This is the "fail-hard" alternative to the
  // old applyMock-on-failure path: criterion 4 forbids silent sample
  // substitution in live mode.
  function applyEmptyLive(reason) {
    window.JOBS = [];
    window.PROJECTS = [];
    window.PERSONAS = window.MOCK_PERSONAS || window.PERSONAS || {};
    window.LESSONS = [];
    window.LESSONS_BY_ID = {};
    window.LESSONS_BY_JOB = {};
    window.MEETINGS = [];
    window.MEETINGS_BY_ID = {};
    window.JOB_STATS = { total: 0, byStatus: {}, byPriority: {}, byAgent: {} };
    LiveData.status = "error";
    LiveData.lastError = reason || "no data";
    LiveData.lastFetchedAt = new Date();
    LiveData.lastSourceLabel = "live (empty / disconnected)";
    emit();
    if (typeof window.renderAll === "function") window.renderAll();
  }

  // ---- Fetch ---------------------------------------------------------
  async function fetchOnce() {
    LiveData.status = "connecting";
    emit();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(LiveData.cfg.endpoint, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const state = await res.json();
      const bundle = normalizeStateBundle(state, "live");
      applyLive(bundle, LiveData.cfg.endpoint);
    } catch (e) {
      // MULTI-FEAT-0067 criterion 4: log a loud warning so silent fallback
      // can be detected in dev tools. Never substitute mock fixtures while
      // the operator is in live mode.
      console.warn(
        "[live] /state.json fetch failed:", e.message,
        "— remaining in live mode; explicit operator action required to swap to mock"
      );
      if (LiveData.status !== "live") {
        // No prior good data yet — render empty live state with the error.
        applyEmptyLive(e.message);
      } else {
        // We had good data; keep showing it but flip the status pill to error.
        LiveData.status = "error";
        LiveData.lastError = e.message;
        emit();
      }
    }
  }
  window.LiveData.refresh = fetchOnce;

  function startPolling() {
    stopPolling();
    if (LiveData.cfg.mode !== "live") return;
    fetchOnce();
    LiveData.pollHandle = setInterval(fetchOnce, LiveData.cfg.pollSeconds * 1000);
  }
  function stopPolling() {
    if (LiveData.pollHandle) {
      clearInterval(LiveData.pollHandle);
      LiveData.pollHandle = null;
    }
  }

  window.LiveData.setMode = (mode) => {
    LiveData.cfg.mode = mode;
    localStorage.setItem("mdk-data-mode", mode);
    if (mode === "live") startPolling();
    else { stopPolling(); applyMock(null); }
  };

  window.LiveData.setEndpoint = (url) => {
    LiveData.cfg.endpoint = url;
    localStorage.setItem("mdk-endpoint", url);
    if (LiveData.cfg.mode === "live") startPolling();
  };

  window.LiveData.setPollSeconds = (n) => {
    LiveData.cfg.pollSeconds = n;
    localStorage.setItem("mdk-poll", String(n));
    if (LiveData.cfg.mode === "live") startPolling();
  };

  // Boot — start polling if mode was previously set to live
  window.addEventListener("load", () => {
    if (LiveData.cfg.mode === "live") {
      startPolling();
    } else {
      applyMock(null);   // sets status indicator to "mock"
    }
  });
})();
