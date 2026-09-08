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

// Igual que routeCandidates, pero SABIENDO el marco del grafo: `offset` es el prefijo con el que la
// raíz CAPA aparece dentro del grafo ('' si el grafo la enmarca a ella misma, null si no la contiene).
// routeCandidates adivina ese prefijo por el nombre de la carpeta raíz, y falla cuando la carpeta se
// llama distinto que el repo dentro del grafo (worktrees: `cc-sucursal-bodega/` vs `btw-ubp-backend/`).
function routeCandidatesInFrame(root, entry, offset) {
  const out = routeCandidates(root, entry);
  if (!offset) return out;
  const norm = normalizeRouteEntry(entry);
  if (!norm) return out;
  const framed = norm === '.' ? offset : `${offset}/${norm}`;
  if (!out.includes(framed)) out.push(framed);
  return out;
}

// Formas con las que `entry` se BUSCA EN EL ÍNDICE del grafo (`graphify-out/manifest.json`): las
// mismas equivalencias de arriba, más la variante con los `..` resueltos.
//
// `routeCandidatesInFrame` concatena strings, así que una entrada escrita desde el workspace
// (`../ubp-app/src/...`) produce `btw-ubp-backend/../ubp-app/src/...`, que no es clave de ningún
// índice: la ruta quedaba "ausente" por SINTAXIS y no por ausencia real. Medido 2026-09-08 contra
// el índice de la raíz (169.320 claves): `btw-ubp-backend/../ubp-app/src/app/features/ap-invoices`
// → no; normalizado a `ubp-app/src/app/features/ap-invoices` → sí. Era el único falso SOSPECHOSO
// del corpus del checkout principal (ADR-0023/conversion-oc-a-factura-muestra-sus-lineas).
//
// Sólo AGREGA formas, nunca saca ninguna: no puede estrechar lo que ya casaba. Y no se usa en el
// guard de edición, donde un `..` sí cambia qué archivo se toca.
function routeIndexForms(root, entry, offset) {
  const out = [];
  const add = (v) => { if (v && !out.includes(v)) out.push(v); };
  for (const form of routeCandidatesInFrame(root, entry, offset)) {
    add(form);
    if (form.includes('../')) add(path.posix.normalize(form).replace(/\/+$/, ''));
  }
  return out;
}

module.exports = { normalizeRouteEntry, rootBasename, routeCandidates, routeCandidatesInFrame, routeIndexForms };
