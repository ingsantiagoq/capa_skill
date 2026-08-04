'use strict';

// Forma de las entradas de `route` — el desacuerdo guard↔doctor.
//
// Una entrada de route se consume desde DOS lados que tienen raíces distintas:
//
//   · el edit-guard resuelve la entrada contra la RAÍZ CAPA (la carpeta con
//     capa.config.json — p.ej. `btw-ubp-backend/`);
//   · `capa doctor` la casa como prefijo de `node.source_file` del GRAFO, cuya
//     raíz sale de `capa.config.json → graph`. Cuando eso apunta a un ancestro
//     (`"graph": "../graphify-out/graph.json"`), los `source_file` vienen con el
//     nombre de la raíz CAPA por delante (`btw-ubp-backend/ubp-ar-service/...`).
//
// Resultado: `btw-ubp-backend/ubp-ar-service/...` dejaba a doctor verde y el
// guard bloqueaba TODO el objetivo; `ubp-ar-service/...` hacía lo contrario.
// Las dos formas conviven en los manifests del repo y ninguna funcionaba en
// ambos lados a la vez.
//
// Este módulo es la única definición de "qué formas de una entrada de route son
// equivalentes". Ambos lados generan candidatos con él y aceptan la que case.
// No ensancha permisos: los candidatos apuntan al MISMO directorio real, sólo
// escrito desde una raíz u otra.

const path = require('path');

function normalizeRouteEntry(entry) {
  if (entry === null || entry === undefined) return null;
  const norm = String(entry).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return norm.length ? norm : null;
}

// Nombre de la raíz CAPA (`btw-ubp-backend`), que es el segmento que sobra o
// falta según desde dónde se haya escrito la entrada.
function rootBasename(root) {
  return path.basename(path.resolve(root));
}

// Todas las formas equivalentes de `entry`, sin duplicados y en orden estable:
// la forma tal cual escrita primero, después la variante con/sin el prefijo de
// la raíz CAPA.
function routeCandidates(root, entry) {
  const norm = normalizeRouteEntry(entry);
  if (!norm) return [];
  const base = rootBasename(root);
  const out = [norm];
  const add = (v) => { if (v && !out.includes(v)) out.push(v); };

  if (norm === base) add('.');
  else if (norm.startsWith(`${base}/`)) add(norm.slice(base.length + 1));
  else add(`${base}/${norm}`);

  return out;
}

module.exports = { normalizeRouteEntry, rootBasename, routeCandidates };
