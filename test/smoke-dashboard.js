'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createServer } = require('../lib/runtime/api');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, '.capa', 'capa.db');
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

(async function main() {
  cleanDb();
  run(['iniciar', 'Dashboard smoke PBI']);
  run(['siguiente']);

  const server = createServer({ root });
  const address = await listen(server);
  const base = `http://${address.address}:${address.port}`;

  try {
    const response = await fetch(`${base}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(body, /CAPA Dashboard/);
    assert.match(body, /PBI activo/);
    assert.match(body, /Ver backlog/);
    assert.match(body, /Blockers/);
    assert.match(body, /Para completar estado actual/);
    assert.match(body, /Para cerrar PBI/);
    assert.match(body, /Missing evidence/);
  } finally {
    await close(server);
    cleanDb();
  }

  console.log('Dashboard smoke test OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
