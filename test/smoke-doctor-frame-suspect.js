'use strict';

// El estado INTERMEDIO entre 'ok' y 'MARCO EQUIVOCADO'.
//
// El veredicto de marco se toma por CORPUS y con un umbral bien bajo (FRAME_COVERAGE_MIN_RATIO = 0,1),
// así que sólo caza el caso catastrófico. El caso REAL medido 2026-09-08 en el checkout principal es
// otro: el grafo del backend cubre 1231/1486 rutas — 82,8 %, muy por encima del umbral — el veredicto
// sale 'ok', y los objetivos que viven en las otras 255 rutas siguen cosechando [E4]/[E7] falsos.
//
// LA PREGUNTA ES DE ÍNDICE, NO DE GEOMETRÍA. La primera versión de este estado preguntaba si el
// absoluto de la route caía bajo alguna raíz de `graphFrameRoots`. Ese predicado resultó VACÍO en
// producción: `resolveRouteOnDisk` resuelve contra `diskBases`, que incluye el workspace, y el grafo
// que gana por cobertura es justamente el que enmarca el workspace — así que toda route que resuelve,
// resuelve dentro del marco. Medido sobre los dos corpus reales: 0 objetivos sospechosos de 1650
// (checkout principal) y 0 de 1651 (worktree cc-sucursal-bodega).
//
// Ahora se le pregunta al ÍNDICE del grafo (`graphify-out/manifest.json`), que es la misma fuente con
// la que el encabezado mide cobertura. Medido con el criterio nuevo sobre el mismo corpus de 1650,
// forzando el grafo del backend (el equivocado): 16 objetivos SOSPECHOSOS, entre ellos
// ADR-0043/sofia-boton-topbar-escucha-activa [E2E-VERIFIED, 2 anclas] y
// ADR-0013/centro-servicios-electronicos-ui [E2E-VERIFIED, 4 anclas] — todos viviendo entero en
// ubp-app/, ubp-infra/ o btw-ubp.admin-console/, que ese grafo no indexa. Con el grafo CORRECTO
// elegido: 0 sospechosos, que es lo que corresponde.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { lintCapa } = require('../lib/doctor');
const { graphFrameRoots, graphIndexProbe } = require('../lib/graph');

const ADR = 'ADR-0011-contabilidad-gl';

// workspace/                  <- contiene los dos repos
//   backend/                  <- raíz CAPA
//     graphify-out/graph.json    (marco = backend) + manifest.json (índice: SÓLO lo del backend)
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
  // El grafo del BACKEND, con su índice hermano: conoce lo suyo y NADA de ubp-app. Es el índice —no
  // la geometría— lo que decide si el grafo puede opinar sobre un objetivo.
  fs.mkdirSync(path.join(root, 'graphify-out'), { recursive: true });
  fs.writeFileSync(path.join(root, 'graphify-out', 'graph.json'), '{}');
  fs.writeFileSync(path.join(root, 'graphify-out', 'manifest.json'), JSON.stringify({
    'ubp-ledger-service/src/Ubp.Ledger.Domain/JournalEntry.cs': { mtime: 1, ast_hash: 'x' },
    'capa/ADR-0011-contabilidad-gl/README.md': { mtime: 1, ast_hash: 'x' },
  }));
  return { ws, root, dossier };
}

// Grafo del BACKEND: conoce lo suyo y nada de ubp-app. `has()` responde por el ancla del backend.
function grafoDelBackend(root) {
  const gp = path.join(root, 'graphify-out', 'graph.json');
  return {
    path: gp,
    frames: graphFrameRoots(gp),
    probe: graphIndexProbe(gp),
    graph: {
      path: gp,
      nodes: () => [{ id: 'ledger_journalentry', source_file: 'ubp-ledger-service/src/Ubp.Ledger.Domain/JournalEntry.cs' }],
      has: (id) => id === 'ledger_journalentry',
    },
  };
}

const sev = (findings, code) => findings.filter((f) => f.code === code).map((f) => f.sev);
const opciones = ({ frames, probe }) => ({ routeOffset: '', frameRoots: frames, indexProbe: probe });

