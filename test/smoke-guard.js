'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const Database = require('better-sqlite3');

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
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

cleanDb();

run(['iniciar', 'Guard smoke PBI']);
run(['siguiente']);

const blockedEdit = attempt(['guard', 'edit', '--file', 'src/app.js']);
assert.equal(blockedEdit.status, 2);
assert.match(blockedEdit.stdout, /CAPA BLOCK/);
assert.match(blockedEdit.stdout, /only allowed in IMPLEMENT/);
assert.match(blockedEdit.stdout, /DISCOVERY/);

run(['siguiente']); // VIABILITY
run(['siguiente']); // CONTEXT
run(['siguiente']); // SCOPE
run(['siguiente']); // GATE
run(['siguiente']); // APPROVAL
run(['siguiente']); // IMPLEMENT

const allowedEdit = attempt(['guard', 'edit', '--file', 'src/app.js']);
assert.equal(allowedEdit.status, 0);
assert.match(allowedEdit.stdout, /CAPA ALLOW/);
assert.match(allowedEdit.stdout, /IMPLEMENT/);

run(['siguiente']); // BUILD
run(['siguiente']); // TEST

const blockedAutoFix = attempt(['guard', 'run', '--auto-fix']);
assert.equal(blockedAutoFix.status, 2);
assert.match(blockedAutoFix.stdout, /CAPA BLOCK/);
assert.match(blockedAutoFix.stdout, /Auto-fix is blocked during TEST/);

const blockedClose = attempt(['guard', 'close']);
assert.equal(blockedClose.status, 2);
assert.match(blockedClose.stdout, /CAPA BLOCK/);
assert.match(blockedClose.stdout, /Cannot close: missing successful TEST progress/);

const db = new Database(dbPath, { readonly: true });
const item = db.prepare('SELECT title, current_state, status FROM capa_items LIMIT 1').get();
assert.equal(item.title, 'Guard smoke PBI');
assert.equal(item.current_state, 'TEST');
assert.equal(item.status, 'in_progress');
db.close();

cleanDb();
console.log('CAPA guard smoke test OK');
