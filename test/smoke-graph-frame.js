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

const { chooseGraph, graphFrameOffset } = require('../lib/graph');
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

// 3b. REGRESIÓN del propio arreglo: un candidato SIN `manifest.json` hermano no es peor que uno
//     medible con cobertura CERO. Montaje: el grafo del config es el BUENO pero le falta el índice
//     (grafo viejo o copiado a mano) y convive con un `../graphify-out` ajeno que sí lo tiene. El
//     ajeno ganaba la medición con 0/1, el veredicto salía 'mismatch' y el doctor abortaba con exit 2
//     sin correr — un caso que ANDABA antes de que el grafo se eligiera por cobertura.
{
  const { ws, root, config } = scaffold({ localIndexa: true });
  fs.rmSync(path.join(root, 'graphify-out', 'manifest.json'));           // el bueno, sin índice
  writeGraph(path.join(ws, 'graphify-out'), ['otro-arbol/Nada.cs']);     // el ajeno, medible en 0

  const choice = chooseGraph({ root, configGraph: config.graph, routeEntries: [ROUTE] });
  assert.strictEqual(choice.verdict, 'unmeasured', 'no se puede pesar ≠ pesa cero');
  assert.strictEqual(choice.path, path.join(root, 'graphify-out', 'graph.json'),
    'se cae al candidato no medible de mayor prioridad (el del config), no al ajeno que mide 0');
  assert.ok(choice.bestMeasured && choice.bestMeasured.covered === 0,
    'se conserva lo que sí se pudo pesar para poder explicar el fallback');

  const { texto, code } = captura(() => runDoctor({ root, config, onlyAdr: ADR }));
  assert.ok(!/MARCO EQUIVOCADO/.test(texto), `no debe abortar: el grafo del config puede ser el correcto:\n${texto}`);
  assert.ok(!/✗ \[E8\]/.test(texto), `y con él la route casa, así que no hay E8:\n${texto}`);
  assert.ok(/ningún grafo con manifest\.json hermano cubre/.test(texto), `pero debe AVISAR el fallback:\n${texto}`);
  assert.ok(!code, `el doctor tiene que correr (exit ${code})`);
}

// 3c. Cuando SÍ se aborta por marco equivocado y al grafo del config le falta el índice hermano, la
//     causa se dice en la Acción: `graphify update .` sobre el árbol equivocado no arregla nada.
{
  const { ws, root, config } = scaffold({ localIndexa: false });
  fs.rmSync(path.join(root, 'graphify-out', 'manifest.json'));
  fs.rmSync(path.join(ws, 'graphify-out'), { recursive: true, force: true });
  const { texto, code } = captura(() => runDoctor({ root, config, onlyAdr: ADR }));
  // Único candidato y no medible ⇒ 'unmeasured', que es lo correcto: no hay con qué comparar.
  assert.ok(!/MARCO EQUIVOCADO/.test(texto), `con un solo candidato no medible no hay veredicto de marco:\n${texto}`);
  assert.strictEqual(code, 1, 'corre y bloquea por el E8 real (la route no está ni en disco ni en ese grafo)');
  assert.ok(/✗ \[E8\]/.test(texto), `el hallazgo real sí sale:\n${texto}`);
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

// 5. `graphify-out` como SYMLINK al del checkout principal — la forma real de un bundle de worktrees.
//    El marco tiene que salir del ENLACE (la carpeta del worktree), no del realpath: resolviendo el
//    enlace, `path.relative` contra la raíz CAPA del worktree arranca con `..`, el offset sale null y
//    todo el mecanismo de marco queda muerto. Medido en cc-sucursal-bodega: los DOS candidatos daban
//    null, así que `routeCandidatesInFrame` degeneraba en `routeCandidates`.
{
  const principal = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-frame-main-'));
  writeGraph(path.join(principal, 'graphify-out'), [`btw-ubp-backend/${ROUTE}/JournalEntry.cs`]);

  // El worktree se llama distinto que el repo dentro del grafo: es lo que `routeCandidates` no
  // puede adivinar por el nombre de la carpeta.
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-frame-wt-'));
  fs.symlinkSync(path.join(principal, 'graphify-out'), path.join(wt, 'graphify-out'), 'dir');
  const root = path.join(wt, 'cc-sucursal-bodega');
  const dossier = path.join(root, 'capa', ADR, OBJ);
  fs.mkdirSync(dossier, { recursive: true });
  const config = { project: 'cc-sucursal-bodega', dossierDir: 'capa', graph: '../graphify-out/graph.json' };
  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify(config));
  for (const d of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
    fs.writeFileSync(path.join(dossier, `${d}.md`), `# ${d}\n`);
  }
  fs.writeFileSync(path.join(dossier, 'manifest.json'), JSON.stringify({
    parentAdr: 'ADR-0011', objetivo: OBJ, lifecycle: 'wip',
    status: { decision: 'PROPUESTA', implementation: 'NONE', verified_against: null },
    route: [ROUTE], slices: [], anchors: [], evidence: [], decisions: [],
  }));

  const graphPath = path.join(root, '..', 'graphify-out', 'graph.json');
  assert.strictEqual(graphFrameOffset(graphPath, root), 'cc-sucursal-bodega',
    'el marco sale del enlace (la carpeta del worktree), no del realpath del checkout principal');

  // La route sólo casa por el offset: el grafo la indexa bajo `btw-ubp-backend/` y la carpeta se
  // llama `cc-sucursal-bodega/`, así que `routeCandidates` genera el prefijo equivocado.
  const choice = chooseGraph({ root, configGraph: config.graph, routeEntries: [ROUTE] });
  assert.strictEqual(choice.offset, 'cc-sucursal-bodega', `offset del marco: ${choice.offset}`);
}

console.log('Graph frame (marco del grafo ↔ rutas de los CAPA) smoke test OK');
