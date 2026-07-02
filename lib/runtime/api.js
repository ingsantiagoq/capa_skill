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

function readDashboardHtml(root) {
  const file = path.join(root, 'public', 'index.html');
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
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
        const page = readDashboardHtml(root);
        if (!page) return json(res, 404, { error: 'dashboard page not found' });
        return html(res, 200, page);
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

module.exports = { createServer, run, dashboard, progress };