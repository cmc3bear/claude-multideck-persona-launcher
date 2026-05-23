#!/usr/bin/env node
'use strict';
/**
 * persona-builder — interactive CLI for creating MultiDeck personas
 *
 * Usage:
 *   node scripts/persona-builder.js
 *   node scripts/persona-builder.js --dry-run
 *   node scripts/persona-builder.js --force
 *   node scripts/persona-builder.js --no-jobs
 *   node scripts/persona-builder.js --input answers.json
 *   node scripts/persona-builder.js --update <key>
 */
const readline = require('readline');
const fs       = require('fs');
const path     = require('path');
const { runPipeline, validateInputs, refineInputs, checkConflicts, FIELDS, KNOWN_VOICES } = require('./lib/builder-pipeline');

// ── CLI arg parsing ───────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const flags  = {
  dryRun:  args.includes('--dry-run'),
  force:   args.includes('--force'),
  noJobs:  args.includes('--no-jobs'),
  help:    args.includes('--help') || args.includes('-h'),
};
const inputIdx  = args.indexOf('--input');
const updateIdx = args.indexOf('--update');
const inputFile = inputIdx  >= 0 ? args[inputIdx  + 1] : null;
const updateKey = updateIdx >= 0 ? args[updateIdx + 1] : null;

if (flags.help) {
  console.log(`
persona-builder — interactive MultiDeck persona creator

  node scripts/persona-builder.js [options]

Options:
  --dry-run         Execute full pipeline but write no files
  --force           Skip conflict/duplicate detection
  --no-jobs         Skip starter job generation
  --input <file>    Read answers from JSON file (non-interactive)
  --update <key>    Update an existing persona (shows diff, requires confirmation)
  --help            Show this help
`);
  process.exit(0);
}

// ── Cleanup tracking ──────────────────────────────────────────────────────────

