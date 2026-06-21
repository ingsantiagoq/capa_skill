'use strict';
const fs = require('fs');
const path = require('path');
const { c, DIMENSIONS, DECISION, IMPLEMENTATION, LIFECYCLE, EVIDENCE_KINDS, PROOF_KINDS, FRONT_DESIGN_SKILLS, readJSON } = require('./util');
const { resolveGraphPath, loadGraph } = require('./graph');

// A finding is { sev: 'BLOCKER'|'WARN', code, msg }.
// BLOCKER => non-zero exit => MODO BLOQUEO (CAPA §7 · ADR-0017).

function routeNodeCount(graph, prefix) {
  let n = 0;
  for (const node of graph.nodes()) if ((node.source_file || '').startsWith(prefix)) n++;
  return n;
}

function lintCapa(dir, graph) {
  const findings = [];
  const blk = (code, msg) => findings.push({ sev: 'BLOCKER', code, msg });
  const warn = (code, msg) => findings.push({ sev: 'WARN', code, msg });

  let m;
  try { m = readJSON(path.join(dir, 'manifest.json')); } catch (e) { blk('E1', `manifest.json ilegible: ${e.message}`); return findings; }

  const st = m.status || {};
  if (!DECISION.includes(st.decision)) blk('E2', `status.decision inválido (${st.decision})`);
  if (!IMPLEMENTATION.includes(st.implementation)) blk('E2', `status.implementation inválido (${st.implementation})`);

  for (const d of DIMENSIONS) if (!fs.existsSync(path.join(dir, `${d}.md`))) blk('E3', `falta dimensión ${d}.md`);

  const anchors = Array.isArray(m.anchors) ? m.anchors : [];
  let resolved = 0;
  for (const a of anchors) {
    if (!a || !a.id) { warn('E4', 'ancla sin id'); continue; }
    if (graph.has(a.id)) resolved++;
    else blk('E4', `ancla NO existe en el grafo (drift): ${a.id} ${a.label ? `(${a.label})` : ''}`);
  }

  const evidence = Array.isArray(m.evidence) ? m.evidence : [];
  for (const ev of evidence) {
    if (!ev || !ev.command || !String(ev.command).trim()) blk('E5', `evidencia sin comando reproducible (teatro): "${(ev && ev.claim) || '??'}"`);
  }

  if (st.implementation === 'E2E-VERIFIED') {
    if (!st.verified_against) blk('E6', 'E2E-VERIFIED sin status.verified_against');
    if (!evidence.some((e) => e && e.command)) blk('E6', 'E2E-VERIFIED sin ninguna evidencia con comando');
    if (resolved === 0) blk('E6', 'E2E-VERIFIED pero ninguna ancla resuelve en el grafo');
  }
  if (st.implementation && st.implementation !== 'NONE' && resolved === 0) blk('E7', `implementation=${st.implementation} pero 0 anclas vivas`);

  // E8 — la ruta debe existir en el grafo (si no, el CAPA apunta a código que no está).
  const route = Array.isArray(m.route) ? m.route : [];
  if (st.implementation && st.implementation !== 'NONE' && route.length === 0) {
    warn('E8', 'sin route: no se pueden hilar dependencias (`capa thread`)');
  }
  for (const pfx of route) {
    if (routeNodeCount(graph, pfx) === 0) blk('E8', `route sin nodos en el grafo (stale): ${pfx}`);
  }

  const decisions = Array.isArray(m.decisions) ? m.decisions : [];
  const pending = decisions.filter((d) => d && d.state === 'pending');
  if (pending.length) warn('PODER', `${pending.length} firma(s) pendiente(s): ${pending.map((d) => d.id).join(', ')}`);

  // E9 — LA REGLA DURA DE ASEGURAMIENTO. No se pasa a 'done' sin (a) una prueba
  // real del Alcance (evidencia kind 'api' o 'e2e-ui') y (b) cero firmas pendientes.
  const lifecycle = m.lifecycle || 'wip';
  if (!LIFECYCLE.includes(lifecycle)) blk('E9', `lifecycle inválido (${lifecycle}); usar ${LIFECYCLE.join('|')}`);
  for (const ev of evidence) {
    if (ev && ev.kind && !EVIDENCE_KINDS.includes(ev.kind)) warn('E9', `evidencia kind inválido (${ev.kind})`);
  }
  if (lifecycle === 'done') {
    const hasProof = evidence.some((e) => e && PROOF_KINDS.includes(e.kind));
    if (!hasProof) blk('E9', `'done' sin prueba del Alcance: falta evidencia kind 'api' o 'e2e-ui' (no basta unit/graph)`);
    if (pending.length) blk('E9', `'done' con ${pending.length} firma(s) pendiente(s): ${pending.map((d) => d.id).join(', ')}`);
  }

  // E10 — un CAPA de frontend depende de las 3 skills de diseño (apariencia completa).
  if (m.frontend === true) {
    const req = Array.isArray(m.requiresSkills) ? m.requiresSkills : [];
    const missing = FRONT_DESIGN_SKILLS.filter((s) => !req.includes(s));
    if (missing.length) blk('E10', `CAPA de frontend sin declarar skills de diseño: ${missing.join(', ')} (manifest.requiresSkills)`);
  }

  return findings;
}

