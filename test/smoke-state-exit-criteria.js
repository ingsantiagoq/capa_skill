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

blocked = attempt(['completar', '--status', 'fail', '--summary', 'Code review needs rework']);
assert.equal(blocked.status, 0);
assert.match(blocked.stdout, /CODE_REVIEW rework requires at least one fail review/);

run(['review', 'add', '--status', 'ok', '--summary', 'stale review must not survive rework', '--risk', 'low']);
run(['review', 'add', '--status', 'fail', '--summary', 'rework required', '--risk', 'medium']);
const rework = run(['completar', '--status', 'fail', '--summary', 'Code review needs rework']);
assert.match(rework, /Estado ejecutado: CODE_REVIEW/);
assert.match(rework, /Próximo estado: IMPLEMENT/);

const reworkStatus = run(['estado']);
assert.match(reworkStatus, /state: IMPLEMENT -> BUILD/);
const allowedEdit = attempt(['guard', 'edit', '--file', 'src/rework.js']);
assert.equal(allowedEdit.status, 0);
assert.match(allowedEdit.stdout, /CAPA ALLOW/);
assert.match(run(['scope', 'list']), /src/);
assert.match(run(['evidence', 'list']), /Implementation changed scoped files/);

run(['evidence', 'add', 'Review findings fixed', '--classification', 'VERIFIED', '--type', 'file']);
complete('Rework implementation complete');
run(['siguiente']);
complete('Rework build complete');
run(['siguiente']);
complete('Rework test complete');
run(['siguiente']);

blocked = attempt(['completar', '--status', 'ok', '--summary', 'Stale review must not close rework']);
assert.equal(blocked.status, 0);
assert.match(blocked.stdout, /CODE_REVIEW requires at least one ok review/);

blocked = attempt(['completar', '--status', 'fail', '--summary', 'Consumed fail must not reopen rework']);
assert.equal(blocked.status, 0);
assert.match(blocked.stdout, /CODE_REVIEW rework requires at least one fail review/);

run(['review', 'add', '--status', 'ok', '--summary', 'state exit criteria reviewed', '--risk', 'low']);
complete('Code review complete');

cleanDb();
console.log('State exit criteria smoke test OK');
