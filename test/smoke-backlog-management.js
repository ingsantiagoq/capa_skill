'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { open } = require('../lib/runtime/db');

const root = path.resolve(__dirname, '..');
const dbPath = require('./tmp-db').makeTempDb();
const capa = path.join(root, 'bin', 'capa.js');

function run(args) {
  return execFileSync(process.execPath, [capa, ...args], { cwd: root, encoding: 'utf8' });
}

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });

let out = run(['backlog', 'add', 'Build complete backlog module', '--type', 'feature', '--priority', '1']);
assert.match(out, /PBI agregado al backlog #1/);

out = run(['backlog', 'list']);
assert.match(out, /#1 \[ready\] P1 feature :: Build complete backlog module/);

out = run(['backlog', 'task', 'add', '--pbi', '1', 'Define PBI and acceptance criteria', '--model', 'reasoning', '--acceptance', 'PBI has done criteria']);
assert.match(out, /Tarea #1 agregada al PBI #1/);
assert.match(out, /model=reasoning/);

out = run(['backlog', 'task', 'add', '--pbi', '1', 'Implement CLI changes', '--model', 'execution', '--acceptance', 'smoke tests pass']);
assert.match(out, /Tarea #2 agregada al PBI #1/);
assert.match(out, /model=execution/);

out = run(['backlog', 'task', 'list', '--pbi', '1']);
assert.match(out, /#1 \[todo\] 1\. Define PBI and acceptance criteria :: model=reasoning/);
assert.match(out, /#2 \[todo\] 2\. Implement CLI changes :: model=execution/);

out = run(['backlog', 'activate', '1']);
assert.match(out, /PBI activo #1/);

out = run(['estado']);
assert.match(out, /#1 Build complete backlog module/);
assert.match(out, /status: in_progress/);

out = run(['backlog', 'task', 'done', '1', '--summary', 'Definition completed']);
assert.match(out, /Tarea cerrada #1/);

const db = open(root);
const item = db.prepare('SELECT * FROM capa_items WHERE id = 1').get();
assert.equal(item.status, 'in_progress');
const reasoningTask = db.prepare('SELECT * FROM capa_tasks WHERE id = 1').get();
const executionTask = db.prepare('SELECT * FROM capa_tasks WHERE id = 2').get();
assert.equal(reasoningTask.owner_model, 'reasoning');
assert.equal(reasoningTask.status, 'done');
assert.equal(executionTask.owner_model, 'execution');
assert.equal(executionTask.status, 'todo');

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
console.log('Backlog management smoke test OK');
