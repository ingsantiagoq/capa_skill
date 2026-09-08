'use strict';

// `capa init` escribiendo el grafo del PADRE, y el aviso de espacio de nombres.
//
// `capa init` corre antes de que exista un solo dossier: no hay rutas contra las cuales medir
// cobertura, así que elige por existencia. Si el repo no tiene grafo propio, lo único que queda es el
// de la raíz del workspace, y hasta acá lo escribía en silencio — que es exactamente cómo se llega a
// lo que arregló 3d95ec95e en btw-ubp-backend: `capa.config.json` apuntando a `../graphify-out/`, un
// grafo que no pertenece a ningún repo (ningún compañero lo tiene) y que prefijaba cada id de nodo
// con el nombre del repo mientras las 2448 anclas estaban escritas sin prefijo. Resultado: 2447 [E4]
// «drift» y 624 objetivos en BLOQUEO, ninguno por deriva real.
//
// Elegir el grafo por COBERTURA no previene ese caso: la cobertura mide el MARCO (¿el grafo indexa
// este árbol?) y no dice nada del ESPACIO DE NOMBRES de los ids. Son dos fallas distintas, y acá se
// fijan las dos respuestas: `init` avisa al escribir el grafo del padre, y `doctor` avisa cuando casi
// ninguna ancla resuelve en vez de escupir una pared de [E4].

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { init } = require('../lib/scaffold');
const { runDoctor } = require('../lib/doctor');

function captura(fn) {
  const salida = [];
  const log = console.log, error = console.error;
  // `undefined` no restaura nada: hay que volver a 0 explícitamente o el test termina en el código
  // que dejó `die()`/`runDoctor`, y en la cadena de `npm test` corta a los que siguen.
  const prev = process.exitCode === undefined ? 0 : process.exitCode;
  console.log = (...a) => salida.push(a.join(' '));
  console.error = (...a) => salida.push(a.join(' '));
  process.exitCode = 0;
  try { fn(); } catch { /* die() corta con un centinela */ } finally {
    console.log = log; console.error = error;
    var code = process.exitCode;
    process.exitCode = prev;
  }
  return { texto: salida.join('\n'), code };
}

function escribirGrafo(dir, nodes) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'graph.json'), JSON.stringify({ nodes, links: [], built_at_commit: 'abc' }));
  const index = {};
  for (const n of nodes) index[n.source_file] = { mtime: 1, ast_hash: 'x', semantic_hash: '' };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(index));
}

// 1. El repo tiene grafo propio: se escribe el local, sin aviso.
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-init-local-'));
  const root = path.join(ws, 'backend');
  fs.mkdirSync(root, { recursive: true });
  escribirGrafo(path.join(ws, 'graphify-out'), [{ id: 'n', source_file: 'backend/src/X.cs' }]);
  escribirGrafo(path.join(root, 'graphify-out'), [{ id: 'n', source_file: 'src/X.cs' }]);

  const { texto } = captura(() => init({ root }));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capa.config.json'), 'utf8'));
  assert.strictEqual(config.graph, path.join('graphify-out', 'graph.json'), 'el grafo propio gana');
  assert.ok(!/raíz del workspace/.test(texto), `no hay nada que advertir:\n${texto}`);
}

// 2. El repo NO tiene grafo propio: se escribe el del padre, PERO con el aviso y la salida.
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-init-padre-'));
  const root = path.join(ws, 'backend');
  fs.mkdirSync(root, { recursive: true });
  escribirGrafo(path.join(ws, 'graphify-out'), [{ id: 'n', source_file: 'backend/src/X.cs' }]);

  const { texto } = captura(() => init({ root }));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capa.config.json'), 'utf8'));
  assert.ok(config.graph.startsWith('..'), `sigue siendo la única opción: ${config.graph}`);
  assert.ok(/raíz del workspace/.test(texto), `pero tiene que avisarlo:\n${texto}`);
  assert.ok(/ninguna ancla resuelve/.test(texto), `nombrando el riesgo concreto (ids prefijados):\n${texto}`);
  assert.ok(/graphify update \./.test(texto), `y la salida:\n${texto}`);
}

// 3. Grafo que CUBRE las rutas pero cuyos ids están en otro espacio de nombres: el doctor lo dice en
//    vez de dejar que el lector concluya que hay 30 derivas. Es el caso 3d95ec95e.
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-init-ns-'));
  const root = path.join(ws, 'backend');
  const ADR = 'ADR-0011-contabilidad-gl';
  // Los nodos existen y las rutas casan; sólo los ids llevan el prefijo del repo.
  const nodes = [];
  for (let i = 0; i < 30; i++) nodes.push({ id: `backend::ancla_${i}`, source_file: `backend/ubp-ledger-service/src/F${i}.cs` });
  escribirGrafo(path.join(ws, 'graphify-out'), nodes);
  fs.mkdirSync(path.join(root, 'ubp-ledger-service', 'src'), { recursive: true });

  for (let i = 0; i < 30; i++) {
    const d = path.join(root, 'capa', ADR, `obj-${i}`);
    fs.mkdirSync(d, { recursive: true });
    for (const dim of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
      fs.writeFileSync(path.join(d, `${dim}.md`), `# ${dim}\n`);
    }
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({
      parentAdr: ADR, objetivo: `obj-${i}`, lifecycle: 'wip',
      status: { decision: 'PROPUESTA', implementation: 'PARTIAL', verified_against: null },
      route: ['ubp-ledger-service/src'], slices: [],
      anchors: [{ id: `ancla_${i}`, label: `F${i}` }],   // sin el prefijo `backend::`
      evidence: [], decisions: [],
    }));
  }

  const config = { project: 'backend', dossierDir: 'capa', graph: '../graphify-out/graph.json' };
  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify(config));
  const { texto } = captura(() => runDoctor({ root, config, onlyAdr: ADR }));

  assert.ok(/cobertura 1\/1 rutas/.test(texto), `el marco está bien: la route casa:\n${texto.slice(0, 400)}`);
  assert.ok(/0 de 30 anclas resuelven/.test(texto), `pero casi ninguna ancla resuelve y hay que decirlo:\n${texto.slice(-900)}`);
  assert.ok(/espacios de nombres distintos/.test(texto), `nombrando la causa, que NO es deriva:\n${texto.slice(-900)}`);
  assert.ok(/re-anclar los manifests/.test(texto), `y las DOS salidas, no sólo regenerar el grafo:\n${texto.slice(-900)}`);
}

