'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, '.capa', 'capa.db');
const capa = path.join(root, 'bin', 'capa.js');
const go = path.join(root, 'bin', 'capa-go.js');

function run(file, args) {
  return execFileSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8' });
}

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
run(capa, ['iniciar', 'CAPA go smoke PBI']);

const output = run(go, []);
assert.match(output, /CAPA GO/);
assert.match(output, /Run state: DISCOVERY/);
assert.match(output, /Do one state/);

const blocked = run(go, []);
assert.match(blocked, /must be completed before moving/);

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
console.log('CAPA go smoke test OK');
