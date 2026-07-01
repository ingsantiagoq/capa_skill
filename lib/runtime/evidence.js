'use strict';

const { open, now } = require('./db');
const { active } = require('./items');

const VALID_CLASSIFICATIONS = new Set(['VERIFIED', 'PARTIAL', 'ASSUMPTION', 'UNKNOWN']);

function normalizeClassification(value) {
  const classification = String(value || 'UNKNOWN').toUpperCase();
  return VALID_CLASSIFICATIONS.has(classification) ? classification : 'UNKNOWN';
}

function add({ root, claim, classification = 'UNKNOWN', sourceType = null, filePath = null, symbol = null, command = null, resultSummary = null, confidence = null }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };

  const ts = now();
  const normalized = normalizeClassification(classification);
  const info = db.prepare(`INSERT INTO capa_evidence (item_id, state, claim, classification, source_type, file_path, symbol, command, result_summary, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    item.id,
    item.current_state,
    claim,
    normalized,
    sourceType,
    filePath,
    symbol,
    command,
    resultSummary,
    confidence === null || confidence === undefined ? null : Number(confidence),
    ts,
  );

  return { ok: true, item, evidenceId: info.lastInsertRowid, claim, classification: normalized };
}

function list({ root }) {
  const db = open(root);
  const item = active(db);
  if (!item) return { ok: false, message: 'No active PBI' };

  const rows = db.prepare(`SELECT id, state, claim, classification, source_type, file_path, symbol, command, result_summary, confidence, created_at FROM capa_evidence WHERE item_id = ? ORDER BY created_at ASC, id ASC`).all(item.id);
  return { ok: true, item, rows };
}

module.exports = { add, list, normalizeClassification };
