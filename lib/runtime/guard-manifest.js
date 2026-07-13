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
const { getFocus, manifestPathOf } = require('./focus');

function normalizePath(filePath) {
  if (!filePath) return null;
  return String(filePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

function inRoute(root, route, file) {
  const absTarget = path.resolve(root, normalizePath(file));
  return route.some((entry) => {
    const norm = normalizePath(entry);
    if (!norm) return false;
    const absEntry = path.resolve(root, norm);
    return absTarget === absEntry || absTarget.startsWith(`${absEntry}${path.sep}`);
  });
}

function evaluate({ root, config, file }) {
  if (!file) return block('Falta --file para el guard de edición');

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
