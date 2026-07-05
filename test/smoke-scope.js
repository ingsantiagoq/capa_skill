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

function nextOk(summary) {
  run(['completar', '--status', 'ok', '--summary', summary]);
  return run(['siguiente']);
}

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
run(['iniciar', 'Scope smoke PBI']);
run(['siguiente']);
nextOk('Discovery complete');
nextOk('Viability complete');
nextOk('Context complete');
assert.match(run(['scope', 'add', 'src', '--reason', 'implementation folder']), /Scope agregado/);
nextOk('Scope complete');
nextOk('Gate complete');
nextOk('Approval complete');

assert.match(run(['scope', 'list']), /src/);
assert.equal(attempt(['guard', 'edit', '--file', 'src/app.js']).status, 0);
assert.equal(attempt(['guard', 'edit', '--file', 'other/app.js']).status, 2);
assert.match(run(['finding', 'add', 'E2E selector issue', '--outside', '--action', 'new-pbi']), /Finding/);
assert.match(run(['finding', 'list']), /E2E selector issue/);

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
console.log('Scope smoke test OK');
