'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const capa = path.join(root, 'bin', 'capa.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-external-repo-'));

function run(args) {
  return execFileSync(process.execPath, [capa, ...args], { cwd: tempRoot, encoding: 'utf8' });
}

assert.ok(!fs.existsSync(path.join(tempRoot, '.capa')));

const out = run(['iniciar', 'External repo init smoke PBI']);
assert.match(out, /PBI creado #1/);

assert.ok(fs.existsSync(path.join(tempRoot, '.capa', 'schema.sql')));
assert.ok(fs.existsSync(path.join(tempRoot, '.capa', 'capa.db')));

const status = run(['estado']);
assert.match(status, /External repo init smoke PBI/);
assert.match(status, /CAPA BUDGET/);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log('External repo init smoke test OK');
