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
// Tipo de evidencia. 'api' y 'e2e-ui' habilitan 'done' para objetivos CON
// superficie. 'integration' y 'gate' la habilitan SOLO para objetivos de
// infraestructura (ver DP-12 / hasScopeProof).
const EVIDENCE_KINDS = ['unit', 'graph', 'api', 'e2e-ui', 'integration', 'gate'];
const PROOF_KINDS = ['api', 'e2e-ui'];
// DP-12 (ADR-0001, firmada): un objetivo de INFRA sin superficie api/e2e-ui
// alcanza prueba de Alcance con (a) integración contra el sistema real
// (Testcontainers/Postgres) — kind 'integration', O (b) un gate build-breaking
// probado que MUERDE en CI — kind 'gate'. En ambos casos anclado a un comando
// reproducible en evidence[] y con la decisión ACEPTADA.
const INFRA_PROOF_KINDS = ['integration', 'gate'];

// ¿El objetivo es de infraestructura (sin superficie api/e2e-ui por naturaleza)?
// Se declara explícitamente en el manifest: `infra: true` (o `surface: "infra"`).
function isInfra(m) {
  return !!(m && (m.infra === true || m.surface === 'infra'));
}

// ¿El Alcance está probado contra el sistema real? Base: api/e2e-ui.
// DP-12: para objetivos de infra ACEPTADOS, integration/gate es equivalente.
function hasScopeProof(m) {
  const evidence = Array.isArray(m && m.evidence) ? m.evidence : [];
  if (evidence.some((e) => e && PROOF_KINDS.includes(e.kind))) return true;
  if (
    isInfra(m) &&
    (m.status && m.status.decision) === 'ACEPTADA' &&
    evidence.some((e) => e && INFRA_PROOF_KINDS.includes(e.kind) && e.command && String(e.command).trim())
  ) {
    return true;
  }
  return false;
}

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

module.exports = { c, DIMENSIONS, DECISION, IMPLEMENTATION, LIFECYCLE, EVIDENCE_KINDS, PROOF_KINDS, INFRA_PROOF_KINDS, FRONT_DESIGN_SKILLS, isInfra, hasScopeProof, die, readJSON, writeFileSafe, findConfig, loadConfig };
