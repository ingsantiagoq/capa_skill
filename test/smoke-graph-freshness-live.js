'use strict';

// El sello del grafo de la RAÍZ se mide AL CONSULTAR (INFRA R96, 2026-09-27).
//
// Medido ese día: el encabezado decía «VEREDICTO FRESH — arboles limpios y al dia al momento de
// armarlo» con el grafo 32 commits detrás en backend, 32 en ubp-app y 4 en protos. Y `capa doctor`
// decía siempre «SIN sello de construcción · antigüedad NO verificable» para ese grafo — una alarma
// que sonaba igual estuviera fresco o con 3 días: nadie la escuchaba.
//
// Contrato: si al lado del grafo hay BUILD-STAMP.json + graphify-freshness.sh, el doctor usa ESE
// medidor (el mismo que `graphify query`): FRESH no avisa, ATRASADO avisa con los números.
// Sin medidor, el texto de siempre (no se inventa frescura).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { describirSello, textosDeAvisos } = require('../lib/graph');

function grafoCon(medidor) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-fresh-'));
  const out = path.join(dir, 'graphify-out');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'graph.json'), '{"nodes":[],"links":[]}');
  fs.writeFileSync(path.join(out, 'BUILD-STAMP.json'), '{"repos":[{"path":"r","head":"abc","dirty_files":0}]}');
  if (medidor) fs.writeFileSync(path.join(out, 'graphify-freshness.sh'), medidor);
  return { root: dir, graph: path.join(out, 'graph.json') };
}
const choice = (graph) => ({ path: graph, sealState: 'none', avisos: ['sello-no-verificable'], candidates: [] });

// 1 · ATRASADO: el encabezado y el aviso llevan el NÚMERO, no «no verificable».
{
  const g = grafoCon('echo "⚠⚠ VEREDICTO ATRASADO — commits detrás de develop: btw-ubp-backend 32"\necho "⇒ regenerar: X"\nexit 3\n');
  const sello = describirSello(choice(g.graph));
  assert.match(sello, /ATRASADO.*32/, `el encabezado debe decir el atraso: ${sello}`);
  const avisos = textosDeAvisos(g.root, choice(g.graph));
  assert.strictEqual(avisos.length, 1);
  assert.match(avisos[0], /ATRASADO.*32.*regenerar/);
  assert.doesNotMatch(avisos[0], /No se puede probar/);
}

// 2 · FRESH: el encabezado lo dice y NO hay aviso (una alarma que suena siempre no se escucha).
{
  const g = grafoCon('echo "VEREDICTO FRESH — los 5 repos en la punta de develop"\nexit 0\n');
  assert.match(describirSello(choice(g.graph)), /^VEREDICTO FRESH/);
  assert.deepStrictEqual(textosDeAvisos(g.root, choice(g.graph)), []);
}

// 3 · Control: SIN medidor, el texto de siempre. Sin prueba de frescura no se regala un FRESH.
{
  const g = grafoCon(null);
  assert.match(describirSello(choice(g.graph)), /SIN sello de construcción/);
  const avisos = textosDeAvisos(g.root, choice(g.graph));
  assert.match(avisos[0], /No se puede probar/);
}

// 4 · Un medidor que se rompe (exit ≠ 0/3) es NO VERIFICABLE, jamás FRESH.
{
  const g = grafoCon('echo "algo raro"\nexit 7\n');
  const avisos = textosDeAvisos(g.root, choice(g.graph));
  assert.strictEqual(avisos.length, 1, 'un medidor roto tiene que avisar');
}

console.log('✓ smoke-graph-freshness-live: ATRASADO avisa con números · FRESH calla · sin medidor no inventa · roto avisa');
