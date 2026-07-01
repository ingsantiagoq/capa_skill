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

async function post(base, pathname, body) {
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() };
}

(async function main() {
  cleanDb();
  run(['iniciar', 'API write smoke PBI']);
  run(['siguiente']);

  const server = createServer({ root });
  const address = await listen(server);
  const base = `http://${address.address}:${address.port}`;

  try {
    assert.equal((await post(base, '/evidence', { claim: 'Evidence via API', classification: 'VERIFIED' })).status, 201);
    assert.equal((await post(base, '/tests', { type: 'smoke', command: 'node test/smoke-api-write.js', status: 'ok' })).status, 201);
    assert.equal((await post(base, '/reviews', { status: 'ok', summary: 'reviewed', risk: 'low' })).status, 201);
    assert.equal((await post(base, '/findings', { title: 'finding via API', action: 'record' })).status, 201);
  } finally {
    await close(server);
    cleanDb();
  }

  console.log('API write smoke test OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
