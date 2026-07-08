'use strict';

// DP-12: un objetivo de INFRA sin superficie api/e2e-ui alcanza prueba de Alcance con evidencia
// kind 'integration' (Testcontainers/Postgres) o 'gate' (build-breaking que muerde en CI), anclada
// a un comando reproducible, con la decisión ACEPTADA **y con DP-12 firmada en el governance.json
// del ADR padre**.
//
// Esa última condición cierra el agujero de gobernanza: `infra:true` lo escribe el propio manifest,
// así que sin la firma de la visión un objetivo se auto-otorgaba E2E escribiendo dos campos.
// Este smoke test bloquea cualquier regresión.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hasScopeProof, isInfra, governanceGrantsInfraProof } = require('../lib/util');
const { lintCapa } = require('../lib/doctor');

// ---- 0) fixtures de gobernanza ---------------------------------------------

// La DP-12 real de ADR-0001: firmada, gate, y el texto de la palanca (respaldo legacy sin `grants`).
const GOV_SIGNED = { adr: 'ADR-TEST', decisions: [{ id: 'DP-12', state: 'signed', gate: true, what: 'Que cuenta como E2E-VERIFIED para un objetivo de INFRA sin superficie api/e2e-ui.' }] };
// Marcador explícito: el id da igual, lo que concede la palanca es `grants`.
const GOV_GRANT = { adr: 'ADR-TEST', decisions: [{ id: 'DP-7', state: 'signed', grants: 'infra-scope-proof' }] };
// DP-12 presente pero SIN firmar.
const GOV_PENDING = { adr: 'ADR-TEST', decisions: [{ id: 'DP-12', state: 'pending', gate: true, what: 'Que cuenta como E2E-VERIFIED para un objetivo de INFRA.' }] };
// COLISIÓN DE IDS: la DP-12 de ADR-0016 está firmada y es gate, pero decide el molde de
// `pago-participante-posteo` — nada que ver con la prueba de infra. NO debe conceder la palanca.
const GOV_COLLISION = { adr: 'ADR-0016', decisions: [{ id: 'DP-12', state: 'signed', gate: true, what: '[pago-participante-posteo] Molde.' }] };
// ADR sin governance.json (ADR-0003, ADR-0005): la palanca no existe.
const GOV_NONE = null;

assert.equal(governanceGrantsInfraProof(GOV_SIGNED), true, 'DP-12 firmada con texto de la palanca concede');
assert.equal(governanceGrantsInfraProof(GOV_GRANT), true, 'grants:"infra-scope-proof" concede sin importar el id');
assert.equal(governanceGrantsInfraProof(GOV_PENDING), false, 'DP-12 pendiente NO concede');
assert.equal(governanceGrantsInfraProof(GOV_COLLISION), false, 'DP-12 de otro ADR (colisión de id) NO concede');
assert.equal(governanceGrantsInfraProof(GOV_NONE), false, 'sin governance.json NO concede');
assert.equal(governanceGrantsInfraProof({ decisions: [] }), false, 'governance vacío NO concede');

// ---- 1) hasScopeProof / isInfra (funciones puras) --------------------------

// Objetivo CON superficie: integration/gate NO alcanza (ni con la palanca firmada).
assert.equal(hasScopeProof({ status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'integration', command: 'x' }] }, GOV_SIGNED), false,
  'objetivo no-infra no debe promover con integration');

// Objetivo de infra ACEPTADO con integration + comando + DP-12 firmada: SÍ alcanza.
assert.equal(hasScopeProof({ infra: true, status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'integration', command: 'dotnet test ...' }] }, GOV_SIGNED), true,
  'infra ACEPTADA con integration+comando y DP-12 firmada debe promover');

// Objetivo de infra con gate + comando + DP-12 firmada: SÍ alcanza.
assert.equal(hasScopeProof({ surface: 'infra', status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'gate', command: 'bash tools/gate.sh' }] }, GOV_SIGNED), true,
  'infra ACEPTADA con gate+comando y DP-12 firmada debe promover');

// --- EL AGUJERO QUE ESTE FIX CIERRA -----------------------------------------
// Mismo manifest impecable (infra:true + ACEPTADA + gate con comando), pero el ADR padre
// NO firmó DP-12: la palanca no aplica. Esto era `true` antes del fix.
const selfGranted = { infra: true, status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'gate', command: 'bash tools/gate.sh' }] };
assert.equal(hasScopeProof(selfGranted, GOV_NONE), false,
  'infra:true+ACEPTADA+gate SIN governance.json del ADR NO debe promover (auto-otorgamiento)');
assert.equal(hasScopeProof(selfGranted, GOV_PENDING), false,
  'infra:true+ACEPTADA+gate con DP-12 pendiente NO debe promover');
