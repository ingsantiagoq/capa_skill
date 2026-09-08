'use strict';

// [E8] juzga el DISCO, no la cobertura de graphify.
//
// Regresión real (BTW UBP · ADR-0025, medido 2026-09-06): de 22 rutas que el doctor marcaba
// «stale», 19 apuntaban a archivos que existen. graphify no emite nodos para `.proto` ni `.yml`
// (0 de cada uno en el grafo de la raíz) ni para los `.seed.json` bajo `Catalogs/`, así que una
// route a un proto o a un compose no podía tener nodos NUNCA y bloqueaba por construcción —
// 5 objetivos trabados sin que a sus manifests les faltara nada.
//
// Este test fija las tres respuestas: existe en disco => pasa · sólo en el grafo => pasa ·
// en ninguno => sigue siendo BLOCKER (el caso stale de verdad no se tapa).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { lintCapa } = require('../lib/doctor');

const ADR = 'ADR-0025-pos';
const OBJ = 'route-en-disco';

// workspace/            <- raíz del GRAFO
//   backend/            <- raíz CAPA
//     ubp-protos/pos/   <- existe en disco, CERO nodos (graphify no indexa .proto)
//   ubp-app/src/        <- otro repo del workspace: se nombra desde la raíz del GRAFO
function scaffold() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-route-disk-'));
  const root = path.join(ws, 'backend');
  const dossier = path.join(root, 'capa', ADR, OBJ);
  fs.mkdirSync(dossier, { recursive: true });
  fs.mkdirSync(path.join(root, 'ubp-protos/pos'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'ubp-app/src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ubp-protos/pos/pos.proto'), 'syntax = "proto3";\n');
  fs.writeFileSync(path.join(ws, 'ubp-app/src/app.ts'), '// test\n');
  for (const d of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
    fs.writeFileSync(path.join(dossier, `${d}.md`), `# ${d}\n`);
  }
  return { ws, root, dossier };
}

function writeManifest(dossier, route) {
  fs.writeFileSync(path.join(dossier, 'manifest.json'), JSON.stringify({
    parentAdr: ADR, objetivo: OBJ, lifecycle: 'wip',
    status: { decision: 'PROPUESTA', implementation: 'NONE', verified_against: null },
    route, slices: [], anchors: [], evidence: [], decisions: [],
  }));
}

// Un grafo que SÓLO conoce un .cs del backend: ni el proto ni el front tienen nodos,
// que es exactamente lo que pasa con el grafo real.
const graph = {
  path: null,
  nodes: () => [{ id: 'n1', source_file: 'backend/ubp-ar-service/src/ArInvoice.cs' }],
  has: () => false,
};

const e8 = (findings) => findings.filter((f) => f.code === 'E8' && f.sev === 'BLOCKER');

// 1) Route a un directorio de protos: existe en disco, cero nodos => NO bloquea.
{
  const { root, dossier } = scaffold();
  writeManifest(dossier, ['ubp-protos/pos']);
  assert.deepStrictEqual(e8(lintCapa(dossier, graph, null, root)), [],
    'una route que existe en disco no es stale aunque graphify no la indexe');
}

// 2) Route a OTRO repo del workspace, nombrada desde la raíz del grafo => NO bloquea.
//    Es la forma en que se escriben las rutas que cruzan repos (`ubp-app/…`).
{
  const { root, dossier } = scaffold();
  writeManifest(dossier, ['ubp-app/src']);
  assert.deepStrictEqual(e8(lintCapa(dossier, graph, null, root)), [],
    'una route desde la raíz del grafo se resuelve contra la raíz del grafo');
}

// 3) La misma, escrita con `../` desde la raíz CAPA => NO bloquea.
{
  const { root, dossier } = scaffold();
  writeManifest(dossier, ['../ubp-app/src']);
  assert.deepStrictEqual(e8(lintCapa(dossier, graph, null, root)), [],
    'la forma con ../ nombra el mismo directorio y debe pasar igual');
}

// 4) Route que NO está en disco pero SÍ en el grafo (artefacto generado) => NO bloquea.
{
  const { root, dossier } = scaffold();
  writeManifest(dossier, ['ubp-ar-service/src']);
  assert.deepStrictEqual(e8(lintCapa(dossier, graph, null, root)), [],
    'el grafo sigue valiendo como prueba de existencia');
}

// 5) Route que no está en ningún lado => SIGUE siendo BLOCKER. Es el caso que E8 protege.
{
  const { root, dossier } = scaffold();
  writeManifest(dossier, ['ubp-inexistente/src/Nada']);
  const f = e8(lintCapa(dossier, graph, null, root));
  assert.strictEqual(f.length, 1, 'una route que no existe ni en disco ni en el grafo debe bloquear');
  assert.ok(/ubp-inexistente/.test(f[0].msg), `el mensaje debe nombrar la route: ${f[0].msg}`);
}

// 6) Un archivo NO es un directorio, pero sigue existiendo: tampoco es stale.
{
  const { root, dossier } = scaffold();
  writeManifest(dossier, ['ubp-protos/pos/pos.proto']);
  assert.deepStrictEqual(e8(lintCapa(dossier, graph, null, root)), [],
    'una route a un archivo concreto que existe no es stale');
}

// 7) Sin `root` (llamadas viejas de 3 args) el disco no se puede resolver y manda el grafo:
//    la ruta del backend pasa por nodos, la inexistente sigue bloqueando.
{
  const { dossier } = scaffold();
  writeManifest(dossier, ['backend/ubp-ar-service/src']);
  assert.deepStrictEqual(e8(lintCapa(dossier, graph, null)), [],
    'sin root, una route con nodos sigue pasando');

  const otro = scaffold();
  writeManifest(otro.dossier, ['ubp-protos/pos']);
  assert.strictEqual(e8(lintCapa(otro.dossier, graph, null)).length, 1,
    'sin root no hay disco que consultar: se comporta como antes');
}

console.log('Doctor E8 route-on-disk smoke test OK');
