'use strict';

const { open, now } = require('./db');
const { active } = require('./items');

function add({ root, title, description = null, belongs = true, action = 'record' }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const ts = now();
  const info = db.prepare('INSERT INTO capa_findings (item_id, title, description, belongs_to_current_item, action, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(item.id, title, description, belongs ? 1 : 0, action, ts);
  return { ok: true, item, findingId: info.lastInsertRowid, title, belongs, action };
}

function list({ root }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const rows = db.prepare('SELECT id, title, description, belongs_to_current_item, action, created_at FROM capa_findings WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(item.id);
  return { ok: true, item, rows };
}

module.exports = { add, list };
