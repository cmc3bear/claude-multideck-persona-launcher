// ============ STATIC DATA ============
const GLYPHS = {
  dispatch: 'D', architect: 'A', engineer: 'E', reviewer: 'R', researcher: 'Q',
  arbiter: 'G', smith: 'S', 'persona-author': 'P', resonance: 'V', producer: 'C', packer: 'K',
  'dungeon-master': '⚔', 'npc-agent': '♟',
};

const STATS = {
  dispatch:              { hp: 999, atk: 60, def: 85, int: 95, class: 'Coordinator',   flavor: 'Workspace-level ambient coordinator. Routes tasks across projects, tracks jobs, enforces OQE discipline on every task. Never implements, always delegates.' },
  architect:             { hp:  80, atk: 50, def: 90, int: 98, class: 'Strategist',    flavor: 'Project structure, builds, documentation, and cross-agent coordination. Authors charters, sets PM discipline. The meta-builder.' },
  engineer:              { hp:  85, atk: 90, def: 70, int: 85, class: 'Implementer',   flavor: 'Code implementation, testing, debugging. Writes the code that ships. Fast, precise, doesn\u2019t miss.' },
  reviewer:              { hp:  80, atk: 70, def: 95, int: 96, class: 'Quality Gate',  flavor: 'OQE review on every completed job. PASS or FLAG with a single fix loop. Nothing ships without a green light.' },
  researcher:            { hp:  90, atk: 80, def: 75, int: 94, class: 'Investigator',  flavor: 'Source-cited investigation, grading STRONG, MODERATE, or LIMITED per OQE discipline. Never speculates. Flags single-source claims.' },
  arbiter:               { hp:  88, atk: 55, def: 95, int: 99, class: 'Strategy',      flavor: 'Strategy and goal management. Holds the definition of done, arbitrates scope drift, and closes goals against evidence.' },
  smith:                 { hp:  82, atk: 65, def: 92, int: 96, class: 'Control',       flavor: 'Quality observability and internal control. Error taxonomy, lessons pipeline, review instrumentation, release evidence, and systemic failure tracking.' },
  'persona-author':      { hp:  70, atk: 50, def: 80, int: 98, class: 'Meta-Agent',    flavor: 'Writes other personas. Maintains personas.json, keeps templates in sync, validates cross-references. The agent that agents are born from.' },
  resonance:             { hp:  80, atk: 70, def: 90, int: 95, class: 'Audio Engineer',flavor: 'Kokoro hooks, the audio lock, per-session voice isolation, callsign announcements, and ffmpeg post-processing chains.' },
  producer:              { hp:  75, atk: 80, def: 75, int: 88, class: 'Narrator',      flavor: 'End to end production. Draft script, VO generation, music bed integration, scene direction, quality gate, and final master.' },
  packer:                { hp:  78, atk: 72, def: 84, int: 82, class: 'Assets',        flavor: 'Portraits, ICOs, intros, shortcuts, and asset packaging. Verifies each pipeline stage before moving on.' },
  'dungeon-master':      { hp: 999, atk: 95, def: 80, int: 99, class: 'Dungeon Master', flavor: 'D&D 5e campaign engine. Server-authoritative dice, scene narration, world state, NPC spawning, consequence tracking. No plot armor. The dice decide.' },
  'npc-agent':           { hp:  50, atk: 60, def: 40, int: 70, class: 'NPC',            flavor: 'In-character non-player character. Unique voice, own agenda, own secrets. Can lie, bargain, betray, or help. Identity assigned at spawn.' },
};

const DASHBOARDS = [
  { name: 'DESKTOP',      url: '/',             desc: 'Full dispatch board: actions, calendar, escalations, intel.' },
  { name: 'MOBILE',       url: '/mobile',       desc: 'Compact ops view tuned for phone over Tailscale.' },
  { name: 'BRIEFING',     url: '/briefing',     desc: 'Morning pipeline rundown for the day ahead.' },
  { name: 'INTELLIGENCE', url: '/intelligence', desc: 'OSINT signal feeds and indicator activity.' },
  { name: 'AUDIO FEED',   url: '/audio-feed',   desc: 'Auto-play TTS feed. PREV, SKIP, seek, replay from history.' },
  { name: 'JOB BOARD',    url: '/jobs',         desc: 'Visual job board. All project boards, status filters, priority sorting.' },
  { name: 'RAW STATE',    url: '/state.json',   desc: 'Raw JSON state dump for debugging and automation.' },
  { name: 'CREDENTIALS',  url: '/credentials',  desc: 'API key vault. Grouped by service, masked at rest. Generate and rotate keys.' },
];

// ============ APP STATE ============
const state = {
  personas: {},      // raw from registry
  projects: [],      // raw from server
  filteredPersonas: [], // ordered list shown on character select
  tracks: [],        // music tracks from /launcher/music
  currentTrack: null, // currently selected track url
  teamPresets: [],   // named team presets from /launcher/team-presets
  currentProject: null,
  selectedPersona: null,
  teamMode: false,
  team: [],          // ordered list of selected persona keys when in team mode
  currentScreen: 'boot-screen',
  kbdIndex: 0,
  bootDone: false,
  studioDone: false,
  titleGateOpen: false,
  runtime: 'codex',   // 'codex' | 'opencode' | 'vs' - set by mode-select screen
  models: [],          // populated from /launcher/models
  selectedModel: '',   // empty = persona default; otherwise provider/model id
};

const MUSIC_KEY = 'dispatch_launcher_track';
const DEFAULT_TRACK_FILE = 'Neon Conveyor Dreams.mp3';

// ============ STARS ============
(function makeStars() {
  const c = document.getElementById('stars');
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.animationDelay = Math.random() * 2 + 's';
    c.appendChild(s);
  }
})();

// ============ HELPERS ============
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

