'use strict';
const fs = require('fs');
const path = require('path');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = {
  bold: (s) => paint('1', s),
  dim: (s) => paint('2', s),
  red: (s) => paint('31', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
  blue: (s) => paint('34', s),
  cyan: (s) => paint('36', s),
};

const DIMENSIONS = ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER'];

// 2-axis state (ADR-0017 anti-teatro)
const DECISION = ['PROPUESTA', 'ACEPTADA', 'RECHAZADA'];
const IMPLEMENTATION = ['NONE', 'PARTIAL', 'E2E-VERIFIED'];

// Lifecycle (la regla dura de Aseguramiento): no se pasa a 'done' sin prueba
// real (api o e2e-ui) del Alcance, y sin firmas pendientes.
const LIFECYCLE = ['wip', 'review', 'done'];
// Tipo de evidencia. 'api' y 'e2e-ui' son las únicas que habilitan 'done'.
const EVIDENCE_KINDS = ['unit', 'graph', 'api', 'e2e-ui'];
const PROOF_KINDS = ['api', 'e2e-ui'];

// Skills de diseño requeridas cuando el CAPA es de frontend (nombres instalados).
// emil-design-eng (Emil Kowalski) · impeccable (Paul Bakaus) · design-taste-frontend (taste-skill v2).
const FRONT_DESIGN_SKILLS = ['emil-design-eng', 'impeccable', 'design-taste-frontend'];

function die(msg) {
  console.error(c.red('✗ ') + msg);
  process.exit(1);
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeFileSafe(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// Find the nearest capa.config.json walking up from cwd.
function findConfig(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, 'capa.config.json');
    if (fs.existsSync(candidate)) return { configPath: candidate, root: dir };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadConfig(start) {
  const found = findConfig(start);
  if (!found) die('No hay capa.config.json. Corré `capa init` en la raíz del proyecto.');
  return { ...found, config: readJSON(found.configPath) };
}

module.exports = { c, DIMENSIONS, DECISION, IMPLEMENTATION, LIFECYCLE, EVIDENCE_KINDS, PROOF_KINDS, FRONT_DESIGN_SKILLS, die, readJSON, writeFileSafe, findConfig, loadConfig };
