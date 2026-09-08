'use strict';

// Marco de coordenadas del grafo — el gate mintiendo en dirección PESIMISTA.
//
// Regresión real (BTW UBP, 2026-09-07): `capa.config.json` del backend pasó a apuntar al grafo LOCAL
// del repo, que no indexa `ubp-app/…` ni `ubp-protos/…` y cuyas rutas están enmarcadas desde el repo y
// no desde el workspace. `resolveGraphPath` elegía ese grafo por existir, sin mirar si servía, y cada
// objetivo cosechaba [E4] "drift" y [E8] "stale" FALSOS: ciertos sobre el grafo, falsos sobre el código.
// Medido: 8/8 rutas del objetivo existen en el grafo del workspace y 0/8 en el local.
//
// Este test fija las tres conductas del arreglo: (1) se elige el grafo que CUBRE, no el que existe;
// (2) si ninguno cubre se emite UN error de marco en vez de la pared de hallazgos; (3) un clon suelto,
// donde el grafo bueno es el local, sigue funcionando sin editar el config.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { chooseGraph } = require('../lib/graph');
const { runDoctor, lintCapa } = require('../lib/doctor');

const ADR = 'ADR-0011-contabilidad-gl';
const OBJ = 'cuenta-segmentada-y-dimension-bodega';
const ROUTE = 'ubp-ledger-service/src/Ubp.Ledger.Domain';

function writeGraph(dir, sourceFiles) {
  fs.mkdirSync(dir, { recursive: true });
  const nodes = sourceFiles.map((f, i) => ({ id: `n${i}`, source_file: f }));
  fs.writeFileSync(path.join(dir, 'graph.json'), JSON.stringify({ nodes, links: [], built_at_commit: 'deadbeef' }));
  // El índice hermano que escribe `graphify update`: ruta → {mtime, ast_hash}.
  const index = {};
  for (const f of sourceFiles) index[f] = { mtime: 1, ast_hash: 'x', semantic_hash: '' };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(index));
}

// workspace/                       <- árbol que los CAPA nombran (grafo BUENO)
//   graphify-out/                     source_file = 'backend/ubp-ledger-service/...'
//   backend/                       <- raíz CAPA
//     capa.config.json                graph: 'graphify-out/graph.json'  (el LOCAL, de otro árbol)
//     graphify-out/                   source_file = 'ubp-otro-repo/...'
//     capa/<ADR>/<OBJ>/manifest.json  route: ['ubp-ledger-service/src/Ubp.Ledger.Domain']
function scaffold({ localIndexa }) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-graph-frame-'));
  const root = path.join(ws, 'backend');
  const dossier = path.join(root, 'capa', ADR, OBJ);
  fs.mkdirSync(dossier, { recursive: true });

  const config = { project: 'backend', dossierDir: 'capa', graph: 'graphify-out/graph.json' };
  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify(config));
  for (const d of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
    fs.writeFileSync(path.join(dossier, `${d}.md`), `# ${d}\n`);
  }
  fs.writeFileSync(path.join(dossier, 'manifest.json'), JSON.stringify({
    parentAdr: 'ADR-0011', objetivo: OBJ, lifecycle: 'wip',
    status: { decision: 'PROPUESTA', implementation: 'NONE', verified_against: null },
    route: [ROUTE], slices: [], anchors: [], evidence: [], decisions: [],
  }));

  writeGraph(path.join(ws, 'graphify-out'), [`backend/${ROUTE}/JournalEntry.cs`]);
  writeGraph(path.join(root, 'graphify-out'), [localIndexa ? `${ROUTE}/JournalEntry.cs` : 'ubp-otro-repo/Nada.cs']);
  return { ws, root, config, dossier };
}

function captura(fn) {
  const salida = [];
  const log = console.log, error = console.error;
  const prev = process.exitCode;
  console.log = (...a) => salida.push(a.join(' '));
  console.error = (...a) => salida.push(a.join(' '));
  process.exitCode = 0;
  try { fn(); } finally {
    console.log = log; console.error = error;
    var code = process.exitCode;
    process.exitCode = prev;
  }
  return { texto: salida.join('\n'), code };
}

