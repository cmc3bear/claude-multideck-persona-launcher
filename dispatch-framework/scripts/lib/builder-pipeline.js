'use strict';
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DISPATCH_ROOT = process.env.DISPATCH_ROOT || path.join(__dirname, '..', '..');
const PERSONAS_PATH = process.env.DISPATCH_PERSONAS_JSON || path.join(DISPATCH_ROOT, 'personas', 'personas.json');
const STATE_DIR     = process.env.DISPATCH_STATE_DIR    || path.join(DISPATCH_ROOT, 'state');
const TEMPLATE_PATH = path.join(DISPATCH_ROOT, 'templates', 'AGENT_TEMPLATE.md');
const SET_VOICE_PY  = path.join(DISPATCH_ROOT, 'hooks', 'set-voice.py');
const GEN_MP3_PY    = path.join(DISPATCH_ROOT, 'hooks', 'kokoro-generate-mp3.py');
const JOB_BOARD     = path.join(STATE_DIR, 'job-board.json');
const AUDIT_LOG     = path.join(STATE_DIR, 'build-audit.json');

const OQE_VERSION = '2.0';

const KNOWN_VOICES = new Set([
  'af_sky','af_alloy','af_aoede','af_bella','af_heart','af_jessica','af_kore',
  'af_nicole','af_nova','af_river','af_sarah','af_luna',
  'am_adam','am_echo','am_eric','am_fenrir','am_liam','am_michael','am_onyx','am_puck','am_santa',
  'bf_alice','bf_emma','bf_isabella','bf_lily',
  'bm_daniel','bm_fable','bm_george','bm_lewis',
]);

// ── Validation ──────────────────────────────────────────────────────────────

