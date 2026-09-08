'use strict';

// `capa thread` en el marco del workspace — dos defectos que dejó el pase al grafo de la raíz.
//
// 1) DAÑO COLATERAL (hallazgo 4). `topService()` toma el PRIMER segmento del path, y en el marco del
//    workspace ese segmento es siempre el nombre del repo. El radio de impacto colapsaba: medido en
//    ADR-0011/cuenta-segmentada-y-dimension-bodega, «Lo necesitan» pasó de nombrar los servicios a un
//    único «← btw-ubp-backend», que no dice nada. Hay que sacar el offset del marco antes de partir.
//
// 2) VEREDICTO FRÁGIL (hallazgo 8). thread medía la cobertura con las rutas de UN objetivo (1-9), que
//    es justo lo que doctor.js documenta como frágil: con 2 rutas, una legítimamente muerta hunde la
//    cobertura al 50 % y un grafo bueno puede declararse marco equivocado. El marco es una propiedad
//    del GRAFO, no del objetivo: se mide contra el corpus, como `capa doctor`.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runThread } = require('../lib/thread');

const ADR = 'ADR-0011-contabilidad-gl';
const OBJ = 'cuenta-segmentada';

// workspace/                     <- marco del grafo
//   graphify-out/                   source_file = 'backend/…' y 'ubp-app/…'
//   backend/                     <- raíz CAPA (offset = 'backend')
//     capa/<ADR>/<OBJ>/            route: ['ubp-ledger-service/src']
//     capa/<ADR>/otro/             route: ['ubp-inexistente/src']  (ruta muerta del corpus)
function scaffold() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-thread-frame-'));
  const root = path.join(ws, 'backend');

  const nodes = [
    { id: 'ledger', source_file: 'backend/ubp-ledger-service/src/JournalEntry.cs' },
    { id: 'audit', source_file: 'backend/ubp-audit-service/src/AuditTrail.cs' },
    { id: 'tax', source_file: 'backend/ubp-tax-service/src/TaxCalculationService.cs' },
    { id: 'bff', source_file: 'backend/ubp-bff/src/Endpoints.cs' },
    { id: 'front', source_file: 'ubp-app/src/app/features/gl/gl.page.ts' },
  ];
  const links = [
    { source: 'audit', target: 'ledger', relation: 'imports' },
    { source: 'tax', target: 'ledger', relation: 'calls' },
    { source: 'bff', target: 'ledger', relation: 'imports' },
    { source: 'front', target: 'ledger', relation: 'imports_from' },
    { source: 'ledger', target: 'tax', relation: 'imports' },
  ];
  fs.mkdirSync(path.join(ws, 'graphify-out'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'graphify-out', 'graph.json'), JSON.stringify({ nodes, links, built_at_commit: 'abc' }));
  const index = {};
  for (const n of nodes) index[n.source_file] = { mtime: 1, ast_hash: 'x', semantic_hash: '' };
  fs.writeFileSync(path.join(ws, 'graphify-out', 'manifest.json'), JSON.stringify(index));

  const escribir = (slug, route) => {
    const d = path.join(root, 'capa', ADR, slug);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({
      parentAdr: ADR, objetivo: slug, lifecycle: 'wip',
      status: { decision: 'PROPUESTA', implementation: 'PARTIAL', verified_against: null },
      route, slices: [], anchors: [], evidence: [], decisions: [],
    }));
  };
  escribir(OBJ, ['ubp-ledger-service/src']);
  // Nueve rutas muertas: si el veredicto se tomara con las rutas de ESTE objetivo, `capa thread` sobre
  // él saldría con cobertura 0/9 y mataría la corrida. Contra el corpus, 1 de 10 alcanza el umbral.
  escribir('otro', Array.from({ length: 9 }, (_, i) => `ubp-inexistente-${i}/src`));

  const config = { project: 'backend', dossierDir: 'capa', graph: '../graphify-out/graph.json' };
  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify(config));
  return { ws, root, config };
}

