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
run(['iniciar', 'Test review smoke PBI']);
run(['siguiente']);

const blockedClose = attempt(['guard', 'close']);
assert.equal(blockedClose.status, 2);
assert.match(blockedClose.stdout, /missing successful TEST/);

const testAdded = run(['test', 'add', '--type', 'unit', '--command', 'npm run test:db', '--status', 'ok', '--summary', 'unit passed']);
assert.match(testAdded, /Test/);
assert.match(testAdded, /ok/);
assert.match(run(['test', 'list']), /npm run test:db/);

const blockedAfterTest = attempt(['guard', 'close']);
assert.equal(blockedAfterTest.status, 2);
assert.match(blockedAfterTest.stdout, /missing successful CODE_REVIEW/);

const reviewAdded = run(['review', 'add', '--status', 'ok', '--summary', 'diff reviewed', '--risk', 'low']);
assert.match(reviewAdded, /Review/);
assert.match(reviewAdded, /ok/);
assert.match(run(['review', 'list']), /diff reviewed/);

const allowedClose = attempt(['guard', 'close']);
assert.equal(allowedClose.status, 0);
assert.match(allowedClose.stdout, /CAPA ALLOW/);

cleanDb();
console.log('Test and review smoke test OK');
