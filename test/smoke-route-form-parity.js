'use strict';

// Paridad de forma de `route` entre el edit-guard y `capa doctor`.
//
// Regresión real (BTW UBP, 2026-08-04): `capa.config.json` del backend apunta
// `"graph": "../graphify-out/graph.json"`, así que la raíz del grafo es el PADRE
// de la raíz CAPA y los `source_file` vienen como `btw-ubp-backend/...`.
// Consecuencia: con la route prefijada doctor quedaba verde y el guard bloqueaba
// TODOS los archivos del objetivo; con la route sin prefijo pasaba lo contrario.
// Las dos formas conviven en los manifests del repo.
//
// Este test fija que AMBAS formas funcionen en AMBOS lados.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { evaluate } = require('../lib/runtime/guard-manifest');
const { lintCapa } = require('../lib/doctor');
const { routeCandidates } = require('../lib/route');

const ADR = 'ADR-0036-financiamiento';
const OBJ = 'cuenta-corriente-cliente';

function scaffold() {
  // workspace/            <- raíz del GRAFO
  //   backend/            <- raíz CAPA (capa.config.json)
  //     capa/<ADR>/<OBJ>/manifest.json
  //     ubp-ar-service/src/Ubp.Ar.Domain/ArInvoice.cs
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-route-parity-'));
  const root = path.join(ws, 'backend');
  const srcDir = path.join(root, 'ubp-ar-service/src/Ubp.Ar.Domain');
  const dossier = path.join(root, 'capa', ADR, OBJ);
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(dossier, { recursive: true });
  fs.mkdirSync(path.join(root, '.capa'), { recursive: true });

  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify({
    project: 'backend', dossierDir: 'capa', graph: '../graphify-out/graph.json',
  }));
  fs.writeFileSync(path.join(srcDir, 'ArInvoice.cs'), '// test\n');
  fs.writeFileSync(path.join(root, '.capa/focus.json'), JSON.stringify({ adr: ADR, objetivo: OBJ }));
  for (const d of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
    fs.writeFileSync(path.join(dossier, `${d}.md`), `# ${d}\n`);
  }
  return { ws, root, dossier, file: path.join(srcDir, 'ArInvoice.cs') };
}

function writeManifest(dossier, route) {
  fs.writeFileSync(path.join(dossier, 'manifest.json'), JSON.stringify({
    parentAdr: 'ADR-0036', objetivo: OBJ, lifecycle: 'wip',
    status: { decision: 'PROPUESTA', implementation: 'NONE', verified_against: null },
    route, slices: [], anchors: [], evidence: [], decisions: [],
  }));
}

// Grafo falso con los source_file relativos a la raíz del GRAFO (workspace),
// que es como los emite graphify cuando el config apunta al padre.
const graph = {
  nodes: () => [{ id: 'n1', source_file: 'backend/ubp-ar-service/src/Ubp.Ar.Domain/ArInvoice.cs' }],
  has: () => false,
};

const PREFIJADA = 'backend/ubp-ar-service/src/Ubp.Ar.Domain';   // desde la raíz del grafo
const CORTA = 'ubp-ar-service/src/Ubp.Ar.Domain';               // desde la raíz CAPA

for (const [nombre, route] of [['prefijada', PREFIJADA], ['corta', CORTA]]) {
  const { root, dossier, file } = scaffold();
  writeManifest(dossier, [route]);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capa.config.json'), 'utf8'));

  const guard = evaluate({ root, config, file });
  assert.strictEqual(guard.allowed, true,
    `guard debería permitir con route ${nombre} (${route}): ${guard.reason}`);

  const findings = lintCapa(dossier, graph, null, root);
  const e8 = findings.filter((f) => f.code === 'E8' && f.sev === 'BLOCKER');
  assert.strictEqual(e8.length, 0,
    `doctor no debería dar E8 con route ${nombre} (${route}): ${JSON.stringify(e8)}`);
}

// El guard NO se ensancha: un archivo fuera de la route sigue bloqueado en ambas formas.
for (const route of [PREFIJADA, CORTA]) {
  const { root, dossier } = scaffold();
  writeManifest(dossier, [route]);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capa.config.json'), 'utf8'));
  const ajeno = path.join(root, 'ubp-ap-service/src/Ubp.Ap.Domain/VendorPayment.cs');
  fs.mkdirSync(path.dirname(ajeno), { recursive: true });
  fs.writeFileSync(ajeno, '// ajeno\n');
  const guard = evaluate({ root, config, file: ajeno });
  assert.strictEqual(guard.allowed, false, `un archivo fuera del route debe bloquearse (route ${route})`);
}

// Una route que no existe en el grafo sigue siendo E8 (no se tapa el caso stale).
{
  const { root, dossier } = scaffold();
  writeManifest(dossier, ['ubp-inexistente/src/Nada']);
  const findings = lintCapa(dossier, graph, null, root);
  assert.ok(findings.some((f) => f.code === 'E8' && f.sev === 'BLOCKER'),
    'una route sin nodos en ninguna forma debe seguir dando E8');
}

// Candidatos: equivalencia en las dos direcciones, sin duplicados.
assert.deepStrictEqual(routeCandidates('/w/backend', 'backend/x'), ['backend/x', 'x']);
assert.deepStrictEqual(routeCandidates('/w/backend', 'x'), ['x', 'backend/x']);
assert.deepStrictEqual(routeCandidates('/w/backend', 'backend'), ['backend', '.']);
assert.deepStrictEqual(routeCandidates('/w/backend', './x/'), ['x', 'backend/x']);
assert.deepStrictEqual(routeCandidates('/w/backend', ''), []);

console.log('Route form parity (guard ↔ doctor) smoke test OK');
