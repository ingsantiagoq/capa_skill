'use strict';

const path = require('path');
const { open } = require('./db');
const { active } = require('./items');
const { blockers: closeBlockers } = require('./closure');

const ACTIONS_REQUIRING_IMPLEMENT = new Set(['edit', 'write', 'delete', 'modify']);
const AUTOFIX_BLOCKED_STATES = new Set(['BUILD', 'TEST', 'CODE_REVIEW']);

function normalizePath(filePath) {
  if (!filePath) return null;
  return String(filePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

function isAllowedByScope(root, db, itemId, filePath) {
  const rows = db.prepare('SELECT allowed_path FROM capa_scope WHERE item_id = ?').all(itemId);
  if (!rows.length) return { ok: false, reason: 'Missing approved scope before editing' };

  const normalized = normalizePath(filePath);
  if (!normalized) return { ok: false, reason: 'Missing --file for scoped action' };

  // Resolve both sides to absolute against the repo root so a relative scope
  // entry (e.g. `scope add lib/dashboard.js`) matches the absolute --file the
  // PreToolUse hook sends, and vice versa.
  const absTarget = path.resolve(root, normalized);

  const allowed = rows.some((r) => {
    const allowedNorm = normalizePath(r.allowed_path);
    if (!allowedNorm) return false;
    const absAllowed = path.resolve(root, allowedNorm);
    return absTarget === absAllowed || absTarget.startsWith(`${absAllowed}${path.sep}`);
  });

  if (!allowed) return { ok: false, reason: `File is outside approved scope: ${filePath}` };
  return { ok: true, reason: 'File is inside approved scope' };
}

function evaluate({ root, action, file = null, autoFix = false }) {
  const db = open(root);
  const item = active(db);

  if (!item) return block('No active PBI');
  if (item.status === 'blocked') return block(`PBI is blocked: #${item.id} ${item.title}`, item);

  if (ACTIONS_REQUIRING_IMPLEMENT.has(action) && item.current_state !== 'IMPLEMENT') {
    return block(`Action ${action} is only allowed in IMPLEMENT. Current state: ${item.current_state}`, item);
  }

  if (ACTIONS_REQUIRING_IMPLEMENT.has(action)) {
    const scope = isAllowedByScope(root, db, item.id, file);
    if (!scope.ok) return block(scope.reason, item);
  }

  if (autoFix && AUTOFIX_BLOCKED_STATES.has(item.current_state)) {
    return block(`Auto-fix is blocked during ${item.current_state}. Register a finding and ask for approval.`, item);
  }

  if (action === 'close' || action === 'done') {
    const reasons = closeBlockers(db, item);
    if (reasons.length) return block(`Cannot close: ${reasons.join('; ')}`, item);
  }

  return allow(item);
}

function allow(item) {
  return { allowed: true, code: 0, item, message: 'CAPA ALLOW' };
}

function block(reason, item = null) {
  return { allowed: false, code: 2, item, message: 'CAPA BLOCK', reason };
}

function print(result) {
  console.log(result.message);
  if (result.item) {
    console.log(`PBI: #${result.item.id} ${result.item.title}`);
    console.log(`Estado actual: ${result.item.current_state}`);
    console.log(`Status: ${result.item.status}`);
  }
  if (!result.allowed) console.log(`Motivo: ${result.reason}`);
}

module.exports = { evaluate, print };