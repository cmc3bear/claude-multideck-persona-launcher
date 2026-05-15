// Realistic sample data derived from state/job-board-multideck.json shapes.
// Multiple projects, varied statuses, real personas.

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
  foreman:              { callsign: "Foreman",             color: "#F97316", scope: "project:planex-core" },
  kernel:               { callsign: "Kernel",              color: "#10B981", scope: "project:planex-core" },
  inspector:            { callsign: "Inspector",           color: "#E11D48", scope: "project:planex-core" },
  producer:             { callsign: "Producer",            color: "#3B82F6", scope: "project:planex-core" },
  packer:               { callsign: "Packer",              color: "#EAB308", scope: "project:planex-core" },
  resonance:            { callsign: "Resonance",           color: "#EC4899", scope: "project:multideck" }
};

window.PROJECTS = [
  { id: "multideck",    name: "MULTIDECK",    jobs: 28, color: "#00FFCC" },
  { id: "planex-core",  name: "PLANEX-CORE",  jobs: 19, color: "#FFB700" },
  { id: "default",      name: "WORKSPACE",    jobs: 6,  color: "#A855F7" },
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
  { id:"54", project:"multideck", subject:"Redesign /jobs dashboard — 3 variations", assigned_to:"launcher-engineer",
    priority:"P0", status:"accepted", posted_by:"Dispatch",
    created_at:t(-2), accepted_at:t(-1.5), eta_hours:4, progress:0.25,
    description:"Full redesign pass on the job-board dashboard. Keep cyberpunk DNA but tighten hierarchy. Deliver 3 variations exposed via Tweaks.",
    depends_on:["53"], tags:["ui","dashboard","redesign","P0"] },

  { id:"53", project:"multideck", subject:"Audit current dashboard typographic hierarchy", assigned_to:"architect",
    priority:"P1", status:"submitted", posted_by:"Dispatch",
    created_at:t(-5), accepted_at:t(-4.5), submitted_at:t(-0.3), eta_hours:0, progress:1.0,
    description:"Audit type scale, contrast, density across main dashboard and launcher. Produce findings with evidence.",
    result:"Found 4 MAJOR: VT323 fails at sizes <16px, 8-bit headers dominate at all levels, scanline flicker reduces readability, no density tiers.",
    depends_on:null, tags:["audit","typography","a11y"] },

  { id:"52", project:"multideck", subject:"Fix SSE reconnect storm on /api/job-board-stream", assigned_to:"engineer",
    priority:"P0", status:"in_review", posted_by:"Launcher-Engineer",
    created_at:t(-8), accepted_at:t(-7), submitted_at:t(-1.2), eta_hours:0, progress:1.0,
    description:"Clients reconnect every 3s when server restarts, flooding logs. Add backoff.",
    result:"Exponential backoff (1s,2s,4s,8s max 30s) with jitter. Single watcher per file. Verified via chaos test: 200 clients, zero reconnect storm.",
    depends_on:null, tags:["reliability","sse","backoff"] },

  { id:"51", project:"multideck", subject:"Kokoro queue drops announcements under heavy load", assigned_to:"voice-technician",
    priority:"P1", status:"accepted", posted_by:"Dispatch",
    created_at:t(-14), accepted_at:t(-12), eta_hours:3, progress:0.6,
    description:"Mutex queue evicts when >12 announcements queue. Need spillover file or priority lane for P0-fix callouts.",
    depends_on:null, tags:["tts","queue","reliability"] },

  { id:"50", project:"planex-core", subject:"Design Foreman task-breakdown protocol v2", assigned_to:"foreman",
    priority:"P1", status:"accepted", posted_by:"Architect",
    created_at:t(-20), accepted_at:t(-18), eta_hours:6, progress:0.4,
    description:"v1 produced 14-step breakdowns too rigid for exploratory work. Add branching + checkpoints.",
    depends_on:null, tags:["protocol","foreman","design"] },

  { id:"49", project:"planex-core", subject:"Kernel: vendor lockfile audit across 3 services", assigned_to:"kernel",
    priority:"P0", status:"blocked", posted_by:"Inspector",
    created_at:t(-26), accepted_at:t(-24), eta_hours:8, progress:0.15,
    blocked_reason:"Awaiting access to planex-payments private registry",
    description:"Audit lockfile drift. Inspector flagged 7 packages with unsynced transitive deps.",
    depends_on:["48"], tags:["security","lockfile","audit"] },

  { id:"48", project:"planex-core", subject:"Grant Kernel read access to planex-payments registry", assigned_to:"dispatch",
    priority:"P0", status:"open", posted_by:"Kernel",
    created_at:t(-27), eta_hours:0.5, progress:0,
    description:"Registry access token needed to complete Job 49.",
    depends_on:null, tags:["access","admin","blocker"] },

  { id:"47", project:"multideck", subject:"Commercial: 'How Do You Claude' 60s extended cut", assigned_to:"commercial-producer",
    priority:"P2", status:"open", posted_by:"Dispatch",
    created_at:t(-30), eta_hours:12, progress:0,
    description:"Extend 40s commercial to 60s with new third act. Preserve music bed cadence.",
    depends_on:null, tags:["commercial","video","extend"] },

  { id:"46", project:"multideck", subject:"Refactor launcher.html — split 2750-line monolith", assigned_to:"launcher-engineer",
    priority:"P1", status:"open", posted_by:"Architect",
    created_at:t(-33), eta_hours:10, progress:0,
    description:"Split launcher.html into 6 modules: chrome, select-screen, detail, teams, options, boot. Keep cyberpunk styling intact.",
    depends_on:null, tags:["refactor","launcher","tech-debt"] },

  { id:"45", project:"multideck", subject:"Add /api/actions PATCH endpoint", assigned_to:"engineer",
    priority:"P2", status:"in_review", posted_by:"Dispatch",
    created_at:t(-38), accepted_at:t(-36), submitted_at:t(-3), eta_hours:0, progress:1.0,
    description:"Actions can't be dismissed from the dashboard. Add PATCH endpoint with acknowledge/dismiss.",
    result:"PATCH /api/actions/:id accepts {status: 'done'|'dismissed'}. Persists to actions.json. Covered by 4 integration tests.",
    depends_on:null, tags:["api","actions","feature"] },

  { id:"44", project:"default", subject:"Calendar: sync Google Workspace via gcal_read", assigned_to:"dispatch",
    priority:"P1", status:"submitted", posted_by:"Dispatch",
    created_at:t(-48), accepted_at:t(-47), submitted_at:t(-0.5), eta_hours:0, progress:1.0,
    description:"Dashboard calendar pulls from calendar.json, but that file is stale. Wire gcal_read to refresh every 5 min.",
    result:"Added cron job, 5min refresh. Events from 3 calendars merged with dedup. Conflicts marked on dashboard.",
    depends_on:null, tags:["calendar","gcal","sync"] },

  { id:"43", project:"planex-core", subject:"Producer: audition 4 VO talents for payments commercial", assigned_to:"producer",
    priority:"P2", status:"accepted", posted_by:"Dispatch",
    created_at:t(-54), accepted_at:t(-50), eta_hours:5, progress:0.5,
    description:"Need mid-30s female VO, warm-professional tone. Audition kokoro variants + 2 real talents.",
    depends_on:null, tags:["vo","audition","commercial"] },

  { id:"42", project:"planex-core", subject:"Inspector: quarterly security sweep", assigned_to:"inspector",
    priority:"P0", status:"accepted", posted_by:"Architect",
    created_at:t(-60), accepted_at:t(-58), eta_hours:16, progress:0.3,
    description:"Quarterly OWASP top-10 sweep across 3 services. Previous sweep found 4 HIGH, 11 MEDIUM.",
    depends_on:null, tags:["security","owasp","quarterly"] },

  { id:"41", project:"multideck", subject:"Add 'agent on tilt' detector to dispatch-log", assigned_to:"resonance",
    priority:"P2", status:"open", posted_by:"Dispatch",
    created_at:t(-72), eta_hours:4, progress:0,
    description:"Flag when an agent's FLAG rate exceeds 40% over the last 10 jobs. Surface on ops dashboard.",
    depends_on:null, tags:["observability","ml","tilt"] },

  { id:"40", project:"multideck", subject:"Persona-Author: draft 'Archivist' persona", assigned_to:"persona-author",
    priority:"P3", status:"open", posted_by:"Dispatch",
    created_at:t(-90), eta_hours:3, progress:0,
    description:"New persona for session archival + retrospective synthesis. Draft AGENT.md + registry entry.",
    depends_on:null, tags:["persona","archive"] },

  // ---- Recently closed (tail for timeline views) -----------------------
  { id:"39", project:"multideck", subject:"Resolve flagged Job 11 — all 9 portraits generated", assigned_to:"launcher-engineer",
    priority:"P1", status:"closed", posted_by:"Launcher-Engineer",
    created_at:t(-100), accepted_at:t(-98), submitted_at:t(-96), closed_at:t(-95),
    result:"All 9 portraits via ComfyUI PixelArt LoRA. 384x512 PNG. Consistent cyberpunk style.",
    review_history:[{reviewer:"Reviewer",verdict:"pass",note:"Portraits match spec, no personal data"}],
    depends_on:null, tags:["portraits","assets","closed"] },

  { id:"38", project:"multideck", subject:"Sync save_to_feed + prune_feed to ~/.claude/hooks", assigned_to:"voice-technician",
    priority:"P1", status:"closed", posted_by:"Dispatch",
    created_at:t(-105), closed_at:t(-102),
    result:"Surgically merged into active hook. Custom voices preserved.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["tts","hook-sync"] },

  { id:"37", project:"multideck", subject:"Reviewer gate: portraits + media + README", assigned_to:"reviewer",
    priority:"P0", status:"closed", posted_by:"Dispatch",
    created_at:t(-110), closed_at:t(-108),
    result:"6-gate PASS with 2 advisories. 11MB MP4 no LFS accepted. Orphan screenshot deleted.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["reviewer","gate","pre-push"] },

  { id:"36", project:"multideck", subject:"Reviewer gate: audit fixes pre-push", assigned_to:"reviewer",
    priority:"P0", status:"closed", posted_by:"Dispatch",
    created_at:t(-115), closed_at:t(-114),
    result:"6-gate PASS. All claims verified by grep. No personal data.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["reviewer","gate"] },

  { id:"35", project:"multideck", subject:"Runtime boundary enforcement in job-board.py", assigned_to:"engineer",
    priority:"P0", status:"closed", posted_by:"Dispatch",
    created_at:t(-125), closed_at:t(-122),
    result:"3 layers: --project banner, boundary_rule field, list reminder.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["governance","cli"] },

  { id:"34", project:"multideck", subject:"Add Coordination Standard 9 — project boundaries", assigned_to:"architect",
    priority:"P0", status:"closed", posted_by:"Dispatch",
    created_at:t(-128), closed_at:t(-125),
    result:"Added to JOB_BOARD.md + agent template. Handoff protocol defined.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["governance","boundaries"] },

  { id:"33", project:"multideck", subject:"OQE: MP3 over WAV for feed storage", assigned_to:"architect",
    priority:"P2", status:"closed", posted_by:"Dispatch",
    created_at:t(-130), closed_at:t(-128),
    result:"MP3 128k avg 576KB vs 3MB WAV. Tailscale/cell. Sub-second encode on 4090.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["oqe","design"] },

  { id:"32", project:"multideck", subject:"24h retention prune on tts-output", assigned_to:"voice-technician",
    priority:"P2", status:"closed", posted_by:"Dispatch",
    created_at:t(-132), closed_at:t(-130),
    result:"prune_feed() deletes MP3s mtime >24h.", review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["retention","tts"] },

  { id:"31", project:"multideck", subject:"save_to_feed — WAV→MP3 to tts-output", assigned_to:"voice-technician",
    priority:"P1", status:"closed", posted_by:"Dispatch",
    created_at:t(-135), closed_at:t(-132),
    result:"ffmpeg 128k encode, timestamped callsign filename, appears in feed within 4s.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["tts","pipeline"] },

  { id:"30", project:"multideck", subject:"Audio feed transport controls: PREV, SKIP, seek", assigned_to:"engineer",
    priority:"P1", status:"closed", posted_by:"Dispatch",
    created_at:t(-140), closed_at:t(-138),
    result:"6 transport controls + seekable progress + clickable history.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["audio-feed","ui"] },

  { id:"29", project:"multideck", subject:"CHANGELOG 0.1.2 — audit fixes + new features", assigned_to:"architect",
    priority:"P1", status:"closed", posted_by:"Dispatch",
    created_at:t(-145), closed_at:t(-143),
    result:"Added 0.1.2 with Added + Fixed sections, Keep a Changelog format.",
    review_history:[{reviewer:"Reviewer",verdict:"pass"}],
    depends_on:null, tags:["changelog","release"] },
];

// Derived counts for stat chips
window.JOB_STATS = (() => {
  const out = { total: JOBS.length, byStatus: {}, byPriority: {}, byAgent: {} };
  for (const j of JOBS) {
    out.byStatus[j.status] = (out.byStatus[j.status]||0)+1;
    out.byPriority[j.priority] = (out.byPriority[j.priority]||0)+1;
    out.byAgent[j.assigned_to] = (out.byAgent[j.assigned_to]||0)+1;
  }
  return out;
})();
