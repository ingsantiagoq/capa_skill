'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, '.capa', 'capa.db');
const binPath = path.join(root, 'bin', 'capa.js');

function run(args) {
  return execFileSync(process.execPath, [binPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

cleanDb();

const created = run(['iniciar', 'Smoke DB-first PBI']);
assert.match(created, /PBI creado #\d+/);
assert.ok(fs.existsSync(dbPath), 'expected .capa/capa.db to be created');

const estado1 = run(['estado']);
assert.match(estado1, /Smoke DB-first PBI/);
assert.match(estado1, /NEW -> DISCOVERY/);

const next = run(['siguiente']);
assert.match(next, /CAPA ONE-STEP/);
assert.match(next, /Estado a ejecutar: DISCOVERY/);
assert.match(next, /Regla: ejecuta solo este estado/);

const complete = run(['completar', '--status', 'ok', '--summary', 'Discovery listo']);
assert.match(complete, /CAPA STOP/);
assert.match(complete, /Estado ejecutado: DISCOVERY/);
assert.match(complete, /Resultado: ok/);

const backlog = run(['backlog']);
assert.match(backlog, /Smoke DB-first PBI/);
assert.match(backlog, /DISCOVERY -> VIABILITY/);

const db = new Database(dbPath, { readonly: true });
const item = db.prepare('SELECT title, status, current_state, next_state FROM capa_items LIMIT 1').get();
assert.equal(item.title, 'Smoke DB-first PBI');
assert.equal(item.status, 'in_progress');
assert.equal(item.current_state, 'DISCOVERY');
assert.equal(item.next_state, 'VIABILITY');

const progressCount = db.prepare('SELECT COUNT(*) AS count FROM capa_progress').get().count;
assert.ok(progressCount >= 3, 'expected progress records for create, next, complete');

db.close();
cleanDb();

console.log('DB-first smoke test OK');
