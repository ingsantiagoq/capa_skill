'use strict';

function count(db, sql, params) {
  return db.prepare(sql).get(...params).count;
}

function blockers(db, item, status = 'ok') {
  if (!item) return ['No active PBI'];
  if (status !== 'ok') return [];

  const reasons = [];
  const state = item.current_state;

  if (state === 'SCOPE') {
    const scopes = count(db, 'SELECT COUNT(*) AS count FROM capa_scope WHERE item_id = ?', [item.id]);
    if (scopes < 1) reasons.push('SCOPE requires at least one approved path');
  }

  if (state === 'IMPLEMENT') {
    const evidence = count(db, 'SELECT COUNT(*) AS count FROM capa_evidence WHERE item_id = ? AND state = ?', [item.id, 'IMPLEMENT']);
    if (evidence < 1) reasons.push('IMPLEMENT requires implementation evidence');
  }

  if (state === 'TEST') {
    const tests = count(db, "SELECT COUNT(*) AS count FROM capa_tests WHERE item_id = ? AND status = 'ok'", [item.id]);
    if (tests < 1) reasons.push('TEST requires at least one ok test');
  }

  if (state === 'CODE_REVIEW') {
    const reviews = count(db, "SELECT COUNT(*) AS count FROM capa_code_reviews WHERE item_id = ? AND status = 'ok'", [item.id]);
    if (reviews < 1) reasons.push('CODE_REVIEW requires at least one ok review');
  }

  return reasons;
}

module.exports = { blockers };
