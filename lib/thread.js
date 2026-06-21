'use strict';
const fs = require('fs');
const path = require('path');
const { c, die, readJSON } = require('./util');
const { resolveGraphPath, loadGraph } = require('./graph');
const { findCapas } = require('./doctor');

// `capa thread ADR-XXXX --objetivo <slug>` — activate graphify over the CAPA's
// route and thread its dependencies: edges that CROSS the route boundary.
// Out-deps = the CAPA depends on these (must exist / be coherent).
// In-deps  = these depend on the CAPA (blast radius if it changes).

function topService(file) {
  if (!file) return '(externo)';
  const seg = file.split('/')[0];
  return seg || '(externo)';
}

function runThread({ root, config, adr, objetivo }) {
  if (!adr) die('uso: capa thread ADR-XXXX --objetivo <slug>');
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  const capas = findCapas(capaDir);
  const match = capas.find((d) => {
    const rel = path.relative(capaDir, d).toLowerCase();
    return rel.includes(adr.toLowerCase()) && (!objetivo || rel.includes(String(objetivo).toLowerCase()));
  });
  if (!match) die(`no se encontró CAPA para ${adr}${objetivo ? '/' + objetivo : ''}`);
  const m = readJSON(path.join(match, 'manifest.json'));
  const route = Array.isArray(m.route) ? m.route : [];
  if (!route.length) die('el CAPA no tiene route. Agregá "route": ["path/..."] en manifest.json');

  const graphPath = resolveGraphPath(root, config.graph);
  if (!graphPath) die('falta graphify-out/graph.json');
  const graph = loadGraph(graphPath);

  const inRoute = (file) => !!file && route.some((p) => file.startsWith(p));
  const nodeFile = new Map();
  for (const n of graph.nodes()) nodeFile.set(n.id, n.source_file);

  const outDeps = new Map(); // service -> Set(relation)
  const inDeps = new Map();
  let internal = 0;
  for (const l of graph.links()) {
    const sf = nodeFile.get(l.source);
    const tf = nodeFile.get(l.target);
    const sIn = inRoute(sf), tIn = inRoute(tf);
    if (sIn && tIn) { internal++; continue; }
    if (sIn && !tIn) { // route depends on target
      const k = topService(tf);
      if (!outDeps.has(k)) outDeps.set(k, new Set());
      outDeps.get(k).add(l.relation);
    } else if (!sIn && tIn) { // someone depends on route
      const k = topService(sf);
      if (!inDeps.has(k)) inDeps.set(k, new Set());
      inDeps.get(k).add(l.relation);
    }
  }

  const routeNodes = graph.nodes().filter((n) => inRoute(n.source_file)).length;
  console.log(c.bold(`\nHilado CAPA · ${m.parentAdr}/${m.objetivo}`));
  console.log(c.dim(`ruta: ${route.join(', ')}`));
  console.log(c.dim(`${routeNodes} nodos en ruta · ${internal} aristas internas`));

  const dump = (title, map, arrow) => {
    console.log('\n' + c.bold(title) + c.dim(` (${map.size} servicio(s))`));
    if (!map.size) { console.log('  ' + c.dim('—')); return; }
    for (const [svc, rels] of [...map.entries()].sort((a, b) => b[1].size - a[1].size)) {
      console.log(`  ${arrow} ${c.cyan(svc)}  ${c.dim('[' + [...rels].join(', ') + ']')}`);
    }
  };
  dump('Depende de (out):', outDeps, '→');
  dump('Lo necesitan (in · radio de impacto):', inDeps, '←');
  console.log('\n' + c.dim('Sugerencia: cada "depende de" debería estar declarado en manifest.anchors[] o ser un CAPA previo.'));
}

module.exports = { runThread };