// `die()` deja `process.exitCode = 1` además de tirar el centinela: si no se restaura, ESTE test
// termina en 1 aunque haya pasado, y en la cadena de `npm test` los que siguen no llegan a correr.
function captura(fn) {
  const salida = [];
  const log = console.log, error = console.error;
  const prev = process.exitCode === undefined ? 0 : process.exitCode;
  console.log = (...a) => salida.push(a.join(' '));
  console.error = (...a) => salida.push(a.join(' '));
  try { fn(); } finally { console.log = log; console.error = error; process.exitCode = prev; }
  return salida.join('\n');
}

// 1. El radio de impacto nombra SERVICIOS, no el repo.
{
  const { root, config } = scaffold();
  const texto = captura(() => runThread({ root, config, adr: ADR, objetivo: OBJ }));

  assert.ok(!/[←→] backend\b/.test(texto), `el nombre del repo no es una unidad de impacto:\n${texto}`);
  for (const svc of ['ubp-audit-service', 'ubp-tax-service', 'ubp-bff']) {
    assert.ok(new RegExp(`← ${svc}\\b`).test(texto), `«Lo necesitan» debe nombrar ${svc}:\n${texto}`);
  }
  // Un repo hermano no lleva el prefijo del marco: su primer segmento SÍ es la unidad correcta.
  assert.ok(/← ubp-app\b/.test(texto), `un repo hermano conserva su nombre:\n${texto}`);
  assert.ok(/→ ubp-tax-service\b/.test(texto), `«Depende de» también se desagrega:\n${texto}`);
  // La route casa por el offset del marco (`backend/ubp-ledger-service/src`), no por el nombre
  // literal: si no casara, no habría nodos en ruta y todo lo de arriba saldría vacío.
  assert.ok(/1 nodos en ruta/.test(texto), `la route tiene que casar contra el marco del grafo:\n${texto}`);
}

// 2. El veredicto de marco se toma contra el CORPUS: las 9 rutas muertas del objetivo vecino no matan
//    la corrida de éste, cuya única route sí está en el grafo.
{
  const { root, config } = scaffold();
  const texto = captura(() => runThread({ root, config, adr: ADR, objetivo: OBJ }));
  assert.ok(/Hilado CAPA/.test(texto), `thread tiene que correr:\n${texto}`);
  assert.ok(!/no indexa el árbol/.test(texto), `y no declarar marco equivocado:\n${texto}`);
}

// 3. Un grafo que de verdad es de otro árbol sigue matando la corrida: la robustez del veredicto no
//    es una amnistía.
{
  const { ws, root, config } = scaffold();
  const ajeno = { nodes: [{ id: 'x', source_file: 'otro-arbol/Nada.cs' }], links: [] };
  fs.writeFileSync(path.join(ws, 'graphify-out', 'graph.json'), JSON.stringify(ajeno));
  fs.writeFileSync(path.join(ws, 'graphify-out', 'manifest.json'), JSON.stringify({ 'otro-arbol/Nada.cs': { mtime: 1 } }));
  let murio = false;
  // `die` imprime y después corta con un centinela: el porqué está en la salida, no en el error.
  const texto = captura(() => {
    try { runThread({ root, config, adr: ADR, objetivo: OBJ }); } catch { murio = true; }
  });
  assert.ok(murio, `un grafo de otro árbol debe cortar el hilado:\n${texto}`);
  assert.ok(/no indexa el árbol que los CAPA nombran/.test(texto), `y decir por qué:\n${texto}`);
  assert.ok(/rutas del corpus/.test(texto), `nombrando que la medición es del corpus:\n${texto}`);
  assert.ok(!/Hilado CAPA/.test(texto), `sin hilar dependencias inventadas:\n${texto}`);
}

console.log('Thread frame (radio de impacto por servicio · veredicto por corpus) smoke test OK');
