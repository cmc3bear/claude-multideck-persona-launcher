#!/usr/bin/env node
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = Number(process.env.DISPATCH_COORD_PORT) || 3047;
const STATE_FILE = path.join(__dirname, 'coord-state.json');
const HTML_FILE  = path.join(__dirname, 'dashboard.html');

// ── Seed state ─────────────────────────────────────────────────────────────
const INITIAL = {
  updated: new Date().toISOString(),
  agents: {
    engineer: {
      callsign: 'Engineer',
      job:      'WS-FIX-0003',
      color:    '#00ff88',
      todos: [
        { id: 'verifier_fix', label: 'Fix verify-wan-models.py shard false-positive',     done: false },
        { id: 'oom_fix',      label: 'Fix T2V OOM — disable_mmap=True, shard 7',          done: false },
        { id: 'segfault_fix', label: 'Fix T2V segfault — disable_mmap=False, shard 8',    done: false },
        { id: 'device_map',   label: 'Add --device-map flag with tradeoff docs',           done: false },
        { id: 'smoke_test',   label: 'Smoke test: 33-frame 832×480 exits 0',               done: false },
        { id: 'full_res',     label: 'Full-res run: 81-frame 1280×720 exits 0',            done: false },
        { id: 'smoke_mp4',    label: 'Drop smoke-alley.mp4 to output/raw',                 done: false },
      ]
    },
    producer: {
      callsign: 'Producer',
      job:      'cyberdeck-spot-2026-05-14',
      color:    '#ff6b35',
      todos: [
        { id: 'vo_render',  label: 'VO render complete',                                   done: false },
        { id: 'sfx_render', label: 'SFX render complete',                                  done: false },
        { id: 'music_bed',  label: 'Music bed locked',                                     done: false },
        { id: 'shot_list',  label: 'Shot list finalized',                                  done: false },
        { id: 'await_t2v',  label: 'Await T2V clearance from Engineer',                    done: false, blockedOn: 'engineer:smoke_mp4' },
        { id: 'ai_beats',   label: 'Generate 4 AI beats via T2V',                          done: false, blockedOn: 'engineer:smoke_mp4' },
        { id: 'rough_cut',  label: 'Assemble rough cut',                                   done: false },
      ]
    }
  },
  log: []
};

// ── Load or initialize state ───────────────────────────────────────────────
let state;
try   { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
catch { state = JSON.parse(JSON.stringify(INITIAL)); }

function save() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── SSE broadcast ──────────────────────────────────────────────────────────
const clients = new Set();

function broadcast() {
  const frame = `data: ${JSON.stringify(state)}\n\n`;
  for (const r of clients) {
    try { r.write(frame); } catch { clients.delete(r); }
  }
}

// ── Auto-unblock: clear blockedOn when the blocker is done ────────────────
function resolveBlocks() {
  for (const agent of Object.values(state.agents)) {
    for (const todo of agent.todos) {
      if (todo.blockedOn) {
        const [bAgent, bId] = todo.blockedOn.split(':');
        const blocker = state.agents[bAgent]?.todos.find(t => t.id === bId);
        if (blocker?.done) todo.blockedOn = null;
      }
    }
  }
}

// ── Body reader ────────────────────────────────────────────────────────────
function readBody(req, cb) {
  let body = '';
  req.on('data', d => (body += d));
  req.on('end',  () => cb(body));
}

// ── HTTP server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const p   = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  // Dashboard HTML
  if (req.method === 'GET' && p === '/') {
    const html = fs.readFileSync(HTML_FILE);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  // JSON state snapshot
  if (req.method === 'GET' && p === '/state.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(state, null, 2));
  }

  // SSE stream
  if (req.method === 'GET' && p === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Mark todo complete
  if (req.method === 'POST' && p === '/todo/complete') {
    return readBody(req, body => {
      let d;
      try { d = JSON.parse(body); } catch { res.writeHead(400); return res.end('bad json'); }

      const ag = state.agents[d.agent];
      if (!ag) { res.writeHead(404); return res.end('unknown agent'); }

      const todo = ag.todos.find(t => t.id === d.id);
      if (!todo) { res.writeHead(404); return res.end('unknown todo'); }

      todo.done      = true;
      state.updated  = new Date().toISOString();
      state.log.unshift({ ts: state.updated, agent: ag.callsign, todo: todo.label, message: d.message || '' });
      if (state.log.length > 50) state.log.length = 50;

      resolveBlocks();
      save();
      broadcast();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, todo: todo.label }));
    });
  }

  // Add a new todo dynamically
  if (req.method === 'POST' && p === '/todo/add') {
    return readBody(req, body => {
      let d;
      try { d = JSON.parse(body); } catch { res.writeHead(400); return res.end('bad json'); }

      const ag = state.agents[d.agent];
      if (!ag) { res.writeHead(404); return res.end('unknown agent'); }

      ag.todos.push({ id: d.id, label: d.label, done: false, ...(d.blockedOn ? { blockedOn: d.blockedOn } : {}) });
      state.updated = new Date().toISOString();
      save();
      broadcast();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  // Reset to seed state (debugging)
  if (req.method === 'POST' && p === '/reset') {
    state = JSON.parse(JSON.stringify(INITIAL));
    save();
    broadcast();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`Dispatch Coordination  →  http://localhost:${PORT}`);
  console.log('');
  console.log('  POST /todo/complete  {"agent":"engineer","id":"smoke_test","message":"optional"}');
  console.log('  POST /todo/add       {"agent":"producer","id":"my_id","label":"New task"}');
  console.log('  POST /reset          Wipe state back to seed');
  console.log('  GET  /events         SSE stream');
  console.log('  GET  /state.json     Snapshot');
});
