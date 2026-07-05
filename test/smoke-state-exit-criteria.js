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

function complete(summary) {
  return run(['completar', '--status', 'ok', '--summary', summary]);
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

cleanDb();
run(['iniciar', 'State exit criteria smoke PBI']);
run(['siguiente']);
complete('Discovery complete');
run(['siguiente']);
complete('Viability complete');
run(['siguiente']);
complete('Context complete');
run(['siguiente']);

let blocked = attempt(['completar', '--status', 'ok', '--summary', 'Scope complete']);
assert.equal(blocked.status, 0);
assert.match(blocked.stdout, /Cannot complete SCOPE/);
assert.match(blocked.stdout, /SCOPE requires at least one approved path/);

run(['scope', 'add', 'src', '--reason', 'implementation folder']);
complete('Scope complete');
run(['siguiente']);
complete('Gate complete');
run(['siguiente']);
complete('Approval complete');
run(['siguiente']);

blocked = attempt(['completar', '--status', 'ok', '--summary', 'Implement complete']);
assert.equal(blocked.status, 0);
assert.match(blocked.stdout, /Cannot complete IMPLEMENT/);
assert.match(blocked.stdout, /IMPLEMENT requires implementation evidence/);

run(['evidence', 'add', 'Implementation changed scoped files', '--classification', 'VERIFIED', '--type', 'file']);
complete('Implement complete');
run(['siguiente']);
complete('Build complete');
run(['siguiente']);

blocked = attempt(['completar', '--status', 'ok', '--summary', 'Test complete']);
assert.equal(blocked.status, 0);
assert.match(blocked.stdout, /Cannot complete TEST/);
assert.match(blocked.stdout, /TEST requires at least one ok test/);

run(['test', 'add', '--type', 'smoke', '--command', 'npm run test:state-exit', '--status', 'ok']);
complete('Test complete');
run(['siguiente']);

blocked = attempt(['completar', '--status', 'ok', '--summary', 'Code review complete']);
assert.equal(blocked.status, 0);
assert.match(blocked.stdout, /Cannot complete CODE_REVIEW/);
assert.match(blocked.stdout, /CODE_REVIEW requires at least one ok review/);

run(['review', 'add', '--status', 'ok', '--summary', 'state exit criteria reviewed', '--risk', 'low']);
complete('Code review complete');

cleanDb();
console.log('State exit criteria smoke test OK');
