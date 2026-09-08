'use strict';

// El estado INTERMEDIO entre 'ok' y 'MARCO EQUIVOCADO'.
//
// El veredicto de marco se toma por CORPUS y con un umbral bien bajo (FRAME_COVERAGE_MIN_RATIO = 0,1),
// así que sólo caza el caso catastrófico. El caso REAL medido en el bundle cc-sucursal-bodega es otro:
// el grafo local del backend cubre 1388/1645 rutas — 84,4 %, muy por encima del umbral — el veredicto
// sale 'ok', y los objetivos que viven en las otras 257 rutas siguen cosechando [E4]/[E6]/[E7] falsos
// SIN UN SOLO AVISO. La medición «8/8 vs 0/8» que justifica el umbral es POR OBJETIVO; el veredicto se
// toma por corpus, y en esa brecha se esconde el falso positivo.
//
// El arreglo pregunta por GEOMETRÍA y por objetivo: si la route resuelve a un absoluto que no está bajo
// ninguna raíz del marco del grafo, ese grafo no puede opinar sobre las anclas de ese objetivo, y sus
// [E4]/[E6]/[E7] bajan a aviso SOSPECHOSO en vez de bloquear.
//
// Medido sobre el corpus real (1651 CAPAs, grafo equivocado a propósito): 1491 bloqueos → 686, con 390
// hallazgos degradados a SOSPECHOSO en 115 objetivos.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { lintCapa } = require('../lib/doctor');
const { graphFrameRoots } = require('../lib/graph');

const ADR = 'ADR-0011-contabilidad-gl';

