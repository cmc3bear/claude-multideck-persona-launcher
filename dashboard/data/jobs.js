// Realistic sample data derived from state/job-board-multideck.json shapes.
// Multiple projects, varied statuses, real personas.
//
// Job ID format (OQE 2.0 §13): PROJECT-WORKTYPE-NNNN
//   PROJECT  = MULTIDECK | WORKSPACE
//   WORKTYPE = FEAT | FIX | AUDIT | REFACTOR | GATE | OQE | SPEC | OPS | ASSET
//   NNNN     = zero-padded 4-digit sequence
// `legacy_id` preserves the old bare integer for cross-references.

window.PERSONAS = {
  dispatch:             { callsign: "Dispatch",            color: "#00FFCC", scope: "workspace" },
  architect:            { callsign: "Architect",           color: "#FFB700", scope: "project-structure" },
  engineer:             { callsign: "Engineer",            color: "#0088FF", scope: "code-implementation" },
  reviewer:             { callsign: "Reviewer",            color: "#EF4444", scope: "quality-gate" },
  researcher:           { callsign: "Researcher",          color: "#A855F7", scope: "investigation" },
  "launcher-engineer":  { callsign: "Launcher-Engineer",   color: "#14B8A6", scope: "project:multideck" },
  "voice-technician":   { callsign: "Voice-Technician",    color: "#8B5CF6", scope: "project:multideck" },
  "persona-author":     { callsign: "Persona-Author",      color: "#D946EF", scope: "project:multideck" },
  "commercial-producer":{ callsign: "Commercial-Producer", color: "#F43F5E", scope: "project:multideck" },
  resonance:            { callsign: "Resonance",           color: "#EC4899", scope: "project:multideck" }
};

window.PROJECTS = [
  { id: "multideck",    name: "MULTIDECK",    jobs: 0, color: "#00FFCC" },
  { id: "default",      name: "WORKSPACE",    jobs: 0, color: "#A855F7" },
];

// Status pipeline: open -> accepted -> submitted -> in_review -> closed
//                                                   \-> blocked
const STATUSES = ["open","accepted","submitted","in_review","closed","blocked"];
const PRIORITIES = ["P0","P1","P2","P3"];

function t(isoOffsetHours) {
  return new Date(Date.now() + isoOffsetHours * 3600e3).toISOString();
}