// 1. Bundle multi-sesión: el config apunta al grafo local (0 cobertura) y se elige el del workspace.
{
  const { root, config, dossier } = scaffold({ localIndexa: false });
  const choice = chooseGraph({ root, configGraph: config.graph, routeEntries: [ROUTE] });
  assert.strictEqual(choice.verdict, 'ok', 'el grafo del workspace cubre la route: no es marco equivocado');
  assert.strictEqual(choice.covered, 1);
  assert.strictEqual(choice.offset, 'backend', 'la raíz CAPA aparece bajo `backend/` dentro del grafo elegido');
  assert.strictEqual(choice.fromConfig, false, 'no es el grafo del config: se auto-corrigió por cobertura');

  const { texto, code } = captura(() => runDoctor({ root, config, onlyAdr: ADR }));
  assert.ok(!/\[E8\]/.test(texto), `no debería haber E8 falso con el grafo que sí cubre:\n${texto}`);
  assert.ok(/cobertura 1\/1 rutas/.test(texto), `el encabezado debe declarar la cobertura medida:\n${texto}`);
  assert.ok(!code, `doctor no debería bloquear por marco cuando el grafo cubre (exit ${code})`);
  assert.ok(fs.existsSync(dossier));
}

// 2. Ningún candidato cubre: UN error de marco, cero hallazgos por objetivo.
{
  const { ws, root, config } = scaffold({ localIndexa: false });
  fs.rmSync(path.join(ws, 'graphify-out'), { recursive: true, force: true });
  const choice = chooseGraph({ root, configGraph: config.graph, routeEntries: [ROUTE] });
  assert.strictEqual(choice.verdict, 'mismatch');

  const { texto, code } = captura(() => runDoctor({ root, config, onlyAdr: ADR }));
  assert.ok(/MARCO EQUIVOCADO/.test(texto), `debe gritar el marco una sola vez:\n${texto}`);
  assert.ok(!/✗ \[E[48]\]/.test(texto), `no debe emitir hallazgos falsos por objetivo:\n${texto}`);
  assert.ok(/graphify update \./.test(texto), 'el mensaje debe decir la acción concreta');
  assert.strictEqual(code, 2, 'marco equivocado es setup roto (2), no MODO BLOQUEO (1)');
}

// 3. Clon suelto: el grafo bueno es el local y el config gana, sin editar nada.
{
  const { ws, root, config } = scaffold({ localIndexa: true });
  fs.rmSync(path.join(ws, 'graphify-out'), { recursive: true, force: true });
  const choice = chooseGraph({ root, configGraph: config.graph, routeEntries: [ROUTE] });
  assert.strictEqual(choice.verdict, 'ok');
  assert.strictEqual(choice.offset, '', 'el grafo local enmarca la raíz CAPA misma');
  assert.strictEqual(choice.fromConfig, true);

  const { texto, code } = captura(() => runDoctor({ root, config, onlyAdr: ADR }));
  assert.ok(!/\[E8\]/.test(texto), `el clon suelto no debe ver E8:\n${texto}`);
  assert.ok(!code, `exit ${code}`);
}

// 4. El offset del marco casa la route aunque la carpeta raíz se llame distinto que en el grafo
//    (worktree `cc-sucursal-bodega/` con el grafo que la indexa como `btw-ubp-backend/`): es el caso
//    que `routeCandidates` no puede resolver porque adivina el prefijo por el nombre de la carpeta.
{
  const { dossier, root } = scaffold({ localIndexa: false });
  const graph = { nodes: () => [{ id: 'n0', source_file: `btw-ubp-backend/${ROUTE}/JournalEntry.cs` }], has: () => false };
  const sinOffset = lintCapa(dossier, graph, null, root);
  assert.ok(sinOffset.some((f) => f.code === 'E8' && f.sev === 'BLOCKER'), 'sin marco, la route no casa');
  const conOffset = lintCapa(dossier, graph, null, root, { routeOffset: 'btw-ubp-backend' });
  assert.strictEqual(conOffset.filter((f) => f.code === 'E8' && f.sev === 'BLOCKER').length, 0,
    'con el marco del grafo, la misma route casa');
}

console.log('Graph frame (marco del grafo ↔ rutas de los CAPA) smoke test OK');
