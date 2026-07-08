'use strict';

// DP-12 (ADR-0001): un objetivo de INFRA sin superficie api/e2e-ui alcanza
// prueba de Alcance con evidencia kind 'integration' (Testcontainers/Postgres)
// o 'gate' (build-breaking que muerde en CI), anclada a un comando reproducible
// y con la decisión ACEPTADA. Este smoke test bloquea cualquier regresión.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hasScopeProof, isInfra } = require('../lib/util');
const { lintCapa } = require('../lib/doctor');

// ---- 1) hasScopeProof / isInfra (funciones puras) --------------------------

// Objetivo CON superficie: integration/gate NO alcanza.
assert.equal(hasScopeProof({ status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'integration', command: 'x' }] }), false,
  'objetivo no-infra no debe promover con integration');

// Objetivo de infra ACEPTADO con integration + comando: SÍ alcanza.
assert.equal(hasScopeProof({ infra: true, status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'integration', command: 'dotnet test ...' }] }), true,
  'infra ACEPTADA con integration+comando debe promover');

// Objetivo de infra con gate + comando: SÍ alcanza.
assert.equal(hasScopeProof({ surface: 'infra', status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'gate', command: 'bash tools/gate.sh' }] }), true,
  'infra ACEPTADA con gate+comando debe promover');

// Infra PROPUESTA (no aceptada): NO alcanza.
assert.equal(hasScopeProof({ infra: true, status: { decision: 'PROPUESTA' }, evidence: [{ kind: 'gate', command: 'x' }] }), false,
  'infra sin decisión ACEPTADA no debe promover');

// Infra con evidencia sin comando (teatro): NO alcanza.
assert.equal(hasScopeProof({ infra: true, status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'gate' }] }), false,
  'infra con gate sin comando no debe promover');

// api/e2e-ui sigue alcanzando para cualquiera.
assert.equal(hasScopeProof({ status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'api', command: 'curl ...' }] }), true,
  'api sigue siendo prueba de Alcance');

assert.equal(isInfra({ infra: true }), true);
assert.equal(isInfra({ surface: 'infra' }), true);
assert.equal(isInfra({}), false);

// ---- 2) doctor lintCapa end-to-end (dossier temporal + grafo stub) ---------

const DIMENSIONS = ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER'];
const fakeGraph = { has: () => true, nodes: () => [{ source_file: 'x/y.cs' }] };

function makeCapa(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true });
  for (const d of DIMENSIONS) fs.writeFileSync(path.join(dir, `${d}.md`), `# ${d}\n`);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

