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

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
run(['iniciar', 'Scope smoke PBI']);
run(['siguiente']);
run(['siguiente']);
run(['siguiente']);
run(['siguiente']);
run(['siguiente']);
run(['siguiente']);
run(['siguiente']);

assert.match(run(['scope', 'add', 'src', '--reason', 'implementation folder']), /Scope agregado/);
assert.match(run(['scope', 'list']), /src/);
assert.equal(attempt(['guard', 'edit', '--file', 'src/app.js']).status, 0);
assert.equal(attempt(['guard', 'edit', '--file', 'other/app.js']).status, 2);
assert.match(run(['finding', 'add', 'E2E selector issue', '--outside', '--action', 'new-pbi']), /Finding/);
assert.match(run(['finding', 'list']), /E2E selector issue/);

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
console.log('Scope smoke test OK');