assert.equal(hasScopeProof(selfGranted, GOV_COLLISION), false,
  'la DP-12 de otro ADR (mismo id, otra decisión) NO debe conceder la palanca');
assert.equal(hasScopeProof(selfGranted, undefined), false,
  'sin governance pasada, la palanca de infra NO aplica (fail-closed)');
assert.equal(hasScopeProof(selfGranted, GOV_GRANT), true,
  'grants:"infra-scope-proof" firmado concede la palanca');

// Infra PROPUESTA (no aceptada): NO alcanza aunque el ADR firmó.
assert.equal(hasScopeProof({ infra: true, status: { decision: 'PROPUESTA' }, evidence: [{ kind: 'gate', command: 'x' }] }, GOV_SIGNED), false,
  'infra sin decisión ACEPTADA no debe promover');

// Infra con evidencia sin comando (teatro): NO alcanza.
assert.equal(hasScopeProof({ infra: true, status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'gate' }] }, GOV_SIGNED), false,
  'infra con gate sin comando no debe promover');

// api/e2e-ui sigue alcanzando para cualquiera, sin gobernanza de por medio.
assert.equal(hasScopeProof({ status: { decision: 'ACEPTADA' }, evidence: [{ kind: 'api', command: 'curl ...' }] }, GOV_NONE), true,
  'api sigue siendo prueba de Alcance sin depender de DP-12');

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

const GATE_EV = [{ kind: 'gate', claim: 'gate muerde', command: 'bash tools/check.sh', result: 'rojo al inyectar, verde al revertir' }];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-dp12-'));

// (a) infra:true + gate + comando + DP-12 firmada  =>  done SIN bloqueos E9
const okDir = path.join(tmp, 'infra-ok');
makeCapa(okDir, { ...base, infra: true, evidence: GATE_EV });
let f = lintCapa(okDir, fakeGraph, GOV_SIGNED);
let e9 = f.filter((x) => x.code === 'E9' && x.sev === 'BLOCKER');
assert.equal(e9.length, 0, 'infra+gate+comando+DP-12 firmada NO debe bloquear E9: ' + JSON.stringify(e9));

// (a2) EL AGUJERO, vía doctor: mismo dossier, ADR sin governance.json => E9 y E12 BLOQUEAN.
const noGovDir = path.join(tmp, 'infra-no-gov');
makeCapa(noGovDir, { ...base, infra: true, evidence: GATE_EV });
f = lintCapa(noGovDir, fakeGraph, GOV_NONE);
assert.ok(f.some((x) => x.code === 'E9' && x.sev === 'BLOCKER'), 'sin DP-12 firmada, gate no cuenta => E9 debe bloquear');
assert.ok(f.some((x) => x.code === 'E12' && x.sev === 'BLOCKER'), 'sin DP-12 firmada, objetivo E2E-VERIFIED debe BLOQUEAR E12');
assert.ok(f.some((x) => x.code === 'E9' && /firmó DP-12/i.test(x.msg)), 'E9 debe explicar que falta la firma DP-12 del ADR');

// (a3) colisión de ids: la DP-12 firmada de OTRO ADR no habilita nada.
const collisionDir = path.join(tmp, 'infra-collision');
makeCapa(collisionDir, { ...base, infra: true, evidence: GATE_EV });
f = lintCapa(collisionDir, fakeGraph, GOV_COLLISION);
assert.ok(f.some((x) => x.code === 'E9' && x.sev === 'BLOCKER'), 'DP-12 de otro ADR no debe habilitar la palanca');

// (a4) PARTIAL sin DP-12 firmada => E12 sigue siendo aviso (no revienta el backlog).
const noGovPartialDir = path.join(tmp, 'infra-no-gov-partial');
makeCapa(noGovPartialDir, { ...base, lifecycle: 'wip', infra: true, status: { ...base.status, implementation: 'PARTIAL' }, evidence: GATE_EV });
f = lintCapa(noGovPartialDir, fakeGraph, GOV_NONE);
assert.ok(f.some((x) => x.code === 'E12' && x.sev !== 'BLOCKER'), 'E12 por falta de DP-12 en objetivo PARTIAL debe ser aviso');
assert.ok(!f.some((x) => x.code === 'E12' && x.sev === 'BLOCKER'), 'E12 no debe bloquear un objetivo PARTIAL');