// workspace/                  <- contiene los dos repos
//   graphify-out/graph.json      (marco = workspace)
//   backend/                  <- raíz CAPA
//     graphify-out/graph.json    (marco = backend: NO ve ubp-app/)
//     capa/<ADR>/<obj>/
//   ubp-app/src/app/features/gl/
function scaffold(objetivo, manifest) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-suspect-'));
  const root = path.join(ws, 'backend');
  const dossier = path.join(root, 'capa', ADR, objetivo);
  fs.mkdirSync(dossier, { recursive: true });
  fs.mkdirSync(path.join(root, 'ubp-ledger-service/src/Ubp.Ledger.Domain'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'ubp-app/src/app/features/gl'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ubp-ledger-service/src/Ubp.Ledger.Domain/JournalEntry.cs'), '// x\n');
  fs.writeFileSync(path.join(ws, 'ubp-app/src/app/features/gl/gl-journal-list.page.ts'), '// x\n');
  for (const d of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
    fs.writeFileSync(path.join(dossier, `${d}.md`), `# ${d}\n`);
  }
  fs.writeFileSync(path.join(dossier, 'manifest.json'), JSON.stringify({
    parentAdr: ADR, objetivo, lifecycle: 'wip',
    status: { decision: 'PROPUESTA', implementation: 'PARTIAL', verified_against: null },
    slices: [], evidence: [], decisions: [], ...manifest,
  }));
  // El grafo del backend: existe en disco para que `graphFrameRoots` lo enmarque en `backend/`.
  fs.mkdirSync(path.join(root, 'graphify-out'), { recursive: true });
  fs.writeFileSync(path.join(root, 'graphify-out', 'graph.json'), '{}');
  return { ws, root, dossier };
}

// Grafo del BACKEND: conoce lo suyo y nada de ubp-app. `has()` responde por el ancla del backend.
function grafoDelBackend(root) {
  const gp = path.join(root, 'graphify-out', 'graph.json');
  return {
    path: gp,
    frames: graphFrameRoots(gp),
    graph: {
      path: gp,
      nodes: () => [{ id: 'ledger_journalentry', source_file: 'ubp-ledger-service/src/Ubp.Ledger.Domain/JournalEntry.cs' }],
      has: (id) => id === 'ledger_journalentry',
    },
  };
}

const sev = (findings, code) => findings.filter((f) => f.code === code).map((f) => f.sev);

// 1. Objetivo que vive FUERA del marco: sus [E4]/[E7] bajan a SOSPECHOSO, y se dice por qué.
{
  const { root, dossier } = scaffold('gl-front', {
    route: ['ubp-app/src/app/features/gl'],
    anchors: [{ id: 'gl_journal_list_page', label: 'GlJournalListPage' }],
  });
  const { graph, frames } = grafoDelBackend(root);
  const f = lintCapa(dossier, graph, null, root, { routeOffset: '', frameRoots: frames });

  assert.deepStrictEqual(sev(f, 'E4'), ['WARN'], `[E4] no puede BLOQUEAR con un grafo que no ve el árbol:\n${JSON.stringify(f, null, 1)}`);
  assert.deepStrictEqual(sev(f, 'E7'), ['WARN'], '[E7] deriva de las mismas anclas: misma degradación');
  assert.ok(f.some((x) => x.code === 'E4' && /SOSPECHOSO/.test(x.msg)), 'el hallazgo debe decir que es sospechoso');
  assert.ok(f.some((x) => x.code === 'E4' && /ubp-app\/src\/app\/features\/gl/.test(x.msg)), 'y nombrar la route que lo causa');
  assert.ok(f.some((x) => x.code === 'E8' && x.sev === 'WARN' && /fuera del marco del grafo/.test(x.msg)),
    'y debe salir el aviso de marco del objetivo');
  assert.ok(!f.some((x) => x.sev === 'BLOCKER'), `nada debe bloquear en este objetivo:\n${JSON.stringify(f, null, 1)}`);
}

// 2. Objetivo que vive DENTRO del marco: la deriva real sigue siendo BLOQUEO. Sin esto la sospecha
//    sería una amnistía general y el gate dejaría de servir.
{
  const { root, dossier } = scaffold('gl-backend', {
    route: ['ubp-ledger-service/src/Ubp.Ledger.Domain'],
    anchors: [{ id: 'ancla_que_ya_no_existe', label: 'JournalEntryViejo' }],
  });
  const { graph, frames } = grafoDelBackend(root);
  const f = lintCapa(dossier, graph, null, root, { routeOffset: '', frameRoots: frames });
  assert.deepStrictEqual(sev(f, 'E4'), ['BLOCKER'], `la deriva dentro del marco sigue bloqueando:\n${JSON.stringify(f, null, 1)}`);
  assert.ok(!f.some((x) => x.code === 'E8'), 'la route existe y está en el marco: ni bloqueo ni aviso');
}

// 3. La sospecha NO se compra con una route inventada: para degradar, la route tiene que EXISTIR en el
//    disco fuera del marco. Una que no existe bloquea por [E8] y no degrada nada.
{
  const { root, dossier } = scaffold('route-inventada', {
    route: ['ubp-inexistente/src'],
    anchors: [{ id: 'ancla_que_ya_no_existe', label: 'X' }],
  });
  const { graph, frames } = grafoDelBackend(root);
  const f = lintCapa(dossier, graph, null, root, { routeOffset: '', frameRoots: frames });
  assert.deepStrictEqual(sev(f, 'E4'), ['BLOCKER'], 'una route inventada no compra amnistía para [E4]');
  assert.ok(f.some((x) => x.code === 'E8' && x.sev === 'BLOCKER'), 'y además bloquea por [E8]');
}

// 4. Route escrita desde la raíz de OTRO repo del workspace: sigue siendo BLOQUEO (esa forma es
//    ambigua — cualquier repo tiene un `src/`) pero el mensaje deja de ser un callejón sin salida.
//    Caso real: ADR-0011/asiento-manual-empresarial.
{
  const { root, dossier } = scaffold('tercera-raiz', {
    route: ['src/app/features/gl/gl-journal-list.page.ts'],
    anchors: [],
  });
  const { graph, frames } = grafoDelBackend(root);
  const f = lintCapa(dossier, graph, null, root, { routeOffset: '', frameRoots: frames });
  const e8 = f.filter((x) => x.code === 'E8' && x.sev === 'BLOCKER');
  assert.strictEqual(e8.length, 1, `una route que no resuelve desde ninguna raíz conocida sigue bloqueando:\n${JSON.stringify(f, null, 1)}`);
  assert.ok(/existe bajo ubp-app\//.test(e8[0].msg), `el mensaje debe decir dónde está: ${e8[0].msg}`);
  assert.ok(/ubp-app\/src\/app\/features\/gl\/gl-journal-list\.page\.ts/.test(e8[0].msg),
    `y proponer la forma corregida: ${e8[0].msg}`);
}

// 5. Sin `frameRoots` (llamadas viejas) no hay geometría que consultar: se comporta como antes.
{
  const { root, dossier } = scaffold('sin-marco', {
    route: ['ubp-app/src/app/features/gl'],
    anchors: [{ id: 'ancla_que_ya_no_existe', label: 'X' }],
  });
  const graph = { nodes: () => [], has: () => false };
  const f = lintCapa(dossier, graph, null, root);
  assert.deepStrictEqual(sev(f, 'E4'), ['BLOCKER'], 'sin marco declarado no se degrada nada');
}

console.log('Doctor frame-suspect (el estado intermedio entre ok y marco equivocado) smoke test OK');
