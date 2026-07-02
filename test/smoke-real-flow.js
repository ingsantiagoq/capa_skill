'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { open } = require('../lib/runtime/db');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, '.capa', 'capa.db');
const capa = path.join(root, 'bin', 'capa.js');
const agentGuard = path.join(root, 'bin', 'capa-agent-edit-guard.js');

function run(file, args) {
  return execFileSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8' });
}

function attempt(file, args) {
  return spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8' });
}

function next() {
  return run(capa, ['go']);
}

function complete(summary) {
  return run(capa, ['completar', '--status', 'ok', '--summary', summary]);
}

function cleanDb() {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
}

cleanDb();

run(capa, ['iniciar', 'Real CAPA flow smoke PBI']);
let out = run(capa, ['estado']);
assert.match(out, /Real CAPA flow smoke PBI/);
assert.match(out, /CAPA BUDGET/);

out = next();
assert.match(out, /Estado a ejecutar: DISCOVERY/);
complete('Discovery confirmed runtime DB-first flow');

out = next();
assert.match(out, /Estado a ejecutar: VIABILITY/);
complete('Viability confirmed smoke can run locally');

out = next();
assert.match(out, /Estado a ejecutar: CONTEXT/);
complete('Context confirmed current repo provides commands and tests');

out = next();
assert.match(out, /Estado a ejecutar: SCOPE/);
run(capa, ['scope', 'add', 'docs', '--reason', 'documentation-only real flow target']);
complete('Scope approved docs path');

out = next();
assert.match(out, /Estado a ejecutar: GATE/);
complete('Gate accepted documentation-only change');

out = next();
assert.match(out, /Estado a ejecutar: APPROVAL/);
complete('Approval accepted documentation-only smoke evidence');

out = next();
assert.match(out, /Estado a ejecutar: IMPLEMENT/);

let blocked = attempt(agentGuard, ['--file', 'lib/runtime/items.js']);
assert.equal(blocked.status, 2);
assert.match(blocked.stdout, /CAPA BLOCK/);
assert.match(blocked.stdout, /outside approved scope/);

const allowed = attempt(agentGuard, ['--file', 'docs/SMOKE_REAL_FLOW.md']);
assert.equal(allowed.status, 0);
assert.match(allowed.stdout, /CAPA ALLOW/);

run(capa, ['evidence', 'add', 'Agent guard allowed the approved docs path and blocked an out-of-scope runtime path', '--classification', 'VERIFIED', '--type', 'command', '--command', 'node bin/capa-agent-edit-guard.js --file docs/SMOKE_REAL_FLOW.md', '--result', 'allowed docs and blocked lib/runtime/items.js']);
complete('Implement documented with verified guard evidence');

out = next();
assert.match(out, /Estado a ejecutar: BUILD/);
complete('Build not required for documentation-only smoke');

out = next();
assert.match(out, /Estado a ejecutar: TEST/);
run(capa, ['test', 'add', '--type', 'smoke', '--command', 'node test/smoke-real-flow.js', '--status', 'ok', '--summary', 'real CAPA flow self-validates']);
complete('Test registered for real flow smoke');

out = next();
assert.match(out, /Estado a ejecutar: CODE_REVIEW/);
run(capa, ['review', 'add', '--status', 'ok', '--summary', 'real flow uses approved docs scope, guard, evidence, test and close gates', '--risk', 'low']);
complete('Code review complete');

out = next();
assert.match(out, /Estado a ejecutar: CLOSURE/);
out = run(capa, ['cerrar', 'pbi', '--summary', 'Real CAPA flow closed with scope, guard, evidence, test and review']);
assert.match(out, /CAPA PBI CLOSED/);

const db = open(root);
const item = db.prepare('SELECT * FROM capa_items WHERE title = ?').get('Real CAPA flow smoke PBI');
assert.equal(item.status, 'done');
assert.equal(item.current_state, 'DONE');

const evidenceCount = db.prepare('SELECT COUNT(*) AS count FROM capa_evidence WHERE item_id = ?').get(item.id).count;
const testCount = db.prepare("SELECT COUNT(*) AS count FROM capa_tests WHERE item_id = ? AND status = 'ok'").get(item.id).count;
const reviewCount = db.prepare("SELECT COUNT(*) AS count FROM capa_code_reviews WHERE item_id = ? AND status = 'ok'").get(item.id).count;
const closureCount = db.prepare("SELECT COUNT(*) AS count FROM capa_closures WHERE item_id = ? AND closure_type = 'pbi'").get(item.id).count;

assert.ok(evidenceCount >= 1);
assert.ok(testCount >= 1);
assert.ok(reviewCount >= 1);
assert.ok(closureCount >= 1);

cleanDb();
console.log('Real CAPA flow smoke test OK');
