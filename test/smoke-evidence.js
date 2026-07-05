'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = require('./tmp-db').makeTempDb();
const binPath = path.join(root, 'bin', 'capa.js');

function run(args) {
  return execFileSync(process.execPath, [binPath, ...args], { cwd: root, encoding: 'utf8' });
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

cleanDb();
run(['iniciar', 'Evidence smoke PBI']);
run(['siguiente']);

const added = run(['evidence', 'add', 'Discovery validated with smoke command', '--classification', 'VERIFIED', '--type', 'test', '--command', 'npm run test:db', '--result', 'passed']);
assert.match(added, /Evidence/);
assert.match(added, /VERIFIED/);
assert.match(added, /Discovery validated/);

const listed = run(['evidence', 'list']);
assert.match(listed, /VERIFIED/);
assert.match(listed, /DISCOVERY/);
assert.match(listed, /Discovery validated with smoke command/);
assert.match(listed, /test/);

const unknown = run(['evidence', 'add', 'Unverified claim', '--classification', 'invalid-value']);
assert.match(unknown, /UNKNOWN/);

cleanDb();
console.log('Evidence smoke test OK');
