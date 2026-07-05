'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createServer } = require('../lib/runtime/api');

const root = path.resolve(__dirname, '..');
const dbPath = require('./tmp-db').makeTempDb();
const binPath = path.join(root, 'bin', 'capa.js');

function run(args) {
  return execFileSync(process.execPath, [binPath, ...args], { cwd: root, encoding: 'utf8' });
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address())));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function request(base, method, pathname, body = null) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

(async function main() {
  cleanDb();
  run(['iniciar', 'API smoke PBI']);
  run(['siguiente']);

  const server = createServer({ root });
  const address = await listen(server);
  const base = `http://${address.address}:${address.port}`;

  try {
    const health = await request(base, 'GET', '/health');
    assert.equal(health.status, 200);
    assert.equal(health.payload.ok, true);

    const active = await request(base, 'GET', '/items/active');
    assert.equal(active.status, 200);
    assert.equal(active.payload.item.title, 'API smoke PBI');
    assert.ok(Array.isArray(active.payload.status.exitBlockers));
    assert.ok(Array.isArray(active.payload.status.closeBlockers));

    const backlog = await request(base, 'GET', '/backlog');
    assert.equal(backlog.status, 200);
    assert.equal(backlog.payload.items.length, 1);

    const dashboard = await request(base, 'GET', '/dashboard');
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.payload.active.title, 'API smoke PBI');
    assert.ok(Array.isArray(dashboard.payload.activeStatus.exitBlockers));
    assert.ok(Array.isArray(dashboard.payload.activeStatus.closeBlockers));

    const blockedGuard = await request(base, 'POST', '/guard', { action: 'edit', file: 'src/app.js' });
    assert.equal(blockedGuard.status, 409);
    assert.equal(blockedGuard.payload.allowed, false);

    const nextBlocked = await request(base, 'POST', '/next');
    assert.equal(nextBlocked.status, 409);
    assert.equal(nextBlocked.payload.ok, false);
    assert.match(nextBlocked.payload.message, /must be completed before moving/);

    const progress = await request(base, 'GET', `/items/${active.payload.item.id}/progress`);
    assert.equal(progress.status, 200);
    assert.equal(progress.payload.item.title, 'API smoke PBI');
    assert.ok(progress.payload.progress.length >= 2);
    assert.ok(Array.isArray(progress.payload.status.exitBlockers));
  } finally {
    await close(server);
    cleanDb();
  }

  console.log('API smoke test OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
