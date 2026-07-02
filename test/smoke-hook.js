'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const binPath = path.join(root, 'bin', 'capa.js');
const hookPath = path.join(root, 'hooks', 'capa-guard-pretool.js');
const schemaPath = path.join(root, '.capa', 'schema.sql');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-hook-smoke-'));
const dbPath = path.join(tempRoot, '.capa', 'capa.db');

fs.mkdirSync(path.join(tempRoot, '.capa'), { recursive: true });
fs.copyFileSync(schemaPath, path.join(tempRoot, '.capa', 'schema.sql'));
fs.symlinkSync(path.join(root, 'bin'), path.join(tempRoot, 'bin'));
fs.symlinkSync(path.join(root, 'lib'), path.join(tempRoot, 'lib'));

function run(args) {
  return execFileSync(process.execPath, [binPath, ...args], { cwd: tempRoot, encoding: 'utf8' });
}

function nextOk(summary) {
  run(['completar', '--status', 'ok', '--summary', summary]);
  return run(['siguiente']);
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

function hookCall() {
  const payload = { cwd: tempRoot, tool_name: 'Edit', tool_input: { file_path: 'src/app.js' } };
  return spawnSync(process.execPath, [hookPath], { cwd: root, input: JSON.stringify(payload), encoding: 'utf8' });
}

cleanDb();
run(['iniciar', 'Hook smoke PBI']);
run(['siguiente']);
const blocked = hookCall();
assert.equal(blocked.status, 2);
assert.match(blocked.stdout, /CAPA BLOCK/);

nextOk('Discovery complete');
nextOk('Viability complete');
nextOk('Context complete');
assert.match(run(['scope', 'add', 'src', '--reason', 'hook smoke workspace']), /Scope agregado/);
nextOk('Scope complete');
nextOk('Gate complete');
nextOk('Approval complete');
const allowed = hookCall();
assert.equal(allowed.status, 0);
assert.match(allowed.stdout, /CAPA ALLOW/);

cleanDb();
fs.rmSync(tempRoot, { recursive: true, force: true });
console.log('Hook smoke test OK');