// 1. Objetivo del que el grafo no sabe NADA: sus [E4]/[E7] bajan a SOSPECHOSO, y se dice por qué.
{
  const { root, dossier } = scaffold('gl-front', {
    route: ['ubp-app/src/app/features/gl'],
    anchors: [{ id: 'gl_journal_list_page', label: 'GlJournalListPage' }],
  });
  const g = grafoDelBackend(root);
  assert.ok(g.probe, 'el scaffold debe tener índice hermano: sin él no hay a quién preguntarle');
  const f = lintCapa(dossier, g.graph, null, root, opciones(g));

  assert.deepStrictEqual(sev(f, 'E4'), ['WARN'], `[E4] no puede BLOQUEAR con un grafo que no ve el árbol:\n${JSON.stringify(f, null, 1)}`);
  assert.deepStrictEqual(sev(f, 'E7'), ['WARN'], '[E7] deriva de las mismas anclas: misma degradación');
  assert.ok(f.some((x) => x.code === 'E4' && /SOSPECHOSO/.test(x.msg)), 'el hallazgo debe decir que es sospechoso');
  assert.ok(f.some((x) => x.code === 'E4' && /ubp-app\/src\/app\/features\/gl/.test(x.msg)), 'y nombrar la route que lo causa');
  assert.ok(f.some((x) => x.code === 'E8' && x.sev === 'WARN' && /no indexa NINGUNA de las route/.test(x.msg)),
    'y debe salir el aviso de ceguera del objetivo');
  assert.ok(!f.some((x) => x.sev === 'BLOCKER'), `nada debe bloquear en este objetivo:\n${JSON.stringify(f, null, 1)}`);
}

// 2. Objetivo que el grafo SÍ indexa: la deriva real sigue siendo BLOQUEO. Sin esto la sospecha sería
//    una amnistía general y el gate dejaría de servir.
{
  const { root, dossier } = scaffold('gl-backend', {
    route: ['ubp-ledger-service/src/Ubp.Ledger.Domain'],
    anchors: [{ id: 'ancla_que_ya_no_existe', label: 'JournalEntryViejo' }],
  });
  const g = grafoDelBackend(root);
  const f = lintCapa(dossier, g.graph, null, root, opciones(g));
  assert.deepStrictEqual(sev(f, 'E4'), ['BLOCKER'], `la deriva sobre código indexado sigue bloqueando:\n${JSON.stringify(f, null, 1)}`);
  assert.ok(!f.some((x) => x.code === 'E8'), 'la route existe y está en el índice: ni bloqueo ni aviso');
}

// 3. La sospecha NO se compra con una route inventada: para degradar, al menos una route tiene que
//    EXISTIR en el disco. Una que no existe bloquea por [E8] y no degrada nada.
{
  const { root, dossier } = scaffold('route-inventada', {
    route: ['ubp-inexistente/src'],
    anchors: [{ id: 'ancla_que_ya_no_existe', label: 'X' }],
  });
  const g = grafoDelBackend(root);
  const f = lintCapa(dossier, g.graph, null, root, opciones(g));
  assert.deepStrictEqual(sev(f, 'E4'), ['BLOCKER'], 'una route inventada no compra amnistía para [E4]');
  assert.ok(f.some((x) => x.code === 'E8' && x.sev === 'BLOCKER'), 'y además bloquea por [E8]');
}

// 4. LA REGLA ES «TODAS», NO «ALGUNA». Un objetivo con una route indexada y otra no (el caso típico:
//    una route a un `.proto`, que graphify no hashea NUNCA) NO es sospechoso — si no, la degradación
//    se dispararía en 70 de 1650 objetivos del corpus real aun con el grafo correcto elegido, y
//    aflojaría el gate justo donde el grafo sí ve el código.
{
  const { root, dossier } = scaffold('mixto', {
    route: ['ubp-ledger-service/src/Ubp.Ledger.Domain', 'ubp-app/src/app/features/gl'],
    anchors: [{ id: 'ancla_que_ya_no_existe', label: 'X' }],
  });
  const g = grafoDelBackend(root);
  const f = lintCapa(dossier, g.graph, null, root, opciones(g));
  assert.deepStrictEqual(sev(f, 'E4'), ['BLOCKER'],
    `con una route indexada el grafo SÍ puede opinar: la deriva sigue bloqueando:\n${JSON.stringify(f, null, 1)}`);
  assert.ok(!f.some((x) => x.code === 'E8' && /no indexa NINGUNA/.test(x.msg)), 'y no se emite el aviso de ceguera');
}