// Recursively find every dir that contains a manifest.json (a CAPA).
function findCapas(rootDir) {
  const out = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name === 'manifest.json')) out.push(dir);
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name));
  })(rootDir);
  return out;
}

function runDoctor({ root, config, onlyAdr }) {
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  const graphPath = resolveGraphPath(root, config.graph);
  if (!graphPath) { console.error(c.red('✗ ') + 'falta graphify-out/graph.json — corré `graphify update .`'); process.exit(2); }
  const graph = loadGraph(graphPath);
  console.log(c.dim(`grafo: ${path.relative(root, graphPath)} · ${graph.nodeCount} nodos · commit ${graph.builtAtCommit || '?'}`));
  if (!fs.existsSync(capaDir)) { console.error(c.red('✗ ') + `no existe ${capaDir}`); process.exit(2); }

  let capas = findCapas(capaDir).map((d) => ({ dir: d, rel: path.relative(capaDir, d) }));
  if (onlyAdr) capas = capas.filter((x) => x.rel.toLowerCase().includes(onlyAdr.toLowerCase()));
  if (!capas.length) { console.error(c.red('✗ ') + 'no hay CAPAs para revisar (creá uno con `capa new`)'); process.exit(2); }

  let blockers = 0, warns = 0;
  for (const { dir, rel } of capas.sort((a, b) => a.rel.localeCompare(b.rel))) {
    const findings = lintCapa(dir, graph);
    const b = findings.filter((f) => f.sev === 'BLOCKER');
    const w = findings.filter((f) => f.sev === 'WARN');
    blockers += b.length; warns += w.length;
    console.log(`\n${c.bold(rel)}  ${b.length ? c.red('BLOQUEO') : c.green('OK')}`);
    for (const f of b) console.log('  ' + c.red(`✗ [${f.code}] `) + f.msg);
    for (const f of w) console.log('  ' + c.yellow(`⚠ [${f.code}] `) + f.msg);
    if (!findings.length) console.log('  ' + c.green('✓ sin observaciones'));
  }

  console.log('\n' + c.bold('Resumen: ') + `${capas.length} CAPA(s) · ${blockers ? c.red(blockers + ' bloqueo(s)') : c.green('0 bloqueos')} · ${warns} aviso(s)`);
  if (blockers) { console.log(c.red('\nMODO BLOQUEO — no se aprueba PR hasta cerrar los bloqueos (CAPA §7 · ADR-0017).')); process.exit(1); }
}

module.exports = { runDoctor, lintCapa, findCapas };
