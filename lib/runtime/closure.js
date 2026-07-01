'use strict';

const { open, now } = require('./db');
const { active } = require('./items');

function count(db, sql, params) {
  return db.prepare(sql).get(...params).count;
}

function blockers(db, item) {
  const result = [];
  if (!item) return ['No active PBI'];
  if (item.status === 'blocked') result.push('PBI is blocked');

  const evidenceCount = count(db, 'SELECT COUNT(*) AS count FROM capa_evidence WHERE item_id = ?', [item.id]);
  if (evidenceCount < 1) result.push('Missing evidence');

  const testOk = count(db, 'SELECT COUNT(*) AS count FROM capa_progress WHERE item_id = ? AND state = ? AND status = ?', [item.id, 'TEST', 'ok']);
  if (testOk < 1) result.push('Missing TEST ok');

  const reviewOk = count(db, 'SELECT COUNT(*) AS count FROM capa_progress WHERE item_id = ? AND state = ? AND status = ?', [item.id, 'CODE_REVIEW', 'ok']);
  if (reviewOk < 1) result.push('Missing CODE_REVIEW ok');

  const openFindings = count(db, "SELECT COUNT(*) AS count FROM capa_findings WHERE item_id = ? AND belongs_to_current_item = 0 AND action IN ('record', 'none', '')", [item.id]);
  if (openFindings > 0) result.push('There are outside findings without decision');

  return result;
}

function closePbi({ root, summary }) {
  const db = open(root);
  const item = active(db);
  const blockedBy = blockers(db, item);
  if (blockedBy.length) return { ok: false, item, blockers: blockedBy };

  const ts = now();
  const evidenceSummary = db.prepare("SELECT classification || ': ' || claim AS value FROM capa_evidence WHERE item_id = ? ORDER BY id ASC").all(item.id).map((r) => r.value).join('\n');
  const testSummary = db.prepare("SELECT status || ': ' || COALESCE(command, summary, test_type, 'test') AS value FROM capa_tests WHERE item_id = ? ORDER BY id ASC").all(item.id).map((r) => r.value).join('\n');
  const risks = db.prepare('SELECT title FROM capa_findings WHERE item_id = ? AND belongs_to_current_item = 0 ORDER BY id ASC').all(item.id).map((r) => r.title).join('\n');

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO capa_closures (item_id, closure_type, summary, evidence_summary, test_summary, risks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(item.id, 'pbi', summary || `PBI closed: ${item.title}`, evidenceSummary, testSummary, risks, ts);
    db.prepare('INSERT INTO capa_progress (item_id, state, status, summary, finished_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(item.id, 'DONE', 'ok', summary || 'PBI closed', ts, ts);
    db.prepare("UPDATE capa_items SET status = 'done', current_state = 'DONE', next_state = NULL, completed_at = ?, updated_at = ? WHERE id = ?")
      .run(ts, ts, item.id);
  });

  tx();
  return { ok: true, item, summary: summary || `PBI closed: ${item.title}` };
}

module.exports = { closePbi, blockers };
