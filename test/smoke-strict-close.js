'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = require('./tmp-db').makeTempDb();
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
run(['iniciar', 'Strict close smoke']);
run(['siguiente']);

let out = attempt(['cerrar', 'pbi']);
assert.equal(out.status, 2);
assert.match(out.stdout, /Missing evidence/);
assert.match(out.stdout, /Missing TEST ok/);
assert.match(out.stdout, /Missing CODE_REVIEW ok/);

run(['evidence', 'add', 'Verified close evidence', '--classification', 'VERIFIED']);
run(['test', 'add', '--type', 'unit', '--command', 'npm run test:db', '--status', 'ok']);
run(['review', 'add', '--status', 'ok', '--summary', 'diff reviewed']);
run(['finding', 'add', 'Finding delegated', '--outside', '--action', 'new-pbi']);

out = attempt(['cerrar', 'pbi', '--summary', 'Strict close done']);
assert.equal(out.status, 0);
assert.match(out.stdout, /CAPA PBI CLOSED/);

cleanDb();
console.log('Strict close smoke test OK');
