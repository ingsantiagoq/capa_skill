'use strict';

const { open, now } = require('./db');

function linesFor(rows, formatter, emptyText) {
  if (!rows.length) return emptyText;
  return rows.map(formatter).join('\n');
}

function closeSprint({ root, summary = null }) {
  const db = open(root);
  const ts = now();

  const closedItems = db.prepare(`
    SELECT id, title, priority, completed_at
    FROM capa_items
    WHERE status = 'done'
    ORDER BY completed_at ASC, id ASC
  `).all();

  const pendingItems = db.prepare(`
    SELECT id, title, status, priority, current_state, next_state
    FROM capa_items
    WHERE status <> 'done'
    ORDER BY priority ASC, updated_at DESC, id ASC
  `).all();

  const evidence = db.prepare(`
    SELECT e.classification, e.claim, e.source_type, i.id AS item_id, i.title AS item_title
    FROM capa_evidence e
    JOIN capa_items i ON i.id = e.item_id
    ORDER BY e.created_at ASC, e.id ASC
  `).all();

  const tests = db.prepare(`
    SELECT t.status, t.test_type, t.command, t.summary, i.id AS item_id, i.title AS item_title
    FROM capa_tests t
    JOIN capa_items i ON i.id = t.item_id
    ORDER BY t.created_at ASC, t.id ASC
  `).all();

  const reviews = db.prepare(`
    SELECT r.status, r.risk_level, r.diff_summary, i.id AS item_id, i.title AS item_title
    FROM capa_code_reviews r
    JOIN capa_items i ON i.id = r.item_id
    ORDER BY r.created_at ASC, r.id ASC
  `).all();

  const findings = db.prepare(`
    SELECT f.title, f.belongs_to_current_item, f.action, i.id AS item_id, i.title AS item_title
    FROM capa_findings f
    JOIN capa_items i ON i.id = f.item_id
    ORDER BY f.created_at ASC, f.id ASC
  `).all();

  const sprintSummary = [
    summary || `Sprint closed at ${ts}`,
    '',
    '## Closed PBIs',
    linesFor(closedItems, (r) => `- #${r.id} P${r.priority} ${r.title}`, '- none'),
    '',
    '## Pending PBIs',
    linesFor(pendingItems, (r) => `- #${r.id} [${r.status}] P${r.priority} ${r.title} :: ${r.current_state} -> ${r.next_state || '—'}`, '- none'),
    '',
    '## Evidence',
    linesFor(evidence, (r) => `- #${r.item_id} [${r.classification}] ${r.claim}${r.source_type ? ` (${r.source_type})` : ''}`, '- none'),
    '',
    '## Tests',
    linesFor(tests, (r) => `- #${r.item_id} [${r.status}] ${r.test_type || 'test'} :: ${r.command || r.summary || ''}`, '- none'),
    '',
    '## Code Reviews',
    linesFor(reviews, (r) => `- #${r.item_id} [${r.status}] risk=${r.risk_level || '—'} :: ${r.diff_summary || ''}`, '- none'),
    '',
    '## Findings',
    linesFor(findings, (r) => `- #${r.item_id} [${r.belongs_to_current_item ? 'IN' : 'OUT'}] ${r.title} :: ${r.action}`, '- none'),
  ].join('\n');

  const evidenceSummary = linesFor(evidence, (r) => `#${r.item_id} [${r.classification}] ${r.claim}`, 'none');
  const testSummary = linesFor(tests, (r) => `#${r.item_id} [${r.status}] ${r.command || r.summary || r.test_type || 'test'}`, 'none');
  const risks = linesFor([
    ...reviews.filter((r) => r.risk_level && r.risk_level !== 'low').map((r) => ({ text: `#${r.item_id} review risk=${r.risk_level}: ${r.diff_summary || r.item_title}` })),
    ...findings.filter((r) => !r.belongs_to_current_item).map((r) => ({ text: `#${r.item_id} OUT finding: ${r.title} :: ${r.action}` })),
    ...pendingItems.map((r) => ({ text: `#${r.id} pending: ${r.title} :: ${r.current_state}` })),
  ], (r) => `- ${r.text}`, 'none');

  const info = db.prepare(`
    INSERT INTO capa_closures (item_id, closure_type, summary, evidence_summary, test_summary, risks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(null, 'sprint', sprintSummary, evidenceSummary, testSummary, risks, ts);

  return {
    ok: true,
    closureId: info.lastInsertRowid,
    summary: sprintSummary,
    closedCount: closedItems.length,
    pendingCount: pendingItems.length,
    findingCount: findings.length,
    riskSummary: risks,
  };
}

module.exports = { closeSprint };
