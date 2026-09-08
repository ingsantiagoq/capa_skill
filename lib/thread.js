'use strict';
const fs = require('fs');
const path = require('path');
const { c, die, readJSON } = require('./util');
const { loadGraph, chooseGraph, avisoConfigIgnorado, describirSello, textosDeAvisos, MAX_BEHIND_HEAD } = require('./graph');
const { routeCandidatesInFrame } = require('./route');
const { findCapas, declaredRoutePaths } = require('./doctor');
const { normalizeRouteEntry } = require('./route');

// `capa thread ADR-XXXX --objetivo <slug>` — activate graphify over the CAPA's
// route and thread its dependencies: edges that CROSS the route boundary.
// Out-deps = the CAPA depends on these (must exist / be coherent).
// In-deps  = these depend on the CAPA (blast radius if it changes).

/**
 * Unidad de agrupación del radio de impacto: el servicio (o el repo hermano) al que pertenece el
 * archivo. `offset` es el prefijo con el que la raíz CAPA aparece dentro del grafo, y hay que sacarlo
 * ANTES de partir la ruta.
 *
 * Sin eso, en el marco del workspace el primer segmento es SIEMPRE el nombre del repo y el radio de
 * impacto colapsa: medido en ADR-0011/cuenta-segmentada-y-dimension-bodega, «Lo necesitan» pasaba de
 * nombrar ubp-audit-service, ubp-tax-service, ubp-ap-service, ubp-pos-service… a un único
 * «← btw-ubp-backend», que no dice nada. Daño colateral de haber pasado thread al grafo del workspace.
 *
 * Un archivo de OTRO repo (ubp-app/…, legacy/…) no lleva el prefijo, así que conserva su nombre: ahí
 * el primer segmento sí es la unidad correcta.
 */
function topService(file, offset) {
  if (!file) return '(externo)';
  let rel = file;
  if (offset && rel.startsWith(`${offset}/`)) rel = rel.slice(offset.length + 1);
  const seg = rel.split('/')[0];
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

  // El marco es una propiedad del GRAFO, no del objetivo, así que se mide contra el corpus entero
  // igual que `capa doctor`. Con las 1-9 rutas de un solo objetivo el veredicto es frágil justo en la
  // dirección peligrosa: basta que una route legítimamente muerta sea la mitad de la lista para que un
  // grafo perfectamente bueno se declare marco equivocado, o al revés. Leer los manifests del corpus
  // cuesta ~0,3 s contra los ~9 s que tarda de todas formas en abrir el grafo.
  const dossierRel = normalizeRouteEntry(path.relative(root, capaDir)) || 'capa';
  const corpus = declaredRoutePaths(capas, root, dossierRel);
  const choice = chooseGraph({ root, configGraph: config.graph, routeEntries: corpus.length ? corpus : route });
  if (!choice.path) die('falta graphify-out/graph.json');
  if (choice.verdict === 'mismatch') {
    die(`el grafo no indexa el árbol que los CAPA nombran (${choice.covered}/${choice.total} rutas del corpus): hilar `
      + `contra él daría dependencias inventadas. Regenerá el grafo del árbol que el CAPA nombra — `
      + `cd "${root}" && graphify update . (o en la raíz del workspace si la route cruza repos).`);
  }
  // Mismo aviso que emite `capa doctor`: el grafo del config NO fue el elegido. Antes thread sólo
  // emitía el de `bestMeasured`, así que quien hilaba sin correr el doctor jamás se enteraba de que su
  // `capa.config.json → graph` había sido ignorado, y leía un radio de impacto calculado contra un
  // grafo que no pidió. El texto sale del mismo lugar (lib/graph.js) para que los dos comandos digan
  // exactamente lo mismo.
  if (choice.verdict === 'stale') {
    die(`el grafo elegido (${path.relative(root, choice.path)}) lleva ${describirSello(choice)}, por encima de los `
      + `${MAX_BEHIND_HEAD} commits que se toleran: hilar contra él daría dependencias de un árbol que ya no `
      + `existe. Regeneralo — cd "${root}" && graphify update . (o en la raíz del workspace si la route cruza repos).`);
  }
  const avisoConfig = avisoConfigIgnorado(root, config.graph, choice);
  if (avisoConfig) console.error(c.yellow('⚠ ') + avisoConfig);
  // Los mismos avisos simétricos que imprime `capa doctor`, desde el mismo lugar (lib/graph.js).
  for (const texto of textosDeAvisos(root, choice)) console.error(c.yellow('⚠ ') + texto);
  if (choice.bestMeasured) {
    console.error(c.yellow('⚠ ') + `ningún grafo medible cubre el corpus; se usa ${path.relative(root, choice.path)}, `
      + 'que no tiene índice hermano y no se pudo pesar: las dependencias de abajo pueden ser de otro árbol.');
  }
  const graph = loadGraph(choice.path);

  // La route puede estar escrita desde la raíz CAPA o desde la del grafo: se aceptan ambas formas,
  // igual que en `capa doctor` (lib/route.js).
  const routeForms = route.flatMap((p) => routeCandidatesInFrame(root, p, choice.offset));
  const inRoute = (file) => !!file && routeForms.some((p) => file.startsWith(p));
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
      const k = topService(tf, choice.offset);
      if (!outDeps.has(k)) outDeps.set(k, new Set());
      outDeps.get(k).add(l.relation);
    } else if (!sIn && tIn) { // someone depends on route
      const k = topService(sf, choice.offset);
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
