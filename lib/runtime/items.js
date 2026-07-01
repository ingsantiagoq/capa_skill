'use strict';

const { open, now } = require('./db');
const { nextState } = require('./states');

function active(db) {
  return db.prepare(`
    SELECT * FROM capa_items
    WHERE status IN ('in_progress', 'blocked')
    ORDER BY updated_at DESC
    LIMIT 1
  `).get();
}

function create({ root, title, type = 'task', priority = 3 }) {
  const db = open(root);
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE capa_items SET status='ready', updated_at=? WHERE status='in_progress'`).run(ts);
    const info = db.prepare(`
      INSERT INTO capa_items (title, type, status, priority, current_state, next_state, created_at, updated_at)
      VALUES (?, ?, 'in_progress', ?, 'NEW', 'DISCOVERY', ?, ?)
    `).run(title, type, Number(priority) || 3, ts, ts);
    db.prepare(`
      INSERT INTO capa_progress (item_id, state, status, summary, created_at)
      VALUES (?, 'NEW', 'ok', 'PBI created', ?)
    `).run(info.lastInsertRowid, ts);
    return info.lastInsertRowid;
  });
  return tx();
}

function moveNext({ root }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  if (item.status === 'blocked') return { ok: false, item, message: 'PBI is blocked' };
  if (!item.next_state) return { ok: false, item, message: 'No next state' };
  const ts = now();
  const state = item.next_state;
  const following = nextState(state);
  db.prepare(`UPDATE capa_items SET current_state=?, next_state=?, updated_at=? WHERE id=?`).run(state, following, ts, item.id);
  db.prepare(`
    INSERT INTO capa_progress (item_id, state, status, summary, started_at, created_at)
    VALUES (?, ?, 'started', 'one-step transition', ?, ?)
  `).run(item.id, state, ts, ts);
  return { ok: true, item: { ...item, current_state: state, next_state: following }, state, following };
}

function complete({ root, status = 'ok', summary = 'transition completed' }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const ts = now();
  const itemStatus = item.current_state === 'DONE' && status === 'ok' ? 'done' : item.status;
  db.prepare(`
    INSERT INTO capa_progress (item_id, state, status, summary, finished_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(item.id, item.current_state, status, summary, ts, ts);
  db.prepare(`UPDATE capa_items SET status=?, updated_at=?, completed_at=CASE WHEN ?='done' THEN ? ELSE completed_at END WHERE id=?`)
    .run(itemStatus, ts, itemStatus, ts, item.id);
  return { ok: true, item, status };
}

function list({ root }) {
  const db = open(root);
  return db.prepare(`
    SELECT id, title, type, status, priority, current_state, next_state, updated_at
    FROM capa_items
    ORDER BY priority ASC, updated_at DESC
  `).all();
}

function setBlocked({ root, reason = 'Blocked' }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };
  const ts = now();
  db.prepare(`UPDATE capa_items SET status='blocked', updated_at=? WHERE id=?`).run(ts, item.id);
  db.prepare(`INSERT INTO capa_progress (item_id, state, status, summary, created_at) VALUES (?, ?, 'blocked', ?, ?)`).run(item.id, item.current_state, reason, ts);
  return { ok: true, item, reason };
}

module.exports = { active, create, moveNext, complete, list, setBlocked };
