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

// --- DP-12: la palanca de infra es una CONCESIÓN DE GOBERNANZA, no una bandera del manifest ---
//
// `infra: true` lo escribe el agente que redacta el manifest. Si eso bastara para cobrar Alcance
// vía integration/gate, cualquier objetivo se auto-otorgaría E2E escribiendo dos campos: el
// manifest sería juez y parte. La palanca sólo vale si la VISIÓN (el ADR padre) la firmó en su
// `governance.json`.
//
// Ojo con el id: los `DP-N` están numerados POR ADR, no globalmente. ADR-0016 también tiene un
// `DP-12` firmado y con `gate:true`, pero decide el molde de `pago-participante-posteo` — nada que
// ver con la prueba de infra. Casar por id desnudo regalaría la palanca a ADR-0016. Por eso el
// marcador canónico es `grants: "infra-scope-proof"`; el id se usa sólo como respaldo legacy y
// exige que la decisión se describa a sí misma.
const INFRA_PROOF_GRANT = 'infra-scope-proof';

// El campo de estado de una decisión está ESCRITO EN DOS IDIOMAS en los manifest.json del repo:
// `state` (107 decisiones) y `estado` (38). No es un rename a medio hacer: ambos conviven hoy.
// Leer sólo `state` dejaba CIEGO al gate PODER frente a 23 firmas `estado: 'pending'` reales
// (todas bajo ADR-0003/0004). Normalizamos en un solo lugar en vez de repetir el `||` en 4 sitios.
//
// OJO — esto es deliberadamente ASIMÉTRICO: `isInfraProofGrant` NO usa este helper y sigue leyendo
// `d.state` desnudo. Los governance.json (donde vive la palanca DP-12) usan `state` de forma
// uniforme (51/51 decisiones), así que ahí no hay nada que normalizar; y aceptar `estado: 'signed'`
// sólo podría OTORGAR la palanca de infra a decisiones que hoy no la tienen — aflojar el gate.
// Este helper únicamente APRIETA (hace visibles más pendientes). Nunca lo uses para conceder.
function decisionState(d) {
  if (!d) return '';
  const raw = d.state !== undefined ? d.state : d.estado;
  return String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
}

// ¿La decisión está pendiente de firma? Sólo el literal 'pending' (en cualquiera de los dos campos).
// NO cuenta 'propuesta'/'proposed' (4 decisiones): son un tercer dialecto sin firmante asignado y
// meterlos aquí bloquearía E9 en objetivos ya cerrados. Ver nota al pie del fix.
function isPendingDecision(d) {
  return decisionState(d) === 'pending';
}

function isInfraProofGrant(d) {
  if (!d || d.state !== 'signed') return false;
  if (d.grants === INFRA_PROOF_GRANT) return true; // marcador explícito, a prueba de colisión de ids
  // Respaldo legacy: la DP-12 de ADR-0001, firmada antes de que existiera `grants`.
  // Se exige que el texto de la decisión sea el de la palanca, no sólo que el id coincida.
  return d.id === 'DP-12' && d.gate === true && /E2E-VERIFIED/.test(String(d.what || ''));
}

// ¿La visión (ADR padre) firmó DP-12 y por tanto habilita la palanca de infra?
function governanceGrantsInfraProof(gov) {
  const decisions = Array.isArray(gov && gov.decisions) ? gov.decisions : [];
  return decisions.some(isInfraProofGrant);
}

// Directorio del ADR que contiene un CAPA (primer segmento bajo capaDir).
function adrDirOf(capaDir, dir) {
  const rel = path.relative(capaDir, dir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const seg = rel.split(path.sep)[0];
  return seg ? path.join(capaDir, seg) : null;
}

// governance.json del ADR padre, o null si no existe / es ilegible.
function loadGovernance(capaDir, dir) {
  const adrDir = adrDirOf(capaDir, dir);
  if (!adrDir) return null;
  const p = path.join(adrDir, 'governance.json');
  if (!fs.existsSync(p)) return null;
  try { return readJSON(p); } catch { return null; }
}

// ¿El Alcance está probado contra el sistema real? Base: api/e2e-ui — siempre vale.
// DP-12: para objetivos de infra ACEPTADOS, integration/gate es equivalente, PERO sólo si el ADR
// padre firmó la palanca en su governance.json. Sin esa firma, integration/gate no compra Alcance.
function hasScopeProof(m, gov) {
  const evidence = Array.isArray(m && m.evidence) ? m.evidence : [];
  if (evidence.some((e) => e && PROOF_KINDS.includes(e.kind))) return true;
  if (
    isInfra(m) &&
    (m.status && m.status.decision) === 'ACEPTADA' &&
    governanceGrantsInfraProof(gov) &&
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

module.exports = { c, DIMENSIONS, DECISION, IMPLEMENTATION, LIFECYCLE, EVIDENCE_KINDS, PROOF_KINDS, INFRA_PROOF_KINDS, INFRA_PROOF_GRANT, FRONT_DESIGN_SKILLS, isInfra, hasScopeProof, governanceGrantsInfraProof, decisionState, isPendingDecision, adrDirOf, loadGovernance, die, readJSON, writeFileSafe, findConfig, loadConfig };
