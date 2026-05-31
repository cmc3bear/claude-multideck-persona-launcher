import { workflow, node, trigger } from '@n8n/workflow-sdk';

const publishEvent = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Publish Event Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'automation/events',
      responseMode: 'responseNode',
      options: {}
    },
    position: [0, 0]
  },
  output: [{ body: { type: 'job.created', source: 'manual', subject_id: 'JOB-1', payload: { title: 'Example' } } }]
});

const appendEvent = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Append Event',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const fs = require("fs");
const path = require("path");
const ledgerPath = "/workspace/multideck/dispatch-framework/state/automation-events.jsonl";
const root = $input.first().json;
const body = root.body || root;
const type = String(body.type || body.event_type || "automation.event");
const source = String(body.source || "n8n");
const now = new Date().toISOString();
const event = {
  event_id: body.event_id || "EVT-" + Date.now() + "-" + Math.floor(Math.random() * 100000).toString().padStart(5, "0"),
  type,
  source,
  subject_id: body.subject_id || body.job_id || body.id || null,
  status: body.status || "open",
  severity: body.severity || body.priority || "info",
  created_at: body.created_at || now,
  handled_at: body.handled_at || null,
  payload: body.payload || body,
  error: body.error || null
};
fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
fs.appendFileSync(ledgerPath, JSON.stringify(event) + "\\n");
return [{ json: { ok: true, action: "published", event, ledger_path: ledgerPath } }];`
    },
    position: [240, 0]
  },
  output: [{ ok: true, action: 'published', event: { event_id: 'EVT-1', type: 'job.created', status: 'open' } }]
});

const respondPublish = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Publish Result',
    parameters: {
      respondWith: 'firstIncomingItem',
      options: { responseCode: 200 }
    },
    position: [480, 0]
  }
});

const queryEvents = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Query Events Webhook',
    parameters: {
      httpMethod: 'GET',
      path: 'automation/events',
      responseMode: 'responseNode',
      options: {}
    },
    position: [0, 240]
  },
  output: [{ query: { status: 'open', limit: '50' } }]
});

const readEvents = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Read Events',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const fs = require("fs");
const ledgerPath = "/workspace/multideck/dispatch-framework/state/automation-events.jsonl";
const root = $input.first().json;
const q = root.query || {};
const limit = Math.max(1, Math.min(Number(q.limit || 50), 500));
let events = [];
try {
  events = fs.readFileSync(ledgerPath, "utf8").split("\\n").filter(Boolean).map((line) => JSON.parse(line));
} catch (e) {}
if (q.type) events = events.filter((event) => event.type === q.type);
if (q.status) events = events.filter((event) => event.status === q.status);
if (q.source) events = events.filter((event) => event.source === q.source);
if (q.subject_id) events = events.filter((event) => String(event.subject_id || "") === String(q.subject_id));
const byStatus = {};
const byType = {};
for (const event of events) {
  byStatus[event.status || "unknown"] = (byStatus[event.status || "unknown"] || 0) + 1;
  byType[event.type || "unknown"] = (byType[event.type || "unknown"] || 0) + 1;
}
return [{ json: { ok: true, total: events.length, by_status: byStatus, by_type: byType, events: events.slice(-limit) } }];`
    },
    position: [240, 240]
  },
  output: [{ ok: true, total: 1, by_status: { open: 1 }, by_type: { 'job.created': 1 }, events: [] }]
});

const respondQuery = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Events',
    parameters: {
      respondWith: 'firstIncomingItem',
      options: { responseCode: 200 }
    },
    position: [480, 240]
  }
});

const ackEvent = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Acknowledge Event Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'automation/events/ack',
      responseMode: 'responseNode',
      options: {}
    },
    position: [0, 480]
  },
  output: [{ body: { event_id: 'EVT-1', status: 'handled' } }]
});

const markEvent = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Mark Event',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const fs = require("fs");
const ledgerPath = "/workspace/multideck/dispatch-framework/state/automation-events.jsonl";
const root = $input.first().json;
const body = root.body || root;
const eventId = body.event_id;
if (!eventId) return [{ json: { ok: false, error: "event_id required" } }];
let events = [];
try {
  events = fs.readFileSync(ledgerPath, "utf8").split("\\n").filter(Boolean).map((line) => JSON.parse(line));
} catch (e) {}
let updated = null;
const now = new Date().toISOString();
events = events.map((event) => {
  if (event.event_id !== eventId) return event;
  updated = { ...event, status: body.status || "handled", handled_at: body.handled_at || now, result: body.result || event.result || null };
  return updated;
});
if (!updated) return [{ json: { ok: false, error: "event not found", event_id: eventId } }];
fs.writeFileSync(ledgerPath, events.map((event) => JSON.stringify(event)).join("\\n") + "\\n");
return [{ json: { ok: true, action: "marked", event: updated } }];`
    },
    position: [240, 480]
  },
  output: [{ ok: true, action: 'marked', event: { event_id: 'EVT-1', status: 'handled' } }]
});

const respondAck = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Ack Result',
    parameters: {
      respondWith: 'firstIncomingItem',
      options: { responseCode: 200 }
    },
    position: [480, 480]
  }
});

export default workflow('automation-event-ledger-router', 'Automation Event Ledger & Router')
  .add(publishEvent)
  .to(appendEvent)
  .to(respondPublish)
  .add(queryEvents)
  .to(readEvents)
  .to(respondQuery)
  .add(ackEvent)
  .to(markEvent)
  .to(respondAck);
