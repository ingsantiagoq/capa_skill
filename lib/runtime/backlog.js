'use strict';

const { open, now } = require('./db');
const runtime = require('./items');

function add({ root, title, description = null, type = 'task', priority = 3 }) {
  const db = open(root);
  const ts = now();
  const info = db.prepare(`
    INSERT INTO capa_items (title, description, type, status, priority, current_state, next_state, created_at, updated_at)
    VALUES (?, ?, ?, 'ready', ?, 'NEW', 'DISCOVERY', ?, ?)
  `).run(title, description, type, Number(priority) || 3, ts, ts);
  db.prepare(`
    INSERT INTO capa_progress (item_id, state, status, summary, created_at)
    VALUES (?, 'NEW', 'ready', 'PBI added to backlog', ?)
  `).run(info.lastInsertRowid, ts);
  return show({ root, id: info.lastInsertRowid }).item;
}

function list({ root, status = null }) {
  const db = open(root);
  if (status) {
    return db.prepare(`
      SELECT id, title, type, status, priority, current_state, next_state, updated_at
      FROM capa_items
      WHERE status = ?
      ORDER BY priority ASC, updated_at DESC
    `).all(status);
  }
  return runtime.list({ root });
}

function show({ root, id }) {
  const db = open(root);
  const item = db.prepare(`SELECT * FROM capa_items WHERE id = ?`).get(Number(id));
  if (!item) return { ok: false, message: `PBI not found: ${id}` };
  const tasks = db.prepare(`
    SELECT * FROM capa_tasks
    WHERE item_id = ?
    ORDER BY position ASC, id ASC
  `).all(item.id);
  return { ok: true, item, tasks };
}

function activate({ root, id }) {
  const db = open(root);
  const item = db.prepare(`SELECT * FROM capa_items WHERE id = ?`).get(Number(id));
  if (!item) return { ok: false, message: `PBI not found: ${id}` };
  if (item.status === 'done' || item.status === 'cancelled') {
    return { ok: false, item, message: `Cannot activate PBI with status ${item.status}` };
  }
  const ts = now();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE capa_items SET status='ready', updated_at=? WHERE status='in_progress' AND id <> ?`).run(ts, item.id);
    db.prepare(`UPDATE capa_items SET status='in_progress', updated_at=? WHERE id=?`).run(ts, item.id);
    db.prepare(`
      INSERT INTO capa_progress (item_id, state, status, summary, created_at)
      VALUES (?, ?, 'started', 'PBI activated from backlog', ?)
    `).run(item.id, item.current_state || 'NEW', ts);
  });
  tx();
  return show({ root, id: item.id });
}

function cancel({ root, id, reason = 'Cancelled from backlog' }) {
  const db = open(root);
  const item = db.prepare(`SELECT * FROM capa_items WHERE id = ?`).get(Number(id));
  if (!item) return { ok: false, message: `PBI not found: ${id}` };
  const ts = now();
  db.prepare(`UPDATE capa_items SET status='cancelled', updated_at=?, completed_at=? WHERE id=?`).run(ts, ts, item.id);
  db.prepare(`
    INSERT INTO capa_progress (item_id, state, status, summary, created_at)
    VALUES (?, ?, 'cancelled', ?, ?)
  `).run(item.id, item.current_state || 'NEW', reason, ts);
  return show({ root, id: item.id });
}

function nextPosition(db, itemId) {
  const row = db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM capa_tasks WHERE item_id = ?`).get(itemId);
  return row.next;
}

function addTask({ root, itemId, title, description = null, acceptance = null, ownerModel = 'sonnet', position = null }) {
  const db = open(root);
  const item = db.prepare(`SELECT * FROM capa_items WHERE id = ?`).get(Number(itemId));
  if (!item) return { ok: false, message: `PBI not found: ${itemId}` };
  const ts = now();
  const pos = position ? Number(position) : nextPosition(db, item.id);
  const info = db.prepare(`
    INSERT INTO capa_tasks (item_id, title, description, acceptance, status, owner_model, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?)
  `).run(item.id, title, description, acceptance, ownerModel || 'sonnet', pos, ts, ts);
  return { ok: true, item, task: db.prepare(`SELECT * FROM capa_tasks WHERE id = ?`).get(info.lastInsertRowid) };
}

function listTasks({ root, itemId }) {
  const db = open(root);
  const item = db.prepare(`SELECT * FROM capa_items WHERE id = ?`).get(Number(itemId));
  if (!item) return { ok: false, message: `PBI not found: ${itemId}` };
  const tasks = db.prepare(`SELECT * FROM capa_tasks WHERE item_id = ? ORDER BY position ASC, id ASC`).all(item.id);
  return { ok: true, item, tasks };
}

function doneTask({ root, taskId, summary = 'Task done' }) {
  const db = open(root);
  const task = db.prepare(`SELECT * FROM capa_tasks WHERE id = ?`).get(Number(taskId));
  if (!task) return { ok: false, message: `Task not found: ${taskId}` };
  const ts = now();
  db.prepare(`UPDATE capa_tasks SET status='done', updated_at=?, completed_at=? WHERE id=?`).run(ts, ts, task.id);
  db.prepare(`
    INSERT INTO capa_progress (item_id, state, status, summary, created_at)
    VALUES (?, 'TASK', 'ok', ?, ?)
  `).run(task.item_id, summary, ts);
  return { ok: true, task: db.prepare(`SELECT * FROM capa_tasks WHERE id = ?`).get(task.id) };
}

function decompose({ root, itemId, tasks }) {
  const created = [];
  for (const task of tasks) {
    const out = addTask({
      root,
      itemId,
      title: task.title,
      description: task.description || null,
      acceptance: task.acceptance || null,
      ownerModel: task.owner_model || task.ownerModel || 'sonnet',
      position: task.position || null,
    });
    if (!out.ok) return out;
    created.push(out.task);
  }
  return { ok: true, tasks: created };
}

module.exports = { add, list, show, activate, cancel, addTask, listTasks, doneTask, decompose };
