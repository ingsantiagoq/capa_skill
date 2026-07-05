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

run(['iniciar', 'Done PBI for sprint']);
run(['siguiente']);
run(['evidence', 'add', 'Sprint evidence verified', '--classification', 'VERIFIED']);
run(['test', 'add', '--type', 'unit', '--command', 'npm run test:db', '--status', 'ok']);
run(['review', 'add', '--status', 'ok', '--summary', 'diff reviewed']);
run(['cerrar', 'pbi', '--summary', 'Done PBI closed']);

run(['iniciar', 'Pending PBI for sprint']);
run(['siguiente']);

const closedSprint = run(['cerrar', 'sprint', '--summary', 'Sprint smoke summary']);
assert.match(closedSprint, /CAPA SPRINT CLOSED/);
assert.match(closedSprint, /PBIs cerrados: 1/);
assert.match(closedSprint, /PBIs pendientes: 1/);
assert.match(closedSprint, /Done PBI for sprint/);
assert.match(closedSprint, /Pending PBI for sprint/);
assert.match(closedSprint, /Sprint evidence verified/);

cleanDb();
console.log('Close sprint smoke test OK');
