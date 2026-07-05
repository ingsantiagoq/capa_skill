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
run(['iniciar', 'CAPA go alias smoke PBI']);

const goOutput = run(['go']);
assert.match(goOutput, /CAPA GO/);
assert.match(goOutput, /Estado a ejecutar: DISCOVERY/);
assert.match(goOutput, /haz solo este estado/);

const blocked = run(['vamos']);
assert.match(blocked, /must be completed before moving/);

cleanDb();
console.log('CAPA go alias smoke test OK');
