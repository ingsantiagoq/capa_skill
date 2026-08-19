'use strict';

// E11 — slices invisibles al tablero. El dashboard cuenta `s.done` (booleano · dashboard.js);
// un slice que declara su cierre en OTRO vocabulario (estado/status/state: done|hecho|e2e-verified…)
// renderiza 0/N aunque el trabajo esté hecho. Barrido 2026-07-26: 30 objetivos / 97 slices
// invisibles — trabajo E2E-verified figuraba 0/N en el tablero de todo el proyecto.
//
// El check es AVISO, nunca bloqueo: el defecto es de visibilidad, no de verdad. Este smoke
// bloquea dos regresiones: (a) que el doctor deje de avisar el drift, (b) que alguien lo
// endurezca a BLOCKER sin decidirlo (reventaría el gate de PR de sesiones con dialecto viejo).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lintCapa } = require('../lib/doctor');

const DIMENSIONS = ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER'];
const fakeGraph = { has: () => true, nodes: () => [{ source_file: 'x/y.cs' }] };

function makeCapa(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true });
  for (const d of DIMENSIONS) fs.writeFileSync(path.join(dir, `${d}.md`), `# ${d}\n`);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

const base = {
  parentAdr: 'ADR-TEST',
  objetivo: 'slice-visibility-fixture',
  lifecycle: 'wip',
  status: { decision: 'PROPUESTA', implementation: 'PARTIAL' },
  route: ['x/'],
  anchors: [{ id: 'n1', label: 'ancla' }],
  evidence: [{ kind: 'unit', claim: 'c', command: 'dotnet test', result: 'ok' }],
  decisions: [],
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-e11-'));
const e11 = (f) => f.filter((x) => x.code === 'E11');

// (a) DISPARA: tres dialectos distintos, todos cerrados, ninguno con `done`.
const fireDir = path.join(tmp, 'fire');
makeCapa(fireDir, { ...base, slices: [
  { id: 'S1', estado: 'done' },
  { id: 'S2', status: 'E2E-VERIFIED' },   // case-insensitive
  { id: 'S3', state: 'Hecho' },
  { id: 'S4', estado: 'wip' },            // abierto: NO cuenta
] });
let f = e11(lintCapa(fireDir, fakeGraph, null));
assert.equal(f.length, 1, 'E11 debe avisar una sola vez por CAPA');
assert.equal(f[0].sev, 'WARN', 'E11 es AVISO, no bloqueo');
assert.ok(/3 slice/.test(f[0].msg), `debe contar los 3 cerrados (no el wip): ${f[0].msg}`);
assert.ok(f[0].msg.includes('S1') && f[0].msg.includes('S2') && f[0].msg.includes('S3'), 'debe nombrar los slices');

// (b) NO dispara: la forma traducida (done:true + vocabulario original conservado).
const fixedDir = path.join(tmp, 'fixed');
makeCapa(fixedDir, { ...base, slices: [
  { id: 'S1', estado: 'done', done: true },
  { id: 'S2', status: 'E2E-VERIFIED', done: true },
] });
assert.equal(e11(lintCapa(fixedDir, fakeGraph, null)).length, 0, 'done presente => sin aviso');

// (c) NO dispara: override deliberado (done:false explícito manda sobre el dialecto).
const overrideDir = path.join(tmp, 'override');
makeCapa(overrideDir, { ...base, slices: [{ id: 'S1', estado: 'done', done: false }] });
assert.equal(e11(lintCapa(overrideDir, fakeGraph, null)).length, 0, 'done:false explícito es override, no drift');

// (d) NO dispara: slices string, vocabulario abierto, o sin slices.
const quietDir = path.join(tmp, 'quiet');
makeCapa(quietDir, { ...base, slices: ['slice plano string', { id: 'S1', estado: 'pendiente' }, { id: 'S2', state: 'excluded' }] });
assert.equal(e11(lintCapa(quietDir, fakeGraph, null)).length, 0, 'strings y estados abiertos no avisan');
const emptyDir = path.join(tmp, 'empty');
makeCapa(emptyDir, { ...base, slices: [] });
assert.equal(e11(lintCapa(emptyDir, fakeGraph, null)).length, 0, 'sin slices no avisa');

// (e) Sigue siendo AVISO aunque el objetivo se declare E2E-VERIFIED: E11 es visibilidad,
//     la verdad de la verificación la custodian E9/E12/E13.
const verifiedDir = path.join(tmp, 'verified');
makeCapa(verifiedDir, { ...base, lifecycle: 'done',
  status: { decision: 'ACEPTADA', implementation: 'E2E-VERIFIED', verified_against: 'WS-A' },
  evidence: [{ kind: 'api', claim: 'c', command: 'curl …', result: '200' }],
  slices: [{ id: 'S1', estado: 'done' }] });
f = e11(lintCapa(verifiedDir, fakeGraph, null));
assert.equal(f.length, 1, 'E11 también avisa en E2E-VERIFIED');
assert.equal(f[0].sev, 'WARN', 'E11 NUNCA escala a BLOCKER');

// (f) Truncado legible: más de 4 ids se recortan con elipsis.
const manyDir = path.join(tmp, 'many');
makeCapa(manyDir, { ...base, slices: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `S${i}`, estado: 'done' })) });
f = e11(lintCapa(manyDir, fakeGraph, null));
assert.ok(/6 slice/.test(f[0].msg) && f[0].msg.includes('…'), `6 detectados, lista truncada: ${f[0].msg}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('doctor slice-visibility (E11) smoke test OK');