const tmpFiles = new Set();
process.on('exit', () => {
  for (const f of tmpFiles) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  }
});
process.on('SIGINT', () => {
  console.log('\n\n[persona-builder] Cancelled. Cleaning up temp files...');
  for (const f of tmpFiles) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  }
  process.exit(130);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const C = {
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  amber:  s => `\x1b[33m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

function banner() {
  console.log(C.cyan('\n╔══════════════════════════════════════════╗'));
  console.log(C.cyan('║  MULTIDECK  //  PERSONA BUILDER  v1.0   ║'));
  console.log(C.cyan('╚══════════════════════════════════════════╝\n'));
  if (flags.dryRun) console.log(C.amber('  [ DRY RUN — no files will be written ]\n'));
  if (flags.force)  console.log(C.amber('  [ --force — conflict checks bypassed ]\n'));
}

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function ask(rl, field, defaultVal) {
  const hint = defaultVal ? C.dim(` [${defaultVal}]`) : '';
  const known = field.key === 'voice_key'
    ? C.dim(`\n  Known voices: ${[...KNOWN_VOICES].sort().join(', ')}`) : '';
  while (true) {
    const raw = await prompt(rl, `\n${C.amber('?')} ${C.bold(field.label)}${hint}${known}\n  ${C.cyan('>')} `);
    const val = raw.trim() || defaultVal || '';
    if (!val) { console.log(C.red('  Required.')); continue; }
    const err = field.validate(val);
    if (err) { console.log(C.red(`  ${err}`)); continue; }
    return val;
  }
}

// ── Interview ─────────────────────────────────────────────────────────────────

async function interview(rl) {
  const answers = {};

  console.log(C.dim('  Answer each question. Press Enter to accept [defaults].\n'));

  for (const field of FIELDS) {
    if (field.key === 'key') continue; // derived from callsign
    let defaultVal;
    if (field.key === 'tab_color' && answers.color_hex) {
      // auto-darken: halve each channel
      const hex = answers.color_hex.slice(1);
      const r = Math.floor(parseInt(hex.slice(0,2),16) * 0.4).toString(16).padStart(2,'0');
      const g = Math.floor(parseInt(hex.slice(2,4),16) * 0.4).toString(16).padStart(2,'0');
      const b = Math.floor(parseInt(hex.slice(4,6),16) * 0.4).toString(16).padStart(2,'0');
      defaultVal = `#${r}${g}${b}`;
    }
    answers[field.key] = await ask(rl, field, defaultVal);
  }

  return answers;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  banner();

  let rawInputs;

  // Non-interactive mode
  if (inputFile) {
    console.log(C.dim(`  Loading answers from ${inputFile}...`));
    try {
      rawInputs = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    } catch (e) {
      console.error(C.red(`  Error reading input file: ${e.message}`));
      process.exit(1);
    }
  } else {
    // Interactive mode
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      rawInputs = await interview(rl);
    } finally {
      rl.close();
    }
  }

  // Derive key from callsign
  const refined = refineInputs(rawInputs);
  refined.key = refined.key || refined.callsign.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  // Validate
  const errors = validateInputs(refined);
  if (errors.length) {
    console.error(C.red('\n  Validation errors:'));
    errors.forEach(e => console.error(C.red(`    • ${e}`)));
    process.exit(1);
  }

  // Show summary and confirm
  console.log(C.cyan('\n  ── Persona Summary ─────────────────────'));
  console.log(`  Key:         ${C.bold(refined.key)}`);
  console.log(`  Callsign:    ${refined.callsign}`);
  console.log(`  Role:        ${refined.role}`);
  console.log(`  Scope:       ${refined.scope}`);
  console.log(`  Voice:       ${refined.voice_key}${refined._voice_is_custom ? C.amber(' (CUSTOM — needs .pt tensor)') : ''}`);
  console.log(`  Color:       ${refined.color_hex}  Tab: ${refined.tab_color}`);
  console.log(`  CWD:         ${refined.cwd}`);
  console.log(`  Agent file:  ${refined.agent_file}`);
  console.log(`  Description: ${refined.description}`);
  if (!flags.noJobs) console.log(`  Jobs:        3 starter jobs will be created`);
  if (flags.dryRun)  console.log(C.amber('\n  DRY RUN — no files will be written.'));

  if (!inputFile) {
    // Confirm
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = await prompt(rl2, C.amber('\n  Proceed? [y/N] '));
    rl2.close();
    if (confirm.trim().toLowerCase() !== 'y') {
      console.log(C.dim('  Aborted.'));
      process.exit(0);
    }
  }

  // Conflict check (pre-run, to give user a clean message)
  if (!flags.force) {
    const conflicts = checkConflicts(refined, false);
    if (conflicts.length) {
      console.error(C.red('\n  Conflicts detected:'));
      conflicts.forEach(c => console.error(C.red(`    • ${c.message}`)));
      console.error(C.dim('  Use --force to override, or --update <key> to update an existing persona.'));
      process.exit(1);
    }
  }

  // Run pipeline
  console.log(C.cyan('\n  ── Building ─────────────────────────────'));
  const result = await runPipeline(refined, {
    dryRun: flags.dryRun,
    force:  flags.force,
    noJobs: flags.noJobs,
  });

  if (!result.ok) {
    console.error(C.red('\n  Build failed:'));
    if (result.errors)   result.errors.forEach(e   => console.error(C.red(`    • ${e}`)));
    if (result.conflicts) result.conflicts.forEach(c => console.error(C.red(`    • ${c.message}`)));
    if (result.error)    console.error(C.red(`    ${result.error}`));
    process.exit(1);
  }

  // Results
  const r = result;
  console.log(C.green('\n  ── Build Complete ───────────────────────'));
  if (!flags.dryRun) {
    console.log(C.green(`  ✓ Agent file:   ${r.agent_md_path}`));
    console.log(C.green(`  ✓ Registry:     personas/personas.json (backup: ${r.registry_result?.backed_up})`));
    r.voice_results?.forEach(v => {
      if (v.skipped) console.log(C.dim(`  ~ Voice map:    ${path.basename(v.file)} — ${v.reason}`));
      else           console.log(C.green(`  ✓ Voice map:    ${path.basename(v.file)}`));
    });
    if (r.jobs_result) console.log(C.green(`  ✓ Starter jobs: ${r.jobs_result.count} jobs added to job board`));
  } else {
    console.log(C.amber('  ~ DRY RUN: no files written. Pipeline validated successfully.'));
  }

  // Validation report
  const vr = r.validation_report;
  console.log(`\n  ── Validation (${vr.status.toUpperCase()}) ${'─'.repeat(30 - vr.status.length)}`);
  vr.checks.forEach(c => {
    const icon = c.result === 'pass' ? C.green('✓') : C.red('✗');
    console.log(`  ${icon} ${c.name}`);
    if (c.result === 'fail') console.log(C.red(`      ${c.evidence}`));
  });
  if (vr.warnings.length) {
    console.log(C.amber('\n  Warnings:'));
    vr.warnings.forEach(w => console.log(C.amber(`    ⚠ ${w}`)));
  }

  console.log(C.dim(`\n  Audit log: state/build-audit.json\n`));
  process.exit(vr.status === 'pass' ? 0 : 1);
}

main().catch(e => {
  console.error(C.red(`\n  Fatal: ${e.message}`));
  process.exit(1);
});
