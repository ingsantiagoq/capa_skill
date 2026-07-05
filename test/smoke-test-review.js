'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = require('./tmp-db').makeTempDb();
const capa = path.join(root, 'bin', 'capa.js');

function run(args) {
  return execFileSync(process.execPath, [capa, ...args], { cwd: root, encoding: 'utf8' });
}

function attempt(args) {
  return spawnSync(process.execPath, [capa, ...args], { cwd: root, encoding: 'utf8' });
}

function go() {
  return run(['go']);
}

function complete(summary) {
  return run(['completar', '--status', 'ok', '--summary', summary]);
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

cleanDb();

run(['iniciar', 'Test review smoke PBI']);

// Walk the state machine to the TEST gate. The TEST and CODE_REVIEW close
// gates are satisfied by completing those states (capa_progress ok), not by
// `test add`/`review add` alone, and closing also requires evidence.
assert.match(go(), /Estado a ejecutar: DISCOVERY/);
complete('Discovery confirmed');
assert.match(go(), /Estado a ejecutar: VIABILITY/);
complete('Viability confirmed');
assert.match(go(), /Estado a ejecutar: CONTEXT/);
complete('Context confirmed');
assert.match(go(), /Estado a ejecutar: SCOPE/);
run(['scope', 'add', 'docs', '--reason', 'documentation-only test review smoke']);
complete('Scope approved');
assert.match(go(), /Estado a ejecutar: GATE/);
complete('Gate accepted');
assert.match(go(), /Estado a ejecutar: APPROVAL/);
complete('Approval accepted');
assert.match(go(), /Estado a ejecutar: IMPLEMENT/);
run(['evidence', 'add', 'Close gates enforce TEST and CODE_REVIEW before closing', '--classification', 'VERIFIED', '--type', 'command', '--command', 'node bin/capa.js guard close', '--result', 'gates enforced']);
complete('Implement documented');
assert.match(go(), /Estado a ejecutar: BUILD/);
complete('Build not required');
assert.match(go(), /Estado a ejecutar: TEST/);

// At TEST: close is still blocked because the TEST state is not completed yet.
const blockedTest = attempt(['guard', 'close']);
assert.equal(blockedTest.status, 2);
assert.match(blockedTest.stdout, /CAPA BLOCK/);
assert.match(blockedTest.stdout, /Missing TEST ok/);

const testAdded = run(['test', 'add', '--type', 'unit', '--command', 'npm run test:db', '--status', 'ok', '--summary', 'unit passed']);
assert.match(testAdded, /Test/);
assert.match(testAdded, /ok/);
assert.match(run(['test', 'list']), /npm run test:db/);
complete('Test registered');

assert.match(go(), /Estado a ejecutar: CODE_REVIEW/);

// At CODE_REVIEW: TEST is satisfied but review is still missing.
const blockedReview = attempt(['guard', 'close']);
assert.equal(blockedReview.status, 2);
assert.match(blockedReview.stdout, /Missing CODE_REVIEW ok/);

const reviewAdded = run(['review', 'add', '--status', 'ok', '--summary', 'diff reviewed', '--risk', 'low']);
assert.match(reviewAdded, /Review/);
assert.match(reviewAdded, /ok/);
assert.match(run(['review', 'list']), /diff reviewed/);
complete('Code review complete');

// All close gates satisfied: evidence + TEST ok + CODE_REVIEW ok. Assert the
// gate outcome directly instead of a specific state name (the state machine
// keeps growing, e.g. a CLOSURE step before DONE).
const allowedClose = attempt(['guard', 'close']);
assert.equal(allowedClose.status, 0);
assert.match(allowedClose.stdout, /CAPA ALLOW/);

cleanDb();
console.log('Test and review smoke test OK');