const base = {
  parentAdr: 'ADR-TEST',
  objetivo: 'dp12-fixture',
  lifecycle: 'done',
  status: { decision: 'ACEPTADA', implementation: 'E2E-VERIFIED', verified_against: 'Postgres real via Testcontainers' },
  route: ['x/'],
  anchors: [{ id: 'n1', label: 'ancla' }],
  decisions: [],
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-dp12-'));

// (a) infra:true + gate + comando  =>  done SIN bloqueos E9
const okDir = path.join(tmp, 'infra-ok');
makeCapa(okDir, { ...base, infra: true, evidence: [{ kind: 'gate', claim: 'gate muerde', command: 'bash tools/check.sh', result: 'rojo al inyectar, verde al revertir' }] });
let f = lintCapa(okDir, fakeGraph);
let e9 = f.filter((x) => x.code === 'E9' && x.sev === 'BLOCKER');
assert.equal(e9.length, 0, 'infra+gate+comando NO debe bloquear E9: ' + JSON.stringify(e9));

// (b) mismo caso pero SIN infra:true  =>  E9 bloquea (prueba de infra no cuenta) + E12 BLOQUEA
//     (el fixture se declara E2E-VERIFIED: reclamar verificación apoyado en una prueba que DP-12
//      no cuenta es exactamente el teatro que E12 debe atrapar).
const noInfraDir = path.join(tmp, 'no-infra');
makeCapa(noInfraDir, { ...base, evidence: [{ kind: 'gate', claim: 'gate', command: 'bash tools/check.sh', result: 'ok' }] });
f = lintCapa(noInfraDir, fakeGraph);
assert.ok(f.some((x) => x.code === 'E9' && x.sev === 'BLOCKER'), 'sin infra:true, gate no cuenta => E9 debe bloquear');
assert.ok(f.some((x) => x.code === 'E12' && x.sev === 'BLOCKER'), 'gate sin infra:true en objetivo E2E-VERIFIED debe BLOQUEAR E12');

// (b2) infra:true pero decisión PROPUESTA + E2E-VERIFIED  =>  E12 BLOQUEA (exige firma real).
const unsignedDir = path.join(tmp, 'infra-unsigned');
makeCapa(unsignedDir, { ...base, infra: true, status: { ...base.status, decision: 'PROPUESTA' }, evidence: [{ kind: 'gate', claim: 'gate', command: 'bash tools/check.sh', result: 'ok' }] });
f = lintCapa(unsignedDir, fakeGraph);
assert.ok(f.some((x) => x.code === 'E12' && x.sev === 'BLOCKER'), 'infra sin ACEPTADA en objetivo E2E-VERIFIED debe BLOQUEAR E12');

// (b3) mismo caso pero implementation PARTIAL  =>  E12 sigue siendo AVISO (no revienta el backlog).
const partialDir = path.join(tmp, 'infra-partial');
makeCapa(partialDir, { ...base, lifecycle: 'wip', infra: true, status: { ...base.status, decision: 'PROPUESTA', implementation: 'PARTIAL' }, evidence: [{ kind: 'gate', claim: 'gate', command: 'bash tools/check.sh', result: 'ok' }] });
f = lintCapa(partialDir, fakeGraph);
assert.ok(f.some((x) => x.code === 'E12' && x.sev !== 'BLOCKER'), 'E12 en objetivo PARTIAL debe seguir siendo aviso');
assert.ok(!f.some((x) => x.code === 'E12' && x.sev === 'BLOCKER'), 'E12 no debe bloquear un objetivo PARTIAL');

// (b4) E13 — dossier en plantilla. E2E-VERIFIED => BLOQUEA; PARTIAL => avisa.
const SKELETON = '# CONTEXTO\n<!-- ¿Qué duele hoy? -->\n';

const skelVerifiedDir = path.join(tmp, 'skel-verified');
makeCapa(skelVerifiedDir, { ...base, infra: true, evidence: [{ kind: 'gate', claim: 'g', command: 'bash tools/check.sh', result: 'ok' }] });
fs.writeFileSync(path.join(skelVerifiedDir, 'CONTEXTO.md'), SKELETON);
f = lintCapa(skelVerifiedDir, fakeGraph);
assert.ok(f.some((x) => x.code === 'E13' && x.sev === 'BLOCKER'), 'dossier plantilla en objetivo E2E-VERIFIED debe BLOQUEAR E13');

const skelPartialDir = path.join(tmp, 'skel-partial');
makeCapa(skelPartialDir, { ...base, lifecycle: 'wip', infra: true, status: { ...base.status, implementation: 'PARTIAL' }, evidence: [{ kind: 'gate', claim: 'g', command: 'bash tools/check.sh', result: 'ok' }] });
fs.writeFileSync(path.join(skelPartialDir, 'CONTEXTO.md'), SKELETON);
f = lintCapa(skelPartialDir, fakeGraph);
assert.ok(f.some((x) => x.code === 'E13' && x.sev !== 'BLOCKER'), 'E13 en objetivo PARTIAL debe seguir siendo aviso');
assert.ok(!f.some((x) => x.code === 'E13' && x.sev === 'BLOCKER'), 'E13 no debe bloquear un objetivo PARTIAL');

// (c) infra:true + integration + comando  =>  done sin bloqueos
const intDir = path.join(tmp, 'infra-int');
makeCapa(intDir, { ...base, infra: true, evidence: [{ kind: 'integration', claim: 'round-trip Postgres', command: 'dotnet test X.IntegrationTests', result: '2/2' }] });
f = lintCapa(intDir, fakeGraph);
assert.equal(f.filter((x) => x.code === 'E9' && x.sev === 'BLOCKER').length, 0, 'infra+integration debe promover a done');

fs.rmSync(tmp, { recursive: true, force: true });

console.log('DP-12 infra proof smoke test OK');
