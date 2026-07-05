'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = require('./tmp-db').makeTempDb();
const capa = path.join(root, 'bin', 'capa.js');
const agentGuard = path.join(root, 'bin', 'capa-agent-edit-guard.js');

function run(file, args) {
  return execFileSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8' });
}

function attempt(file, args) {
  return spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8' });
}

function complete(summary) {
  return run(capa, ['completar', '--status', 'ok', '--summary', summary]);
}

function next() {
  return run(capa, ['siguiente']);
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

cleanDb();
run(capa, ['iniciar', 'Agent edit guard smoke PBI']);
next();

let blocked = attempt(agentGuard, ['--file', 'src/app.js']);
assert.equal(blocked.status, 2);
assert.match(blocked.stdout, /CAPA BLOCK/);
assert.match(blocked.stdout, /only allowed in IMPLEMENT/);

complete('Discovery complete');
next();
complete('Viability complete');
next();
complete('Context complete');
next();
run(capa, ['scope', 'add', 'src', '--reason', 'implementation folder']);
complete('Scope complete');
next();
complete('Gate complete');
next();
complete('Approval complete');
next();

blocked = attempt(agentGuard, ['--file', 'other/app.js']);
assert.equal(blocked.status, 2);
assert.match(blocked.stdout, /CAPA BLOCK/);
assert.match(blocked.stdout, /outside approved scope/);

const allowed = attempt(agentGuard, ['--file', 'src/app.js']);
assert.equal(allowed.status, 0);
assert.match(allowed.stdout, /CAPA ALLOW/);

cleanDb();
console.log('Agent edit guard smoke test OK');
