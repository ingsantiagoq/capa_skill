'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { open } = require('./db');
const runtime = require('./items');
const guard = require('./guard');
const scope = require('./scope');
const findings = require('./findings');
const evidence = require('./evidence');
const tests = require('./tests');
const reviews = require('./reviews');
const closure = require('./closure');
const sprint = require('./sprint');
const exitCriteria = require('./exit-criteria');

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function html(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function listHtml(items, emptyText) {
  if (!items || !items.length) return `<p><span class="pill ok">${escapeHtml(emptyText)}</span></p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function rowsHtml(rows, emptyText, mapper) {
  if (!rows || !rows.length) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<div class="rows">${rows.map((row) => `<div class="row">${mapper(row)}</div>`).join('')}</div>`;
}

function renderDashboardHtml(root) {
  const data = dashboard(root);
  const active = data.active;
  const status = data.activeStatus || { exitBlockers: [], closeBlockers: [] };
  const details = active ? progress(root, active.id) : null;
  const activeHtml = active
    ? `<h2>PBI activo</h2><h3>#${active.id} ${escapeHtml(active.title)}</h3><p><span class="pill">status: ${escapeHtml(active.status)}</span><span class="pill">state: ${escapeHtml(active.current_state)}</span><span class="pill">next: ${escapeHtml(active.next_state || '-')}</span></p>`
    : '<h2>PBI activo</h2><p class="muted">No hay PBI activo.</p>';

  const backlogHtml = rowsHtml(data.backlog, 'Backlog vacío', (item) => `<strong>#${item.id} ${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(item.status)} · ${escapeHtml(item.current_state)} → ${escapeHtml(item.next_state || '-')}</span>`);
  const evidenceHtml = rowsHtml(details && details.evidence, 'Sin evidencia registrada', (row) => `<strong>${escapeHtml(row.classification)}</strong> ${escapeHtml(row.claim)}<br><span class="muted">${escapeHtml(row.source_type || '')} ${escapeHtml(row.command || '')}</span>`);
  const testsHtml = rowsHtml(details && details.tests, 'Sin tests registrados', (row) => `<strong>${escapeHtml(row.status)}</strong> ${escapeHtml(row.command || row.summary || row.test_type || 'test')}`);
  const reviewsHtml = rowsHtml(details && details.reviews, 'Sin reviews registrados', (row) => `<strong>${escapeHtml(row.status)}</strong> risk=${escapeHtml(row.risk_level || '-')}<br><span class="muted">${escapeHtml(row.diff_summary || '')}</span>`);
  const findingsHtml = rowsHtml(details && details.findings, 'Sin findings registrados', (row) => `<strong>${row.belongs_to_current_item ? 'IN' : 'OUT'}</strong> ${escapeHtml(row.title)}<br><span class="muted">action=${escapeHtml(row.action || 'record')}</span>`);
  const progressHtml = rowsHtml(details && details.progress, 'Sin progreso registrado', (row) => `<strong>${escapeHtml(row.state)}</strong> ${escapeHtml(row.status)}<br><span class="muted">${escapeHtml(row.summary || '')}</span>`);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CAPA Dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101114; color: #f5f5f5; }
    body { margin: 0; background: #101114; }
    header { padding: 24px 32px; border-bottom: 1px solid #2b2d33; }
    main { padding: 24px 32px; display: grid; gap: 20px; }
    h1, h2, h3 { margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .card { background: #17191f; border: 1px solid #2b2d33; border-radius: 14px; padding: 18px; display: grid; gap: 12px; }
    label { display: grid; gap: 6px; color: #d8dbe2; font-size: 13px; }
    input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid #3a3d46; background: #0f1117; color: #f5f5f5; border-radius: 9px; padding: 9px 10px; }
    textarea { min-height: 80px; resize: vertical; }
    button, a.button { border: 1px solid #3a3d46; background: #20232b; color: #f5f5f5; border-radius: 10px; padding: 10px 14px; cursor: pointer; text-decoration: none; text-align: center; }
    .muted { color: #a8adb8; }
    .pill { display: inline-block; border: 1px solid #3a3d46; border-radius: 999px; padding: 4px 9px; margin: 2px 4px 2px 0; color: #d8dbe2; }
    .ok { border-color: #2f5d3c; background: #142319; }
    .rows { display: grid; gap: 8px; }
    .row { border: 1px solid #2b2d33; border-radius: 10px; padding: 10px; background: #101218; }
    ul { margin: 0; padding-left: 18px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #0c0d10; border-radius: 10px; padding: 12px; color: #d8dbe2; }
  </style>
</head>
<body>
  <header><h1>CAPA Dashboard</h1><p class="muted">Panel local DB-first con blockers, backlog y trazabilidad visibles.</p></header>
  <main>
    <section class="grid">
      <article class="card">${activeHtml}</article>
      <article class="card"><h2>Blockers</h2><h3>Para completar estado actual</h3>${listHtml(status.exitBlockers, 'Sin blockers de salida')}<h3>Para cerrar PBI</h3>${listHtml(status.closeBlockers, 'Sin blockers de cierre')}</article>
      <article class="card"><h2>Lectura</h2><a class="button" href="/dashboard">Ver dashboard JSON</a><a class="button" href="/items/active">Ver PBI activo</a><a class="button" href="/backlog">Ver backlog</a></article>
      <article class="card"><h2>Avance</h2><form method="post" action="/next"><button type="submit">Siguiente paso</button></form><form method="post" action="/close/pbi"><input type="hidden" name="summary" value="PBI cerrado desde dashboard" /><button type="submit">Cerrar PBI</button></form><form method="post" action="/close/sprint"><input type="hidden" name="summary" value="Sprint cerrado desde dashboard" /><button type="submit">Cerrar sprint</button></form></article>
    </section>

    <section class="grid">
      <article class="card"><h2>Backlog</h2>${backlogHtml}</article>
      <article class="card"><h2>Progreso</h2>${progressHtml}</article>
      <article class="card"><h2>Evidencia</h2>${evidenceHtml}</article>
      <article class="card"><h2>Tests</h2>${testsHtml}</article>
      <article class="card"><h2>Reviews</h2>${reviewsHtml}</article>
      <article class="card"><h2>Findings</h2>${findingsHtml}</article>
    </section>

    <section class="grid">
      <form class="card" method="post" action="/scope"><h2>Agregar scope</h2><label>Ruta aprobada <input name="path" placeholder="src" required /></label><label>Motivo <input name="reason" placeholder="implementation folder" /></label><button type="submit">Guardar scope</button></form>
      <form class="card" method="post" action="/evidence"><h2>Agregar evidencia</h2><label>Claim <textarea name="claim" required></textarea></label><label>Clasificación <select name="classification"><option>VERIFIED</option><option>PARTIAL</option><option>ASSUMPTION</option><option>UNKNOWN</option></select></label><label>Tipo <input name="type" placeholder="test, file, command" /></label><label>Comando <input name="command" placeholder="npm run test" /></label><label>Resultado <input name="result" placeholder="passed" /></label><button type="submit">Guardar evidencia</button></form>
      <form class="card" method="post" action="/tests"><h2>Registrar test</h2><label>Tipo <input name="type" placeholder="unit, smoke, e2e" /></label><label>Comando <input name="command" placeholder="npm run test" /></label><label>Status <select name="status"><option>ok</option><option>failed</option><option>unknown</option></select></label><label>Resumen <input name="summary" /></label><button type="submit">Guardar test</button></form>
      <form class="card" method="post" action="/reviews"><h2>Registrar review</h2><label>Status <select name="status"><option>ok</option><option>changes_requested</option><option>unknown</option></select></label><label>Riesgo <select name="risk"><option>low</option><option>medium</option><option>high</option></select></label><label>Resumen del diff <textarea name="summary"></textarea></label><label>Hallazgos <textarea name="findings"></textarea></label><button type="submit">Guardar review</button></form>
      <form class="card" method="post" action="/findings"><h2>Registrar finding</h2><label>Título <input name="title" required /></label><label>Descripción <textarea name="description"></textarea></label><label>Acción <input name="action" value="record" /></label><label><span><input type="checkbox" name="outside" value="true" /> Fuera del PBI actual</span></label><button type="submit">Guardar finding</button></form>
    </section>

    <section class="card"><h2>Uso</h2><pre>node bin/capa.js api --port 4739
open http://127.0.0.1:4739/</pre></section>
  </main>
</body>
</html>`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    const contentType = req.headers['content-type'] || '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      if (contentType.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(data)));
      try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
    });
  });
}

function activeStatus(db, item) {
  if (!item) return { item: null, exitBlockers: ['No active PBI'], closeBlockers: ['No active PBI'] };
  return {
    item,
    exitBlockers: exitCriteria.blockers(db, item, 'ok'),
    closeBlockers: closure.blockers(db, item),
  };
}

function dashboard(root) {
  const db = open(root);
  const activeItem = runtime.active(db);
  const counts = db.prepare('SELECT status, COUNT(*) AS count FROM capa_items GROUP BY status ORDER BY status ASC').all();
  const backlog = runtime.list({ root });
  const latestClosures = db.prepare('SELECT id, closure_type, summary, created_at FROM capa_closures ORDER BY created_at DESC, id DESC LIMIT 10').all();
  const active = activeStatus(db, activeItem);
  return { active: activeItem || null, activeStatus: active, counts, backlog, latestClosures };
}

function progress(root, itemId) {
  const db = open(root);
  const item = db.prepare('SELECT * FROM capa_items WHERE id = ?').get(itemId);
  if (!item) return null;
  const progressRows = db.prepare('SELECT * FROM capa_progress WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(itemId);
  const evidenceRows = db.prepare('SELECT * FROM capa_evidence WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(itemId);
  const testRows = db.prepare('SELECT * FROM capa_tests WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(itemId);
  const reviewRows = db.prepare('SELECT * FROM capa_code_reviews WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(itemId);
  const findingRows = db.prepare('SELECT * FROM capa_findings WHERE item_id = ? ORDER BY created_at ASC, id ASC').all(itemId);
  return { item, status: activeStatus(db, item), progress: progressRows, evidence: evidenceRows, tests: testRows, reviews: reviewRows, findings: findingRows };
}

function requireText(body, field) {
  const value = String(body[field] || '').trim();
  if (!value) return null;
  return value;
}

function createServer({ root }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/app')) {
        return html(res, 200, renderDashboardHtml(root));
      }
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/dashboard') return json(res, 200, dashboard(root));
      if (req.method === 'GET' && url.pathname === '/items/active') {
        const db = open(root);
        const item = runtime.active(db) || null;
        return json(res, 200, { item, status: activeStatus(db, item) });
      }
      if (req.method === 'GET' && url.pathname === '/backlog') return json(res, 200, { items: runtime.list({ root }) });
      const progressMatch = url.pathname.match(/^\/items\/(\d+)\/progress$/);
      if (req.method === 'GET' && progressMatch) {
        const payload = progress(root, Number(progressMatch[1]));
        if (!payload) return json(res, 404, { error: 'item not found' });
        return json(res, 200, payload);
      }
      if (req.method === 'POST' && url.pathname === '/next') {
        const out = runtime.moveNext({ root });
        return json(res, out.ok ? 200 : 409, out);
      }
      if (req.method === 'POST' && url.pathname === '/guard') {
        const body = await readJson(req);
        const result = guard.evaluate({ root, action: body.action, file: body.file, autoFix: Boolean(body.autoFix) });
        return json(res, result.allowed ? 200 : 409, result);
      }
      if (req.method === 'POST' && url.pathname === '/scope') {
        const body = await readJson(req);
        const allowedPath = requireText(body, 'path') || requireText(body, 'allowedPath');
        if (!allowedPath) return json(res, 400, { error: 'path is required' });
        const out = scope.add({ root, allowedPath, reason: body.reason || null });
        return json(res, out.ok ? 201 : 409, out);
      }
      if (req.method === 'POST' && url.pathname === '/evidence') {
        const body = await readJson(req);
        const claim = requireText(body, 'claim');
        if (!claim) return json(res, 400, { error: 'claim is required' });
        const out = evidence.add({ root, claim, classification: body.classification || body.class || 'UNKNOWN', sourceType: body.type || body.sourceType || null, filePath: body.file || body.filePath || null, symbol: body.symbol || null, command: body.command || null, resultSummary: body.result || body.summary || body.resultSummary || null, confidence: body.confidence || null });
        return json(res, out.ok ? 201 : 409, out);
      }
      if (req.method === 'POST' && url.pathname === '/tests') {
        const body = await readJson(req);
        const out = tests.add({ root, testType: body.type || body.testType || null, command: body.command || null, status: body.status || 'unknown', summary: body.summary || null });
        return json(res, out.ok ? 201 : 409, out);
      }
      if (req.method === 'POST' && url.pathname === '/reviews') {
        const body = await readJson(req);
        const out = reviews.add({ root, status: body.status || 'ok', diffSummary: body.summary || body.diffSummary || null, findings: body.findings || null, riskLevel: body.risk || body.riskLevel || null });
        return json(res, out.ok ? 201 : 409, out);
      }
      if (req.method === 'POST' && url.pathname === '/findings') {
        const body = await readJson(req);
        const title = requireText(body, 'title');
        if (!title) return json(res, 400, { error: 'title is required' });
        const out = findings.add({ root, title, description: body.description || null, belongs: body.belongs === undefined ? !Boolean(body.outside) : Boolean(body.belongs), action: body.action || 'record' });
        return json(res, out.ok ? 201 : 409, out);
      }
      if (req.method === 'POST' && url.pathname === '/close/pbi') {
        const body = await readJson(req);
        const out = closure.closePbi({ root, summary: body.summary || null });
        return json(res, out.ok ? 200 : 409, out);
      }
      if (req.method === 'POST' && url.pathname === '/close/sprint') {
        const body = await readJson(req);
        const out = sprint.closeSprint({ root, summary: body.summary || null });
        return json(res, 200, out);
      }
      return json(res, 404, { error: 'not found' });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  });
}

function run({ root, port = 4739, host = '127.0.0.1' }) {
  const server = createServer({ root });
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`CAPA API listening on http://${address.address}:${address.port}`);
  });
  return server;
}

module.exports = { createServer, run, dashboard, progress, renderDashboardHtml };