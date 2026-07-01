'use strict';

const { open, now } = require('./db');
const { active } = require('./items');

function add({ root, testType = null, command = null, status = 'unknown', summary = null }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const ts = now();
  const info = db.prepare('INSERT INTO capa_tests (item_id, test_type, command, status, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(item.id, testType, command, status, summary, ts);
  if (String(status).toLowerCase() === 'ok') {
    db.prepare('INSERT INTO capa_progress (item_id, state, status, summary, finished_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(item.id, 'TEST', 'ok', summary || command || 'Test OK', ts, ts);
  }
  return { ok: true, item, testId: info.lastInsertRowid, status };
}

function list({ root }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const rows = db.prepare('SELECT id, test_type, command, status, summary, created_at FROM capa_tests WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(item.id);
  return { ok: true, item, rows };
}

module.exports = { add, list };