window.JOBS = [
  // ---- Live / in-flight ------------------------------------------------
  { id:"MULTIDECK-GOV-0056", legacy_id:"56", project:"multideck",
    subject:"Adopt OQE 2.0 Reviewer Log protocol — all agents",
    assigned_to:"architect",
    priority:"P0", status:"open", posted_by:"Dispatch",
    created_at:t(-0.2), eta_hours:2, progress:0,
    description:"Cross-project governance: every agent on roster reviews docs/REVIEWER_LOG.md, asks questions, raises concerns, and commits to compliance. Convene the round-table in MEETING ROOM. Decision required: ratify, ratify-with-amendments, or reject. Acceptance = all 8 agents recorded position; tenets and lesson schema unchanged unless cross-project amendment passes.",
    depends_on:null,
    tags:["governance","oqe","reviewer-log","cross-project","ratification","self-improvement","tenets"] },

  { id:"MULTIDECK-FEAT-0055", legacy_id:"55", project:"multideck",
    subject:"V2 semantic matcher for prior-lessons retrieval",
    assigned_to:"architect",
    priority:"P2", status:"open", posted_by:"Dispatch",
    created_at:t(-0.5), eta_hours:6, progress:0,
    description:"V1 lesson matcher uses tag-overlap + worktype + applies_to_tags. Add semantic matching layer on top: (1) compute embeddings for each lesson's root_cause + applies_to + tag set, (2) match new jobs by cosine similarity to surface lessons whose tags don't overlap but problem-shape does, (3) blend with v1 score. Must remain deterministic in offline mode (cached embeddings on lesson ratification).",
    depends_on:null, tags:["matcher","semantic","retrieval","self-improvement","oqe"] },

  { id:"MULTIDECK-FEAT-0054", legacy_id:"54", project:"multideck",
    subject:"Redesign /jobs dashboard — 3 variations", assigned_to:"launcher-engineer",
    priority:"P0", status:"accepted", posted_by:"Dispatch",
    created_at:t(-2), accepted_at:t(-1.5), eta_hours:4, progress:0.25,
    description:"Full redesign pass on the job-board dashboard. Keep cyberpunk DNA but tighten hierarchy. Deliver 3 variations exposed via Tweaks.",
    depends_on:["MULTIDECK-AUDIT-0053"], tags:["ui","dashboard","redesign","P0"] },

  { id:"MULTIDECK-AUDIT-0053", legacy_id:"53", project:"multideck",
    subject:"Audit current dashboard typographic hierarchy", assigned_to:"architect",
    priority:"P1", status:"submitted", posted_by:"Dispatch",
    created_at:t(-5), accepted_at:t(-4.5), submitted_at:t(-0.3), eta_hours:0, progress:1.0,
    description:"Audit type scale, contrast, density across main dashboard and launcher. Produce findings with evidence.",
    result:"Found 4 MAJOR: VT323 fails at sizes <16px, 8-bit headers dominate at all levels, scanline flicker reduces readability, no density tiers.",
    depends_on:null, tags:["audit","typography","a11y"] },

  { id:"MULTIDECK-FIX-0052", legacy_id:"52", project:"multideck",
    subject:"Fix SSE reconnect storm on /api/job-board-stream", assigned_to:"engineer",
    priority:"P0", status:"in_review", posted_by:"Launcher-Engineer",
    created_at:t(-8), accepted_at:t(-7), submitted_at:t(-1.2), eta_hours:0, progress:1.0,
    description:"Clients reconnect every 3s when server restarts, flooding logs. Add backoff.",
    result:"Exponential backoff (1s,2s,4s,8s max 30s) with jitter. Single watcher per file. Verified via chaos test: 200 clients, zero reconnect storm.",
    depends_on:null, tags:["reliability","sse","backoff"] },

  { id:"MULTIDECK-FIX-0051", legacy_id:"51", project:"multideck",
    subject:"Kokoro queue drops announcements under heavy load", assigned_to:"voice-technician",
    priority:"P1", status:"accepted", posted_by:"Dispatch",
    created_at:t(-14), accepted_at:t(-12), eta_hours:3, progress:0.6,
    description:"Mutex queue evicts when >12 announcements queue. Need spillover file or priority lane for P0-fix callouts.",
    depends_on:null, tags:["tts","queue","reliability"] },

  { id:"MULTIDECK-ASSET-0047", legacy_id:"47", project:"multideck",
    subject:"Commercial: 'How Do You Claude' 60s extended cut", assigned_to:"commercial-producer",
    priority:"P2", status:"open", posted_by:"Dispatch",
    created_at:t(-30), eta_hours:12, progress:0,
    description:"Extend 40s commercial to 60s with new third act. Preserve music bed cadence.",
    depends_on:null, tags:["commercial","video","extend"] },

  { id:"MULTIDECK-REFACTOR-0046", legacy_id:"46", project:"multideck",
    subject:"Refactor launcher.html — split 2750-line monolith", assigned_to:"launcher-engineer",
    priority:"P1", status:"open", posted_by:"Architect",
    created_at:t(-33), eta_hours:10, progress:0,
    description:"Split launcher.html into 6 modules: chrome, select-screen, detail, teams, options, boot. Keep cyberpunk styling intact.",
    depends_on:null, tags:["refactor","launcher","tech-debt"] },

  { id:"MULTIDECK-FEAT-0045", legacy_id:"45", project:"multideck",
    subject:"Add /api/actions PATCH endpoint", assigned_to:"engineer",
    priority:"P2", status:"in_review", posted_by:"Dispatch",
    created_at:t(-38), accepted_at:t(-36), submitted_at:t(-3), eta_hours:0, progress:1.0,
    description:"Actions can't be dismissed from the dashboard. Add PATCH endpoint with acknowledge/dismiss.",
    result:"PATCH /api/actions/:id accepts {status: 'done'|'dismissed'}. Persists to actions.json. Covered by 4 integration tests.",
    depends_on:null, tags:["api","actions","feature"] },

  { id:"WORKSPACE-FEAT-0044", legacy_id:"44", project:"default",
    subject:"Calendar: sync Google Workspace via gcal_read", assigned_to:"dispatch",
    priority:"P1", status:"submitted", posted_by:"Dispatch",
    created_at:t(-48), accepted_at:t(-47), submitted_at:t(-0.5), eta_hours:0, progress:1.0,
    description:"Dashboard calendar pulls from calendar.json, but that file is stale. Wire gcal_read to refresh every 5 min.",
    result:"Added cron job, 5min refresh. Events from 3 calendars merged with dedup. Conflicts marked on dashboard.",
    depends_on:null, tags:["calendar","gcal","sync"] },

  { id:"MULTIDECK-FEAT-0041", legacy_id:"41", project:"multideck",
    subject:"Add 'agent on tilt' detector to dispatch-log", assigned_to:"resonance",
    priority:"P2", status:"open", posted_by:"Dispatch",
    created_at:t(-72), eta_hours:4, progress:0,
    description:"Flag when an agent's FLAG rate exceeds 40% over the last 10 jobs. Surface on ops dashboard.",
    depends_on:null, tags:["observability","ml","tilt"] },

  { id:"MULTIDECK-SPEC-0040", legacy_id:"40", project:"multideck",
    subject:"Persona-Author: draft 'Archivist' persona", assigned_to:"persona-author",
    priority:"P3", status:"open", posted_by:"Dispatch",
    created_at:t(-90), eta_hours:3, progress:0,
    description:"New persona for session archival + retrospective synthesis. Draft AGENT.md + registry entry.",
    depends_on:null, tags:["persona","archive"] },

  // ---- Recently closed (tail for timeline views) -----------------------
  { id:"MULTIDECK-ASSET-0039", legacy_id:"39", project:"multideck",
    subject:"Resolve flagged Job 11 — all 9 portraits generated", assigned_to:"launcher-engineer",
    priority:"P1", status:"closed", posted_by:"Launcher-Engineer",
    created_at:t(-100), accepted_at:t(-98), submitted_at:t(-96), closed_at:t(-95),
    result:"All 9 portraits via ComfyUI PixelArt LoRA. 384x512 PNG. Consistent cyberpunk style.",
    review_history:[{reviewer:"Reviewer",verdict:"pass",note:"Portraits match spec, no personal data"}],
    depends_on:null, tags:["portraits","assets","closed"] },

  { id:"MULTIDECK-OPS-0038", legacy_id:"38", project:"multideck",
    subject:"Sync save_to_feed + prune_feed to ~/.claude/hooks", assigned_to:"voice-technician",
    priority:"P1", status:"closed", posted_by:"Dispatch",
    created_at:t(-105), closed_at:t(-102),
    result:"Surgically merged into active hook. Custom voices preserved.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["tts","hook-sync"] },

  { id:"MULTIDECK-GATE-0037", legacy_id:"37", project:"multideck",
    subject:"Reviewer gate: portraits + media + README", assigned_to:"reviewer",
    priority:"P0", status:"closed", posted_by:"Dispatch",
    created_at:t(-110), closed_at:t(-108),
    result:"6-gate PASS with 2 advisories. 11MB MP4 no LFS accepted. Orphan screenshot deleted.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["reviewer","gate","pre-push"] },

  { id:"MULTIDECK-GATE-0036", legacy_id:"36", project:"multideck",
    subject:"Reviewer gate: audit fixes pre-push", assigned_to:"reviewer",
    priority:"P0", status:"closed", posted_by:"Dispatch",
    created_at:t(-115), closed_at:t(-114),
    result:"6-gate PASS. All claims verified by grep. No personal data.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["reviewer","gate"] },

  { id:"MULTIDECK-FEAT-0035", legacy_id:"35", project:"multideck",
    subject:"Runtime boundary enforcement in job-board.py", assigned_to:"engineer",
    priority:"P0", status:"closed", posted_by:"Dispatch",
    created_at:t(-125), closed_at:t(-122),
    result:"3 layers: --project banner, boundary_rule field, list reminder.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["governance","cli"] },

  { id:"MULTIDECK-SPEC-0034", legacy_id:"34", project:"multideck",
    subject:"Add Coordination Standard 9 — project boundaries", assigned_to:"architect",
    priority:"P0", status:"closed", posted_by:"Dispatch",
    created_at:t(-128), closed_at:t(-125),
    result:"Added to JOB_BOARD.md + agent template. Handoff protocol defined.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["governance","boundaries"] },

  { id:"MULTIDECK-OQE-0033", legacy_id:"33", project:"multideck",
    subject:"OQE: MP3 over WAV for feed storage", assigned_to:"architect",
    priority:"P2", status:"closed", posted_by:"Dispatch",
    created_at:t(-130), closed_at:t(-128),
    result:"MP3 128k avg 576KB vs 3MB WAV. Tailscale/cell. Sub-second encode on 4090.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["oqe","design"] },

  { id:"MULTIDECK-FEAT-0032", legacy_id:"32", project:"multideck",
    subject:"24h retention prune on tts-output", assigned_to:"voice-technician",
    priority:"P2", status:"closed", posted_by:"Dispatch",
    created_at:t(-132), closed_at:t(-130),
    result:"prune_feed() deletes MP3s mtime >24h.", review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["retention","tts"] },

  { id:"MULTIDECK-FEAT-0031", legacy_id:"31", project:"multideck",
    subject:"save_to_feed — WAV→MP3 to tts-output", assigned_to:"voice-technician",
    priority:"P1", status:"closed", posted_by:"Dispatch",
    created_at:t(-135), closed_at:t(-132),
    result:"ffmpeg 128k encode, timestamped callsign filename, appears in feed within 4s.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["tts","pipeline"] },

  { id:"MULTIDECK-FEAT-0030", legacy_id:"30", project:"multideck",
    subject:"Audio feed transport controls: PREV, SKIP, seek", assigned_to:"engineer",
    priority:"P1", status:"closed", posted_by:"Dispatch",
    created_at:t(-140), closed_at:t(-138),
    result:"6 transport controls + seekable progress + clickable history.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["audio-feed","ui"] },

  { id:"MULTIDECK-SPEC-0029", legacy_id:"29", project:"multideck",
    subject:"CHANGELOG 0.1.2 — audit fixes + new features", assigned_to:"architect",
    priority:"P1", status:"closed", posted_by:"Dispatch",
    created_at:t(-145), closed_at:t(-143),
    result:"Added 0.1.2 with Added + Fixed sections, Keep a Changelog format.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["changelog","release"] },
];

// Derived counts for stat chips
function computeJobStats(jobs) {
  const out = { total: jobs.length, byStatus: {}, byPriority: {}, byAgent: {} };
  for (const j of jobs) {
    out.byStatus[j.status] = (out.byStatus[j.status]||0)+1;
    out.byPriority[j.priority] = (out.byPriority[j.priority]||0)+1;
    out.byAgent[j.assigned_to] = (out.byAgent[j.assigned_to]||0)+1;
  }
  return out;
}
window.computeJobStats = computeJobStats;
window.JOB_STATS = computeJobStats(window.JOBS);

// Stash mock data so the live adapter can swap back to it on disconnect
// Recompute project job counts from actual job list
window.PROJECTS.forEach(p => { p.jobs = window.JOBS.filter(j => j.project === p.id).length; });
window.MOCK_PERSONAS = window.PERSONAS;
window.MOCK_PROJECTS = window.PROJECTS;
window.MOCK_JOBS = window.JOBS;
