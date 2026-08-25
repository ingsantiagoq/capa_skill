'use strict';

// Manifest-mode edit guard. The PBI-mode guard (./guard) reads .capa/capa.db;
// this one reads the manifest of the objective currently in focus and allows an
// edit ONLY when the target file is inside that objective's declared `route`.
// No focus, closed objective, or path outside the route => CAPA BLOCK.
// This is what makes "trabajar a través de CAPA" enforced by the harness instead
// of by the agent's discipline.

const fs = require('fs');
const path = require('path');
const { readJSON } = require('../util');
const { routeCandidates } = require('../route');
const { getFocus, manifestPathOf } = require('./focus');

// A CAPA root with zero objectives is not enforcing anything yet (freshly
// `capa init`'d). Governing it would brick every edit there. So enforcement
// kicks in per-root only once that root actually has objectives.
// NOTE: scan the filesystem directly instead of importing ../doctor — that
// module loads better-sqlite3, and this guard path must stay native-free.
function hasObjectives(root, config) {
  const capaDir = path.resolve(root, (config && config.dossierDir) || 'capa');
  if (!fs.existsSync(capaDir)) return false;
  const walk = (dir, depth) => {
    if (depth > 4) return false;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    for (const e of entries) {
      if (e.isFile() && e.name === 'manifest.json') return true;
      if (e.isDirectory() && walk(path.join(dir, e.name), depth + 1)) return true;
    }
    return false;
  };
  return walk(capaDir, 0);
}

function normalizePath(filePath) {
  if (!filePath) return null;
  return String(filePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

// Una entrada de route puede venir escrita desde la raíz CAPA o desde la raíz
// del grafo (que suele ser su padre) — ver lib/route.js. Se acepta cualquiera
// de las formas equivalentes: todas apuntan al mismo directorio real.
function inRoute(root, route, file) {
  const absTarget = path.resolve(root, normalizePath(file));
  return route.some((entry) => routeCandidates(root, entry).some((candidate) => {
    const absEntry = path.resolve(root, candidate);
    return absTarget === absEntry || absTarget.startsWith(`${absEntry}${path.sep}`);
  }));
}

// ¿El archivo vive en la carpeta del dossier del objetivo en foco? Esa carpeta es
// la que contiene su manifest.json. Comparación por ruta absoluta resuelta, igual
// que inRoute(), para que un symlink o un `..` no la esquiven.
function isOwnDossier(root, manifestPath, file) {
  const dossierDir = path.dirname(path.resolve(root, manifestPath));
  const absTarget = path.resolve(root, normalizePath(file));
  return absTarget === dossierDir || absTarget.startsWith(`${dossierDir}${path.sep}`);
}

function evaluate({ root, config, file }) {
  if (!file) return block('Falta --file para el guard de edición');

  // Root not yet using CAPA (no objectives) => ungoverned, allow.
  if (!hasObjectives(root, config)) {
    return { allowed: true, code: 0, focus: null, message: 'CAPA ALLOW', reason: 'raíz sin objetivos CAPA — no gobernada aún' };
  }

  const focus = getFocus(root);
  if (!focus) {
    return block('No hay objetivo CAPA en foco. Declaralo con `capa focus <ADR> <objetivo>` antes de editar.');
  }

  const manifestPath = manifestPathOf(root, config, focus.adr, focus.objetivo);
  let manifest;
  try { manifest = readJSON(manifestPath); } catch {
    return block(`El objetivo en foco no tiene manifest legible: ${focus.adr}/${focus.objetivo}`, focus);
  }

  if (String(manifest.lifecycle).toLowerCase() === 'done') {
    return block(`El objetivo en foco está cerrado (lifecycle=done): ${focus.adr}/${focus.objetivo}. Enfocá otro con \`capa focus\`.`, focus);
  }

  // El dossier del objetivo EN FOCO siempre es editable, esté o no en su `route`.
  //
  // Sin esto el guard se muerde la cola: escribir CONTEXTO/ALCANCE/... exigía que la
  // ruta se incluyera a sí misma, y corregir la ruta exigía editar el manifest.json…
  // que vive en esa misma carpeta. Un objetivo recién creado quedaba imposible de
  // documentar salvo declarando su propia carpeta en `--route`, lo que después el
  // doctor marca stale (E8): es markdown, nunca tiene nodos en el grafo.
  //
  // No afloja nada: sigue siendo UN objetivo (el enfocado) y sólo SU dossier. El
  // dossier de otro objetivo continúa bloqueado, que es lo que el guard protege.
  // Va ANTES del chequeo de `route` vacía para que un objetivo sin ruta todavía
  // pueda declararla.
  if (isOwnDossier(root, manifestPath, file)) {
    return allow(focus);
  }

  const route = Array.isArray(manifest.route) ? manifest.route : [];
  if (!route.length) {
    return block(`El objetivo en foco no declara \`route\`: ${focus.adr}/${focus.objetivo}. Definí la ruta con \`capa new --route\`.`, focus);
  }

  if (!inRoute(root, route, file)) {
    return block(`Archivo fuera del route del objetivo ${focus.adr}/${focus.objetivo}: ${file}`, focus);
  }

  return allow(focus);
}

function allow(focus) {
  return { allowed: true, code: 0, focus, message: 'CAPA ALLOW' };
}

function block(reason, focus = null) {
  return { allowed: false, code: 2, focus, message: 'CAPA BLOCK', reason };
}

function print(result) {
  console.log(result.message);
  if (result.focus) console.log(`Objetivo: ${result.focus.adr}/${result.focus.objetivo}`);
  if (!result.allowed) console.log(`Motivo: ${result.reason}`);
}

module.exports = { evaluate, print };
