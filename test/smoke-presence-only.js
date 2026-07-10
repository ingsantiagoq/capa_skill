'use strict';

// Fase 1 del audit anti-teatro: una prueba de infra (DP-12) SOLO-PRESENCIA no cuenta como
// Alcance. `isPresenceOnlyCommand` distingue "el artefacto existe" de "el comportamiento corre".

const assert = require('assert');
const { isPresenceOnlyCommand, hasScopeProof } = require('../lib/util');

// --- presencia pura: TRUE ---
const presence = [
  'test -f stryker-config.json',
  'bash -n tools/seed-f8.sh && test -x tools/seed-f8.sh && echo OK',
  'bash -n tools/backup-f8.sh && bash -n tools/restore-f8.sh && test -x tools/migrate-f8.sh',
  'docker compose -f ubp-infra/docker-compose.f8.yml config -q',
  '[ -f azure-pipelines.yml ] && echo ok',
  'ls building-blocks/Ubp.BuildingBlocks.Persistence/UnfilteredQueryScope.cs',
];
for (const c of presence) assert.strictEqual(isPresenceOnlyCommand(c), true, `debería ser solo-presencia: ${c}`);

// --- ejecuta comportamiento: FALSE ---
const behavior = [
  'dotnet test building-blocks/tests/Ubp.Architecture.ConformanceTests --filter FullyQualifiedName~TenantIsolation',
  'test -f stryker-config.json && dotnet test --filter Stryker', // tiene un ejecutor -> NO solo-presencia (lo caza el lint de fuente)
  'grep -rln ": DbContext" ubp-*-service | wc -l', // source-scan: conservador, no lo tratamos como presencia
  'curl -I http://127.0.0.1:8090/dashboard',
  'tools/smoke-f8.sh',
  'python3 -c "assert 1==1"',
  '', // sin comando: no aplica
];
for (const c of behavior) assert.strictEqual(isPresenceOnlyCommand(c), false, `NO debería ser solo-presencia: ${c}`);

// --- integración con hasScopeProof: un infra-proof solo-presencia NO otorga Alcance ---
const gov = { decisions: [{ id: 'DP-12', grants: 'infra-scope-proof', state: 'signed' }] };
const base = { infra: true, status: { decision: 'ACEPTADA' } };
assert.strictEqual(
  hasScopeProof({ ...base, evidence: [{ kind: 'gate', command: 'bash -n tools/x.sh && test -x tools/x.sh' }] }, gov),
  false, 'un gate solo-presencia NO debe contar como prueba de Alcance');
assert.strictEqual(
  hasScopeProof({ ...base, evidence: [{ kind: 'integration', command: 'dotnet test --filter Real' }] }, gov),
  true, 'un integration que ejecuta un test SÍ cuenta');

console.log('Presence-only smoke test OK');
