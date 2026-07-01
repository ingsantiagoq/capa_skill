'use strict';

const { open, now } = require('./db');
const { active } = require('./items');

function add({ root, status = 'ok', diffSummary = null, findings = null, riskLevel = null }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const ts = now();
  const info = db.prepare('INSERT INTO capa_code_reviews (item_id, status, diff_summary, findings, risk_level, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(item.id, status, diffSummary, findings, riskLevel, ts);
  if (String(status).toLowerCase() === 'ok') {
    db.prepare('INSERT INTO capa_progress (item_id, state, status, summary, finished_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(item.id, 'CODE_REVIEW', 'ok', diffSummary || 'Code review OK', ts, ts);
  }
  return { ok: true, item, reviewId: info.lastInsertRowid, status };
}

function list({ root }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const rows = db.prepare('SELECT id, status, diff_summary, findings, risk_level, created_at FROM capa_code_reviews WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(item.id);
  return { ok: true, item, rows };
}

module.exports = { add, list };
