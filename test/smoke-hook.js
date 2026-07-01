'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, '.capa', 'capa.db');
const binPath = path.join(root, 'bin', 'capa.js');
const hookPath = path.join(root, 'hooks', 'capa-guard-pretool.js');

function run(args) {
  return execFileSync(process.execPath, [binPath, ...args], { cwd: root, encoding: 'utf8' });
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

function hookCall() {
  const payload = { cwd: root, tool_name: 'Edit', tool_input: { file_path: 'src/app.js' } };
  return spawnSync(process.execPath, [hookPath], { cwd: root, input: JSON.stringify(payload), encoding: 'utf8' });
}

cleanDb();
run(['iniciar', 'Hook smoke PBI']);
run(['siguiente']);
const blocked = hookCall();
assert.equal(blocked.status, 2);
assert.match(blocked.stdout, /CAPA BLOCK/);

run(['siguiente']);
run(['siguiente']);
run(['siguiente']);
run(['siguiente']);
run(['siguiente']);
run(['siguiente']);
const allowed = hookCall();
assert.equal(allowed.status, 0);
assert.match(allowed.stdout, /CAPA ALLOW/);

cleanDb();
console.log('Hook smoke test OK');
