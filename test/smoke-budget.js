'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const budget = require('../lib/runtime/budget');

const root = path.resolve(__dirname, '..');
const dbPath = require('./tmp-db').makeTempDb();
const capa = path.join(root, 'bin', 'capa.js');

function run(args) {
  return execFileSync(process.execPath, [capa, ...args], { cwd: root, encoding: 'utf8' });
}

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });

const current = budget.getBudget(root).budget;
assert.equal(current.max_minutes, 5);
assert.equal(current.max_tool_calls, 8);
assert.equal(current.max_bash_commands, 4);
assert.equal(current.max_file_reads, 5);
assert.equal(current.max_file_edits, 2);
assert.equal(current.max_files_touched, 2);
assert.equal(current.max_git_diff_lines, 200);
assert.equal(current.allow_auto_fix, false);

const output = run(['budget']);
assert.match(output, /CAPA BUDGET/);
assert.match(output, /max_minutes: 5/);
assert.match(output, /max_tool_calls: 8/);
assert.match(output, /max_bash_commands: 4/);
assert.match(output, /max_file_reads: 5/);
assert.match(output, /max_file_edits: 2/);
assert.match(output, /max_files_touched: 2/);
assert.match(output, /max_git_diff_lines: 200/);
assert.match(output, /allow_auto_fix: false/);

run(['iniciar', 'Budget smoke PBI']);
const go = run(['go']);
assert.match(go, /CAPA BUDGET/);
assert.match(go, /max_file_edits: 2/);

if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
console.log('Budget smoke test OK');