const FIELDS = [
  { key: 'key',         label: 'Persona key (slug)',    validate: v => /^[a-z][a-z0-9-]{1,30}$/.test(v) ? null : 'Must be lowercase letters/numbers/hyphens, 2-32 chars, starting with a letter' },
  { key: 'callsign',    label: 'Callsign',              validate: v => v.length >= 2 && v.length <= 40 && !/["\\]/.test(v) ? null : 'Must be 2-40 characters, no double-quotes or backslashes' },
  { key: 'role',        label: 'Role (one sentence)',   validate: v => v.length >= 10 && v.length <= 120 ? null : 'Must be 10-120 characters' },
  { key: 'scope',       label: 'Scope',                 validate: v => v === 'workspace' || v === 'global' || /^project:[a-zA-Z0-9_-]+$/.test(v) ? null : 'Must be "workspace", "global", or "project:<name>"' },
  { key: 'voice_key',   label: 'Voice key',             validate: v => v.length >= 2 ? null : 'Required' },
  { key: 'color_hex',   label: 'Accent color (#RRGGBB)',validate: v => /^#[0-9A-Fa-f]{6}$/.test(v) ? null : 'Must be #RRGGBB hex format' },
  { key: 'tab_color',   label: 'Tab color (#RRGGBB)',   validate: v => /^#[0-9A-Fa-f]{6}$/.test(v) ? null : 'Must be #RRGGBB hex format' },
  { key: 'cwd',         label: 'Working directory',     validate: v => v.length >= 2 ? null : 'Required' },
  { key: 'description', label: 'Description (one sentence)', validate: v => v.length >= 10 && v.length <= 200 ? null : 'Must be 10-200 characters' },
];

function validateInputs(inputs) {
  const errors = [];
  for (const f of FIELDS) {
    const err = f.validate(inputs[f.key] || '');
    if (err) errors.push(`${f.key}: ${err}`);
  }
  return errors;
}

// ── Refinement ───────────────────────────────────────────────────────────────

function refineInputs(raw) {
  const inputs = { ...raw };
  // normalize key from callsign if not provided
  if (!inputs.key && inputs.callsign) {
    inputs.key = inputs.callsign.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  // always re-derive agent_file from key — never accept from external input (path traversal prevention)
  inputs.agent_file = `personas/${inputs.key.toUpperCase().replace(/-/g, '_')}_AGENT.md`;
  // voice_key warning
  inputs._voice_is_custom = inputs.voice_key && !KNOWN_VOICES.has(inputs.voice_key);
  return inputs;
}

// ── Conflict detection ────────────────────────────────────────────────────────

function checkConflicts(inputs, force) {
  const conflicts = [];
  try {
    const registry = JSON.parse(fs.readFileSync(PERSONAS_PATH, 'utf8'));
    if (registry.personas[inputs.key]) {
      conflicts.push({ type: 'duplicate_key', message: `Key "${inputs.key}" already exists in personas.json` });
    }
  } catch (e) {
    if (e.code !== 'ENOENT') conflicts.push({ type: 'registry_read_error', message: e.message });
  }
  const agentPath = path.join(DISPATCH_ROOT, inputs.agent_file);
  if (fs.existsSync(agentPath)) {
    conflicts.push({ type: 'file_exists', message: `Agent file already exists: ${inputs.agent_file}` });
  }
  if (!force && conflicts.length > 0) return conflicts;
  return force ? [] : conflicts;
}

// ── Template generation ───────────────────────────────────────────────────────

function generateAgentMd(inputs) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const now = new Date().toISOString();
  const voiceDesc = KNOWN_VOICES.has(inputs.voice_key)
    ? 'natural voice'
    : 'custom voice tensor';

  let md = template
    .replace(/\[Agent Name\]/g, inputs.callsign)
    .replace(/\[Short memorable name, max 2 words\]/g, inputs.callsign)
    .replace(/\[Primary role and responsibility\]/g, inputs.role)
    .replace(/\[Domain or area of focus\]/g, inputs.scope)
    .replace(/`\[voice_key\]`/g, `\`${inputs.voice_key}\``)
    .replace(/\[voice_key\]/g, inputs.voice_key)
    .replace(/\[voice description\]/g, voiceDesc)
    .replace(/\[callsign_lowercase\] \[voice_key\]/g, `${inputs.key} ${inputs.voice_key}`)
    .replace(/\[callsign_lowercase\]/g, inputs.key)
    .replace(/\$\{DISPATCH_USER_ROOT\}\/your\/path/g, inputs.cwd)
    .replace(/\[Callsign\]/g, inputs.callsign);

  const header = `<!--
oqe_version: ${OQE_VERSION}
created_at: ${now}
created_by: persona-builder
governs: ${inputs.key} persona scope: ${inputs.role}
-->

`;
  return header + md;
}

// ── Registry update ───────────────────────────────────────────────────────────

function updateRegistry(inputs, dryRun) {
  const now = new Date().toISOString();
  const rawRegistry = fs.readFileSync(PERSONAS_PATH, 'utf8');
  const registry = JSON.parse(rawRegistry);

  const entry = {
    callsign:    inputs.callsign,
    color_hex:   inputs.color_hex,
    tab_color:   inputs.tab_color,
    voice_key:   inputs.voice_key,
    cwd:         inputs.cwd,
    agent_file:  inputs.agent_file,
    description: inputs.description,
    scope:       inputs.scope,
    created_at:  now,
    oqe_version: OQE_VERSION,
  };

  const updated = JSON.parse(rawRegistry);
  updated.personas[inputs.key] = entry;
  updated.meta.last_updated = now;
  const content = JSON.stringify(updated, null, 2);
  JSON.parse(content); // validate before writing

  if (dryRun) return { backed_up: null, written: PERSONAS_PATH, content };

  // backup
  const bakPath = `${PERSONAS_PATH}.bak-${Date.now()}`;
  fs.writeFileSync(bakPath, rawRegistry);

  // atomic write
  const tmp = `${PERSONAS_PATH}.tmp`;
  fs.writeFileSync(tmp, content);
  try { JSON.parse(fs.readFileSync(tmp, 'utf8')); } catch (e) {
    fs.unlinkSync(tmp);
    throw new Error(`Registry write validation failed: ${e.message}`);
  }
  fs.renameSync(tmp, PERSONAS_PATH);

  return { backed_up: bakPath, written: PERSONAS_PATH };
}

// ── Voice map update ──────────────────────────────────────────────────────────

function insertVoiceEntry(filePath, key, callsign, voice_key, lang, speed) {
  if (!fs.existsSync(filePath)) return { skipped: true, reason: 'file not found' };
  let src = fs.readFileSync(filePath, 'utf8');

  // already present?
  if (new RegExp(`^\\s*"${key}"\\s*:`,'m').test(src)) {
    return { skipped: true, reason: `"${key}" already in VOICE_MAP` };
  }

  const safeCallsign = callsign.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const entry = `    "${key}":${' '.repeat(Math.max(1, 20 - key.length))}{"voice": "${voice_key}",  "lang": "${lang}", "speed": ${speed},  "callsign": "${safeCallsign}"},\n`;
  // insert before "default" line
  const updated = src.replace(/(\s+"default"\s*:)/, entry + '$1');
  if (updated === src) return { skipped: true, reason: 'could not find insertion point' };

  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, updated);
  fs.renameSync(tmp, filePath);
  return { skipped: false };
}

function updateVoiceMaps(inputs, dryRun) {
  const { key, callsign, voice_key } = inputs;
  const lang  = voice_key.startsWith('b') ? 'b' : 'a';
  const speed = 1.05;

  if (dryRun) return [
    { file: SET_VOICE_PY,  would_insert: true },
    { file: GEN_MP3_PY,    would_insert: true },
  ];

  return [
    { file: SET_VOICE_PY, ...insertVoiceEntry(SET_VOICE_PY,  key, callsign, voice_key, lang, speed) },
    { file: GEN_MP3_PY,   ...insertVoiceEntry(GEN_MP3_PY,    key, callsign, voice_key, lang, speed) },
  ];
}

// ── Starter job generation ────────────────────────────────────────────────────

function generateStarterJobs(inputs) {
  const now = new Date().toISOString();
  const base = 9000 + Math.floor(Math.random() * 100);
  return [
    {
      id: `MULTIDECK-FEAT-${base}`,
      project: 'multideck',
      status: 'open',
      priority: 'P1',
      title: `Define ${inputs.callsign} scope and governing documents`,
      assigned: inputs.key,
      problem: `${inputs.callsign} persona exists but has no scoped job board entries or documented operating boundaries.`,
      criteria: [
        `personas/${path.basename(inputs.agent_file)} contains ## My Lane table with at minimum 5 in-scope and 3 out-of-scope entries`,
        `personas/${path.basename(inputs.agent_file)} contains ## Governing Documents section citing at least 2 docs/ paths`,
        `personas/${path.basename(inputs.agent_file)} ## OQE Discipline section present per docs/OQE_DISCIPLINE.md §11`,
        `personas.json entry for "${inputs.key}" passes JSON.parse validation and contains all 10 required fields`,
        `set-voice.py VOICE_MAP contains "${inputs.key}" entry per hooks/set-voice.py VOICE_MAP pattern`,
      ],
      depends_on: [],
      tags: [inputs.key, 'persona', 'scope', 'oqe'],
      oqe_version: OQE_VERSION,
      created_at: now,
      created_by: 'persona-builder',
      alternatives_considered: 'Could defer scope doc until first real job — rejected because undocumented scope leads to boundary violations per docs/WORKSPACE_GOVERNANCE.md',
    },
    {
      id: `MULTIDECK-FEAT-${base + 1}`,
      project: 'multideck',
      status: 'open',
      priority: 'P2',
      title: `Create first OQE 2.0 job for ${inputs.callsign}`,
      assigned: inputs.key,
      problem: `New persona "${inputs.key}" has no job history. Without at least one completed OQE job, Reviewer cannot assess the persona's discipline.`,
      criteria: [
        `Job card exists in state/job-board.json with id matching MULTIDECK-FEAT-#### pattern per docs/JOB_BOARD.md`,
        `Job card contains problem statement (min 20 chars) per docs/OQE_DISCIPLINE.md §11`,
        `Job card contains at least 5 testable criteria each citing a §N anchor or file path per docs/OQE_DISCIPLINE.md §11`,
        `Job card contains depends_on: [] (explicit empty array) per docs/OQE_DISCIPLINE.md §11`,
        `Job card contains oqe_version: "2.0" per docs/OQE_DISCIPLINE.md §12`,
      ],
      depends_on: [`MULTIDECK-FEAT-${base}`],
      tags: [inputs.key, 'oqe', 'first-job'],
      oqe_version: OQE_VERSION,
      created_at: now,
      created_by: 'persona-builder',
      alternatives_considered: 'Could skip first job and let persona author it manually — accepted as lower priority but still P2 to establish evidence trail',
    },
    {
      id: `MULTIDECK-FEAT-${base + 2}`,
      project: 'multideck',
      status: 'open',
      priority: 'P2',
      title: `Reviewer audit: validate ${inputs.callsign} persona artifacts`,
      assigned: 'reviewer',
      problem: `${inputs.callsign} persona artifacts were generated by persona-builder and have not been independently reviewed.`,
      criteria: [
        `personas/${path.basename(inputs.agent_file)} passes reviewer-review.py scan per scripts/reviewer-review.py`,
        `personas.json entry for "${inputs.key}" contains no absolute private paths (tool-backed grep scan)`,
        `VOICE_MAP entries in hooks/set-voice.py and hooks/kokoro-generate-mp3.py are in sync (both contain "${inputs.key}")`,
        `Generated agent markdown contains oqe_version: "${OQE_VERSION}" in HTML comment block`,
        `Reviewer issues PASS with Reviewed-by: trailer per docs/REVIEW_WORKFLOW.md`,
      ],
      depends_on: [`MULTIDECK-FEAT-${base + 1}`],
      tags: [inputs.key, 'review', 'audit', 'reviewer'],
      oqe_version: OQE_VERSION,
      created_at: now,
      created_by: 'persona-builder',
      alternatives_considered: 'Could skip independent review for persona-builder output — rejected because LESSON-0001 requires tool-backed verification of negative claims',
    },
  ];
}

function writeStarterJobs(jobs, dryRun) {
  if (dryRun) return { would_write: JOB_BOARD, count: jobs.length };
  let board = { jobs: [] };
  if (fs.existsSync(JOB_BOARD)) {
    try { board = JSON.parse(fs.readFileSync(JOB_BOARD, 'utf8')); } catch (_) {}
    if (!Array.isArray(board.jobs)) board.jobs = [];
  }
  board.jobs.push(...jobs);
  const tmp = `${JOB_BOARD}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2));
  fs.renameSync(tmp, JOB_BOARD);
  return { written: JOB_BOARD, count: jobs.length };
}

// ── Validation layer ──────────────────────────────────────────────────────────

function validateArtifacts(inputs, agentMdContent) {
  const checks = [];

  // 1. No placeholder tokens
  const placeholders = (agentMdContent.match(/\[[A-Z][^\]]{2,40}\]/g) || []).filter(p =>
    /Agent Name|voice_key|Primary role|Domain or area|Short memorable|callsign_lowercase|voice description/.test(p)
  );
  checks.push({
    name: 'no_placeholder_tokens',
    result: placeholders.length === 0 ? 'pass' : 'fail',
    evidence: `grep scan: ${placeholders.length} placeholder(s) found${placeholders.length ? ': ' + placeholders.join(', ') : ''}`,
    evidence_strength: 'STRONG',
  });

  // 2. OQE header present
  const hasOqeHeader = agentMdContent.includes('oqe_version: 2.0') && agentMdContent.includes('created_by: persona-builder');
  checks.push({
    name: 'oqe_header_present',
    result: hasOqeHeader ? 'pass' : 'fail',
    evidence: `scan: oqe_version: 2.0 ${agentMdContent.includes('oqe_version: 2.0') ? 'found' : 'NOT found'}, created_by: persona-builder ${agentMdContent.includes('created_by: persona-builder') ? 'found' : 'NOT found'}`,
    evidence_strength: 'STRONG',
  });

  // 3. Required section headers
  const REQUIRED_SECTIONS = ['## Identity','## What I Am','## What I Am NOT','## My Lane','## Core Functions','## Voice Output Rules','## Governing Documents'];
  const missingSections = REQUIRED_SECTIONS.filter(s => !agentMdContent.includes(s));
  checks.push({
    name: 'required_sections_present',
    result: missingSections.length === 0 ? 'pass' : 'fail',
    evidence: `scan: ${missingSections.length === 0 ? 'all required sections found' : 'missing: ' + missingSections.join(', ')}`,
    evidence_strength: 'STRONG',
  });

  // 4. Callsign match
  const callsignInMd = agentMdContent.match(/\*\*Callsign:\*\*\s*(.+)/)?.[1]?.trim();
  checks.push({
    name: 'callsign_match',
    result: callsignInMd === inputs.callsign ? 'pass' : 'fail',
    evidence: `found "${callsignInMd}", expected "${inputs.callsign}"`,
    evidence_strength: 'STRONG',
  });

  // 5. Voice key present
  checks.push({
    name: 'voice_key_present',
    result: agentMdContent.includes(inputs.voice_key) ? 'pass' : 'fail',
    evidence: `scan: voice_key "${inputs.voice_key}" ${agentMdContent.includes(inputs.voice_key) ? 'found' : 'NOT found'} in generated markdown`,
    evidence_strength: 'STRONG',
  });

  const failed = checks.filter(c => c.result === 'fail').length;
  return {
    run_id:       `build-${Date.now()}`,
    status:       failed === 0 ? 'pass' : 'fail',
    oqe_version:  OQE_VERSION,
    persona_key:  inputs.key,
    checks,
    errors:       checks.filter(c => c.result === 'fail').map(c => c.name),
    warnings:     inputs._voice_is_custom ? [`voice_key "${inputs.voice_key}" is not a known Kokoro built-in — ensure DISPATCH_DM_VOICE_PT or equivalent env var is set`] : [],
    duration_ms:  0,
  };
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function writeAuditLog(entry) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  let log = { runs: [] };
  if (fs.existsSync(AUDIT_LOG)) {
    try { log = JSON.parse(fs.readFileSync(AUDIT_LOG, 'utf8')); } catch (_) {}
    if (!Array.isArray(log.runs)) log.runs = [];
  }
  log.runs.push(entry);
  const tmp = `${AUDIT_LOG}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(log, null, 2));
  fs.renameSync(tmp, AUDIT_LOG);
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

function hashFile(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (_) { return null; }
}

async function runPipeline(rawInputs, opts = {}) {
  const { dryRun = false, force = false, noJobs = false } = opts;
  const startMs = Date.now();
  const run = { started_at: new Date().toISOString(), inputs: rawInputs, dry_run: dryRun, steps: [], errors: [] };

  try {
    // 1. Refine
    const inputs = refineInputs(rawInputs);
    const validationErrors = validateInputs(inputs);
    if (validationErrors.length) {
      run.errors = validationErrors;
      run.status = 'fail';
      writeAuditLog({ ...run, duration_ms: Date.now() - startMs });
      return { ok: false, errors: validationErrors };
    }
    run.steps.push({ step: 'refine', ok: true });

    // 2. Conflict check
    const conflicts = checkConflicts(inputs, force);
    if (conflicts.length) {
      run.errors = conflicts.map(c => c.message);
      run.status = 'fail';
      writeAuditLog({ ...run, duration_ms: Date.now() - startMs });
      return { ok: false, conflicts };
    }
    run.steps.push({ step: 'conflict_check', ok: true });

    // 3. Generate markdown
    const agentMdContent = generateAgentMd(inputs);
    const agentMdPath = path.join(DISPATCH_ROOT, inputs.agent_file);
    if (!dryRun) {
      const tmp = `${agentMdPath}.tmp`;
      fs.mkdirSync(path.dirname(agentMdPath), { recursive: true });
      fs.writeFileSync(tmp, agentMdContent);
      fs.renameSync(tmp, agentMdPath);
    }
    run.steps.push({ step: 'generate_markdown', ok: true, path: inputs.agent_file });

    // 4. Validate markdown
    const report = validateArtifacts(inputs, agentMdContent);
    report.duration_ms = Date.now() - startMs;
    if (report.status === 'fail' && !dryRun) {
      // rollback markdown
      try { fs.unlinkSync(agentMdPath); } catch (_) {}
      run.errors = report.errors;
      run.status = 'fail';
      run.validation_report = report;
      writeAuditLog({ ...run, duration_ms: Date.now() - startMs });
      return { ok: false, validation_report: report };
    }
    run.steps.push({ step: 'validate_markdown', ok: report.status === 'pass' });

    // 5. Registry update
    const registryResult = updateRegistry(inputs, dryRun);
    run.steps.push({ step: 'update_registry', ok: true, ...registryResult });

    // 6. Voice maps
    const voiceResults = updateVoiceMaps(inputs, dryRun);
    run.steps.push({ step: 'update_voice_maps', ok: true, results: voiceResults });

    // 7. Starter jobs
    let jobsResult = null;
    if (!noJobs) {
      const jobs = generateStarterJobs(inputs);
      jobsResult = writeStarterJobs(jobs, dryRun);
      run.steps.push({ step: 'generate_starter_jobs', ok: true, ...jobsResult });
    }

    // 8. Artifact hashes
    const artifacts = {
      agent_md:     agentMdPath,
      personas_json: PERSONAS_PATH,
      set_voice_py: SET_VOICE_PY,
      gen_mp3_py:   GEN_MP3_PY,
    };
    const hashes = dryRun ? {} : Object.fromEntries(Object.entries(artifacts).map(([k,p]) => [k, hashFile(p)]));

    run.status = 'pass';
    run.outputs = { ...artifacts, hashes };
    run.validation_report = report;
    writeAuditLog({ ...run, duration_ms: Date.now() - startMs });

    return {
      ok: true,
      dry_run: dryRun,
      inputs,
      agent_md_path: inputs.agent_file,
      agent_md_content: agentMdContent,
      registry_result: registryResult,
      voice_results: voiceResults,
      jobs_result: jobsResult,
      validation_report: report,
      hashes,
      warnings: report.warnings,
    };

  } catch (err) {
    run.status = 'fail';
    run.errors.push(err.message);
    writeAuditLog({ ...run, duration_ms: Date.now() - startMs });
    return { ok: false, error: err.message };
  }
}

module.exports = { runPipeline, validateInputs, refineInputs, checkConflicts, FIELDS, KNOWN_VOICES, OQE_VERSION };
