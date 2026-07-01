'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, '.capa', 'capa.db');
const binPath = path.join(root, 'bin', 'capa.js');

function run(args) {
  return execFileSync(process.execPath, [binPath, ...args], { cwd: root, encoding: 'utf8' });
}

function attempt(args) {
  return spawnSync(process.execPath, [binPath, ...args], { cwd: root, encoding: 'utf8' });
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

cleanDb();
run(['iniciar', 'Close PBI smoke']);
run(['siguiente']);

const blocked = attempt(['cerrar', 'pbi']);
assert.equal(blocked.status, 2);
assert.match(blocked.stdout, /CAPA BLOCK/);
assert.match(blocked.stdout, /Missing evidence/);

run(['evidence', 'add', 'Implementation verified', '--classification', 'VERIFIED']);
run(['test', 'add', '--type', 'unit', '--command', 'npm run test:db', '--status', 'ok']);
run(['review', 'add', '--status', 'ok', '--summary', 'diff reviewed']);

const closed = run(['cerrar', 'pbi', '--summary', 'Smoke PBI closed']);
assert.match(closed, /CAPA PBI CLOSED/);
assert.match(closed, /Smoke PBI closed/);

const backlog = run(['backlog']);
assert.match(backlog, /\[done\][^\n]*Close PBI smoke/);

cleanDb();
console.log('Close PBI smoke test OK');