// (b) mismo caso pero SIN infra:true  =>  E9 bloquea (prueba de infra no cuenta) + E12 BLOQUEA
//     (el fixture se declara E2E-VERIFIED: reclamar verificación apoyado en una prueba que DP-12
//      no cuenta es exactamente el teatro que E12 debe atrapar).
const noInfraDir = path.join(tmp, 'no-infra');
makeCapa(noInfraDir, { ...base, evidence: [{ kind: 'gate', claim: 'gate', command: 'bash tools/check.sh', result: 'ok' }] });
f = lintCapa(noInfraDir, fakeGraph, GOV_SIGNED);
assert.ok(f.some((x) => x.code === 'E9' && x.sev === 'BLOCKER'), 'sin infra:true, gate no cuenta => E9 debe bloquear');
assert.ok(f.some((x) => x.code === 'E12' && x.sev === 'BLOCKER'), 'gate sin infra:true en objetivo E2E-VERIFIED debe BLOQUEAR E12');

// (b2) infra:true pero decisión PROPUESTA + E2E-VERIFIED  =>  E12 BLOQUEA (exige firma real).
const unsignedDir = path.join(tmp, 'infra-unsigned');
makeCapa(unsignedDir, { ...base, infra: true, status: { ...base.status, decision: 'PROPUESTA' }, evidence: [{ kind: 'gate', claim: 'gate', command: 'bash tools/check.sh', result: 'ok' }] });
f = lintCapa(unsignedDir, fakeGraph, GOV_SIGNED);
assert.ok(f.some((x) => x.code === 'E12' && x.sev === 'BLOCKER'), 'infra sin ACEPTADA en objetivo E2E-VERIFIED debe BLOQUEAR E12');

// (b3) mismo caso pero implementation PARTIAL  =>  E12 sigue siendo AVISO (no revienta el backlog).
const partialDir = path.join(tmp, 'infra-partial');
makeCapa(partialDir, { ...base, lifecycle: 'wip', infra: true, status: { ...base.status, decision: 'PROPUESTA', implementation: 'PARTIAL' }, evidence: [{ kind: 'gate', claim: 'gate', command: 'bash tools/check.sh', result: 'ok' }] });
f = lintCapa(partialDir, fakeGraph, GOV_SIGNED);
assert.ok(f.some((x) => x.code === 'E12' && x.sev !== 'BLOCKER'), 'E12 en objetivo PARTIAL debe seguir siendo aviso');
assert.ok(!f.some((x) => x.code === 'E12' && x.sev === 'BLOCKER'), 'E12 no debe bloquear un objetivo PARTIAL');

// (b4) E13 — dossier en plantilla. E2E-VERIFIED => BLOQUEA; PARTIAL => avisa.
const SKELETON = '# CONTEXTO\n<!-- ¿Qué duele hoy? -->\n';

const skelVerifiedDir = path.join(tmp, 'skel-verified');
makeCapa(skelVerifiedDir, { ...base, infra: true, evidence: [{ kind: 'gate', claim: 'g', command: 'bash tools/check.sh', result: 'ok' }] });
fs.writeFileSync(path.join(skelVerifiedDir, 'CONTEXTO.md'), SKELETON);
f = lintCapa(skelVerifiedDir, fakeGraph, GOV_SIGNED);
assert.ok(f.some((x) => x.code === 'E13' && x.sev === 'BLOCKER'), 'dossier plantilla en objetivo E2E-VERIFIED debe BLOQUEAR E13');

const skelPartialDir = path.join(tmp, 'skel-partial');
makeCapa(skelPartialDir, { ...base, lifecycle: 'wip', infra: true, status: { ...base.status, implementation: 'PARTIAL' }, evidence: [{ kind: 'gate', claim: 'g', command: 'bash tools/check.sh', result: 'ok' }] });
fs.writeFileSync(path.join(skelPartialDir, 'CONTEXTO.md'), SKELETON);
f = lintCapa(skelPartialDir, fakeGraph, GOV_SIGNED);
assert.ok(f.some((x) => x.code === 'E13' && x.sev !== 'BLOCKER'), 'E13 en objetivo PARTIAL debe seguir siendo aviso');
assert.ok(!f.some((x) => x.code === 'E13' && x.sev === 'BLOCKER'), 'E13 no debe bloquear un objetivo PARTIAL');

// (c) infra:true + integration + comando + DP-12 firmada  =>  done sin bloqueos
const intDir = path.join(tmp, 'infra-int');
makeCapa(intDir, { ...base, infra: true, evidence: [{ kind: 'integration', claim: 'round-trip Postgres', command: 'dotnet test X.IntegrationTests', result: '2/2' }] });
f = lintCapa(intDir, fakeGraph, GOV_SIGNED);
assert.equal(f.filter((x) => x.code === 'E9' && x.sev === 'BLOCKER').length, 0, 'infra+integration debe promover a done');

fs.rmSync(tmp, { recursive: true, force: true });

console.log('DP-12 infra proof smoke test OK');
