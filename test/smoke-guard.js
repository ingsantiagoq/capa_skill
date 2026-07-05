'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = require('./tmp-db').makeTempDb();
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
run(['scope', 'add', 'src', '--reason', 'implementation folder']);
nextOk('Scope complete');
nextOk('Gate complete');
nextOk('Approval complete');

const blockedOutsideScope = attempt(['guard', 'edit', '--file', 'other/app.js']);
assert.equal(blockedOutsideScope.status, 2);
assert.match(blockedOutsideScope.stdout, /outside approved scope/);

const allowedEdit = attempt(['guard', 'edit', '--file', 'src/app.js']);
assert.equal(allowedEdit.status, 0);
assert.match(allowedEdit.stdout, /CAPA ALLOW/);

cleanDb();
console.log('CAPA guard smoke test OK');