// 5. Route escrita desde la raíz de OTRO repo del workspace: sigue siendo BLOQUEO (esa forma es
//    ambigua — cualquier repo tiene un `src/`) pero el mensaje deja de ser un callejón sin salida.
//    Caso real: ADR-0011/asiento-manual-empresarial.
{
  const { root, dossier } = scaffold('tercera-raiz', {
    route: ['src/app/features/gl/gl-journal-list.page.ts'],
    anchors: [],
  });
  const g = grafoDelBackend(root);
  const f = lintCapa(dossier, g.graph, null, root, opciones(g));
  const e8 = f.filter((x) => x.code === 'E8' && x.sev === 'BLOCKER');
  assert.strictEqual(e8.length, 1, `una route que no resuelve desde ninguna raíz conocida sigue bloqueando:\n${JSON.stringify(f, null, 1)}`);
  assert.ok(/existe bajo ubp-app\//.test(e8[0].msg), `el mensaje debe decir dónde está: ${e8[0].msg}`);
  assert.ok(/ubp-app\/src\/app\/features\/gl\/gl-journal-list\.page\.ts/.test(e8[0].msg),
    `y proponer la forma corregida: ${e8[0].msg}`);
}

// 6. Sin `indexProbe` (grafo sin índice hermano, o llamadas viejas de 4 args) no hay a quién
//    preguntarle: se comporta como antes y no se degrada nada.
{
  const { root, dossier } = scaffold('sin-indice', {
    route: ['ubp-app/src/app/features/gl'],
    anchors: [{ id: 'ancla_que_ya_no_existe', label: 'X' }],
  });
  const graph = { nodes: () => [], has: () => false };
  const f = lintCapa(dossier, graph, null, root);
  assert.deepStrictEqual(sev(f, 'E4'), ['BLOCKER'], 'sin sonda de índice no se degrada nada');
}

// 7. Una route escrita desde el WORKSPACE (`../ubp-app/…`) no debe salir sospechosa sólo por la
//    sintaxis del `..`. Caso real medido: ADR-0023/conversion-oc-a-factura-muestra-sus-lineas era el
//    ÚNICO falso sospechoso del corpus del checkout principal antes de normalizar las formas.
{
  const { root, dossier } = scaffold('ruta-con-dotdot', {
    route: ['../ubp-app/src/app/features/gl'],
    anchors: [{ id: 'ancla_que_ya_no_existe', label: 'X' }],
  });
  const gp = path.join(root, 'graphify-out', 'graph.json');
  // Índice del WORKSPACE (offset='backend'): tiene `ubp-app/…`, no `backend/../ubp-app/…`.
  fs.writeFileSync(path.join(root, 'graphify-out', 'manifest.json'), JSON.stringify({
    'ubp-app/src/app/features/gl/gl-journal-list.page.ts': { mtime: 1, ast_hash: 'x' },
  }));
  const probe = graphIndexProbe(gp);
  const graph = { path: gp, nodes: () => [], has: () => false };
  const f = lintCapa(dossier, graph, null, root, { routeOffset: 'backend', frameRoots: graphFrameRoots(gp), indexProbe: probe });
  assert.deepStrictEqual(sev(f, 'E4'), ['BLOCKER'],
    `\`../ubp-app/x\` normaliza a \`ubp-app/x\`, que SÍ está en el índice: no hay ceguera que excusar:\n${JSON.stringify(f, null, 1)}`);
}

console.log('Doctor frame-suspect (el estado intermedio entre ok y marco equivocado) smoke test OK');
