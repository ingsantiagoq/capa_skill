'use strict';

const http = require('http');
const { URL } = require('url');
const { open } = require('./db');
const runtime = require('./items');
const guard = require('./guard');

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (error) { reject(error); }
    });
  });
}

function dashboard(root) {
  const db = open(root);
  const activeItem = runtime.active(db);
  const counts = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM capa_items
    GROUP BY status
    ORDER BY status ASC
  `).all();
  const backlog = runtime.list({ root });
  const latestClosures = db.prepare(`
    SELECT id, closure_type, summary, created_at
    FROM capa_closures
    ORDER BY created_at DESC, id DESC
    LIMIT 10
  `).all();
  return { active: activeItem || null, counts, backlog, latestClosures };
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
  return { item, progress: progressRows, evidence: evidenceRows, tests: testRows, reviews: reviewRows, findings: findingRows };
}

function createServer({ root }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    try {
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/dashboard') return json(res, 200, dashboard(root));
      if (req.method === 'GET' && url.pathname === '/items/active') {
        const db = open(root);
        return json(res, 200, { item: runtime.active(db) || null });
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
