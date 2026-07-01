'use strict';

const { open, now } = require('./db');
const { active } = require('./items');

function add({ root, allowedPath, reason = null }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const ts = now();
  db.prepare('INSERT INTO capa_scope (item_id, allowed_path, reason, created_at) VALUES (?, ?, ?, ?)').run(item.id, allowedPath, reason, ts);
  return { ok: true, item, allowedPath, reason };
}

function list({ root }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const rows = db.prepare('SELECT id, allowed_path, reason, created_at FROM capa_scope WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(item.id);
  return { ok: true, item, rows };
}

module.exports = { add, list };