// 4. EL DESASTRE PARCIAL — el que realmente ocurre. El umbral viejo era 5 %, así que sólo hablaba
//    ante la catástrofe total (3d95ec95e: 1 ancla viva de 2448 = 0,04 %). Medido 2026-09-08 sobre el
//    corpus real del checkout principal: 468 de 2463 anclas vivas = 19,0 %, con 1995 [E4] bloqueando
//    — el desastre más grande que hay en la casa — y el aviso pasaba por debajo del umbral sin decir
//    nada. Este caso reproduce esa proporción a escala: 6 de 30 anclas vivas = 20 %.
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-ns-parcial-'));
  const root = path.join(ws, 'backend');
  const ADR = 'ADR-0011-contabilidad-gl';
  const VIVAS = 6, TOTAL = 30;
  const nodes = [];
  for (let i = 0; i < TOTAL; i++) {
    // Las primeras VIVAS anclan; el resto vive con el prefijo del repo, como en el caso real.
    nodes.push({ id: i < VIVAS ? `ancla_${i}` : `backend::ancla_${i}`, source_file: `backend/ubp-ledger-service/src/F${i}.cs` });
  }
  escribirGrafo(path.join(ws, 'graphify-out'), nodes);
  fs.mkdirSync(path.join(root, 'ubp-ledger-service', 'src'), { recursive: true });
  for (let i = 0; i < TOTAL; i++) {
    const d = path.join(root, 'capa', ADR, `obj-${i}`);
    fs.mkdirSync(d, { recursive: true });
    for (const dim of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
      fs.writeFileSync(path.join(d, `${dim}.md`), `# ${dim}\n`);
    }
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({
      parentAdr: ADR, objetivo: `obj-${i}`, lifecycle: 'wip',
      status: { decision: 'PROPUESTA', implementation: 'PARTIAL', verified_against: null },
      route: ['ubp-ledger-service/src'], slices: [],
      anchors: [{ id: `ancla_${i}`, label: `F${i}` }],
      evidence: [], decisions: [],
    }));
  }
  const config = { project: 'backend', dossierDir: 'capa', graph: '../graphify-out/graph.json' };
  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify(config));
  const { texto } = captura(() => runDoctor({ root, config, onlyAdr: ADR }));

  assert.ok(/6 de 30 anclas resuelven en este grafo \(20 %\)/.test(texto),
    `20 % de anclas vivas tiene que disparar el aviso; con el umbral de 5 % pasaba mudo:\n${texto.slice(-900)}`);
}

// 5. Un corpus SANO no dispara el aviso. Medido en el worktree cc-sucursal-bodega contra el mismo
//    archivo de grafo: 2295/2477 = 92,7 % vivas. El umbral (50 %) tiene que dejarlo pasar, o el aviso
//    se vuelve ruido permanente y nadie lo lee.
{
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-ns-sano-'));
  const root = path.join(ws, 'backend');
  const ADR = 'ADR-0011-contabilidad-gl';
  const VIVAS = 28, TOTAL = 30; // 93,3 % — la proporción del corpus sano
  const nodes = [];
  for (let i = 0; i < TOTAL; i++) {
    nodes.push({ id: i < VIVAS ? `ancla_${i}` : `backend::ancla_${i}`, source_file: `backend/ubp-ledger-service/src/F${i}.cs` });
  }
  escribirGrafo(path.join(ws, 'graphify-out'), nodes);
  fs.mkdirSync(path.join(root, 'ubp-ledger-service', 'src'), { recursive: true });
  for (let i = 0; i < TOTAL; i++) {
    const d = path.join(root, 'capa', ADR, `obj-${i}`);
    fs.mkdirSync(d, { recursive: true });
    for (const dim of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
      fs.writeFileSync(path.join(d, `${dim}.md`), `# ${dim}\n`);
    }
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({
      parentAdr: ADR, objetivo: `obj-${i}`, lifecycle: 'wip',
      status: { decision: 'PROPUESTA', implementation: 'PARTIAL', verified_against: null },
      route: ['ubp-ledger-service/src'], slices: [],
      anchors: [{ id: `ancla_${i}`, label: `F${i}` }],
      evidence: [], decisions: [],
    }));
  }
  const config = { project: 'backend', dossierDir: 'capa', graph: '../graphify-out/graph.json' };
  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify(config));
  const { texto } = captura(() => runDoctor({ root, config, onlyAdr: ADR }));

  assert.ok(!/anclas resuelven en este grafo/.test(texto),
    `93 % de anclas vivas es un corpus sano: el aviso no debe salir:\n${texto.slice(-900)}`);
}

console.log('Init graph choice (grafo del padre · espacio de nombres de los ids) smoke test OK');
