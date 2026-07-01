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
run(['iniciar', 'Next requires complete smoke PBI']);

const discovery = run(['siguiente']);
assert.match(discovery, /Estado a ejecutar: DISCOVERY/);

const blocked = attempt(['siguiente']);
assert.equal(blocked.status, 0);
assert.match(blocked.stdout, /must be completed before moving/);

run(['completar', '--status', 'ok', '--summary', 'Discovery complete']);

const viability = run(['siguiente']);
assert.match(viability, /Estado a ejecutar: VIABILITY/);

cleanDb();
console.log('Next requires complete smoke test OK');
