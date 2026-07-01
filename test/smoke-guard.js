'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, '.capa', 'capa.db');
const binPath = path.join(root, 'bin', 'capa.js');

function run(args) {
  return execFileSync(process.execPath, [binPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function attempt(args) {
  return spawnSync(process.execPath, [binPath, ...args], { cwd: root, encoding: 'utf8' });
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

function nextOk(summary) {
  run(['completar', '--status', 'ok', '--summary', summary]);
  return run(['siguiente']);
}

cleanDb();
run(['iniciar', 'Guard smoke PBI']);
run(['siguiente']);

const blockedEdit = attempt(['guard', 'edit', '--file', 'src/app.js']);
assert.equal(blockedEdit.status, 2);
assert.match(blockedEdit.stdout, /CAPA BLOCK/);
assert.match(blockedEdit.stdout, /only allowed in IMPLEMENT/);

nextOk('Discovery complete');
nextOk('Viability complete');
nextOk('Context complete');
nextOk('Scope complete');
nextOk('Gate complete');
nextOk('Approval complete');

const blockedNoScope = attempt(['guard', 'edit', '--file', 'src/app.js']);
assert.equal(blockedNoScope.status, 2);
assert.match(blockedNoScope.stdout, /Missing approved scope/);

run(['scope', 'add', 'src', '--reason', 'implementation folder']);
const allowedEdit = attempt(['guard', 'edit', '--file', 'src/app.js']);
assert.equal(allowedEdit.status, 0);
assert.match(allowedEdit.stdout, /CAPA ALLOW/);

cleanDb();
console.log('CAPA guard smoke test OK');
