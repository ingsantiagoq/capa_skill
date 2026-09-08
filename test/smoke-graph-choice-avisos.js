'use strict';

// Los dos avisos que un dev tiene que poder ACCIONAR sin adivinar.
//
// 1) RUTAS FUERA DEL ÍNDICE. La versión anterior imprimía «55 de 1646 rutas declaradas NO están en el
//    índice de este grafo» y cerraba con «un grafo del árbol correcto es lo que los cierra» — que es
//    justamente el grafo que ya se estaba usando. No nombraba ni una de las 55, ni un solo objetivo:
//    quien lo leía no tenía nada que hacer a continuación.
//
// 2) EL CONFIG IGNORADO EN `capa thread`. `capa doctor` avisaba «capa.config.json → graph (…) cubre X;
//    se usa Y»; `thread` sólo emitía el de `bestMeasured`, así que quien hilaba sin correr el doctor
//    nunca se enteraba de que su config había sido ignorado y leía un radio de impacto calculado
//    contra un grafo que no pidió.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runDoctor } = require('../lib/doctor');
const { runThread } = require('../lib/thread');

function captura(fn) {
  const salida = [];
  const log = console.log, error = console.error;
  const prev = process.exitCode === undefined ? 0 : process.exitCode;
  console.log = (...a) => salida.push(a.join(' '));
  console.error = (...a) => salida.push(a.join(' '));
  process.exitCode = 0;
  try { fn(); } catch { /* die() corta con un centinela */ } finally {
    console.log = log; console.error = error;
    process.exitCode = prev;
  }
  return salida.join('\n');
}

function escribirGrafo(dir, nodes) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'graph.json'), JSON.stringify({ nodes, links: [], built_at_commit: 'abc' }));
  const index = {};
  for (const n of nodes) index[n.source_file] = { mtime: 1, ast_hash: 'x', semantic_hash: '' };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(index));
}

const ADR = 'ADR-0011-contabilidad-gl';
function escribirCapa(root, slug, route) {
  const d = path.join(root, 'capa', ADR, slug);
  fs.mkdirSync(d, { recursive: true });
  for (const dim of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
    fs.writeFileSync(path.join(d, `${dim}.md`), `# ${dim}\n`);
  }
  fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({
    parentAdr: ADR, objetivo: slug, lifecycle: 'wip',
    status: { decision: 'PROPUESTA', implementation: 'PARTIAL', verified_against: null },
    route, slices: [], anchors: [], evidence: [], decisions: [],
  }));
  return d;
}

// workspace/
//   graphify-out/            <- indexa backend/ y ubp-app/, NO los .proto
//   backend/                 <- raíz CAPA
function escenario() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-avisos-'));
  const root = path.join(ws, 'backend');
  fs.mkdirSync(path.join(root, 'ubp-ledger-service', 'src'), { recursive: true });
  fs.mkdirSync(path.join(ws, 'ubp-protos'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'ubp-protos', 'ledger.proto'), 'syntax = "proto3";\n');
  escribirGrafo(path.join(ws, 'graphify-out'), [
    { id: 'ledger', source_file: 'backend/ubp-ledger-service/src/JournalEntry.cs' },
  ]);
  escribirCapa(root, 'cubierto', ['ubp-ledger-service/src']);
  escribirCapa(root, 'proto-a', ['ubp-protos/ledger.proto']);
  escribirCapa(root, 'proto-b', ['ubp-protos/ledger.proto']);
  const config = { project: 'backend', dossierDir: 'capa', graph: '../graphify-out/graph.json' };
  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify(config));
  return { ws, root, config };
}

// 1. El aviso de rutas fuera del índice NOMBRA la ruta y los objetivos que la declaran.
{
  const { root, config } = escenario();
  const texto = captura(() => runDoctor({ root, config }));

  assert.ok(/rutas declaradas NO están en el índice de este grafo/.test(texto), `debe salir el aviso:\n${texto}`);
  assert.ok(/· ubp-protos\/ledger\.proto/.test(texto), `nombrando la RUTA, no sólo el número:\n${texto}`);
  assert.ok(/proto-a/.test(texto) && /proto-b/.test(texto),
    `y los objetivos que la declaran, que es lo que hace falta para ir a arreglarla:\n${texto}`);
  assert.ok(/graphify no hashea/.test(texto),
    `y decir que un .proto sale acá SIEMPRE, para no mandar a nadie a regenerar un grafo que está bien:\n${texto}`);
  assert.ok(!/un grafo del árbol correcto es lo que los cierra/.test(texto),
    `y NO cerrar recomendando el grafo que ya se está usando:\n${texto}`);
}

// 2. Sin rutas fuera del índice no hay aviso: el ruido permanente es lo que enseña a ignorar el gate.
{
  const { root, config } = escenario();
  fs.rmSync(path.join(root, 'capa', ADR, 'proto-a'), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'capa', ADR, 'proto-b'), { recursive: true, force: true });
  const texto = captura(() => runDoctor({ root, config }));
  assert.ok(!/NO están en el índice/.test(texto), `todo cubierto ⇒ sin aviso:\n${texto}`);
}

// 3. `capa thread` emite el MISMO aviso de config ignorado que `capa doctor`.
{
  const { ws, root, config } = escenario();
  // Grafo local del backend: existe, es el del config, y cubre MENOS que el del padre.
  escribirGrafo(path.join(root, 'graphify-out'), [{ id: 'x', source_file: 'nada/X.cs' }]);
  const conConfigLocal = { ...config, graph: 'graphify-out/graph.json' };
  fs.writeFileSync(path.join(root, 'capa.config.json'), JSON.stringify(conConfigLocal));

  const delDoctor = captura(() => runDoctor({ root, config: conConfigLocal }));
  const delThread = captura(() => runThread({ root, config: conConfigLocal, adr: ADR, objetivo: 'cubierto' }));

  const linea = /capa\.config\.json → graph \("graphify-out\/graph\.json"\) cubre 0\/2 rutas; se usa [^\n]*graph\.json \(1\/2 rutas\), que cubre más/;
  assert.ok(linea.test(delDoctor), `el doctor ya lo decía:\n${delDoctor}`);
  assert.ok(linea.test(delThread), `y ahora thread dice exactamente lo mismo:\n${delThread}`);
  void ws;
}

console.log('Avisos de elección de grafo (rutas fuera del índice · config ignorado en thread) smoke test OK');
