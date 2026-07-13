'use strict';
const fs = require('fs');
const path = require('path');
const { c, DIMENSIONS, DECISION, IMPLEMENTATION, LIFECYCLE, EVIDENCE_KINDS, INFRA_PROOF_KINDS, FRONT_DESIGN_SKILLS, isInfra, hasScopeProof, governanceGrantsInfraProof, isPresenceOnlyCommand, isPendingDecision, loadGovernance, readJSON } = require('./util');
const { resolveGraphPath, loadGraph } = require('./graph');

// A finding is { sev: 'BLOCKER'|'WARN', code, msg }.
// BLOCKER => non-zero exit => MODO BLOQUEO (CAPA §7 · ADR-0017).

function routeNodeCount(graph, prefix) {
  let n = 0;
  for (const node of graph.nodes()) if ((node.source_file || '').startsWith(prefix)) n++;
  return n;
}

// `gov` = governance.json del ADR padre (o null). Es lo que habilita la palanca DP-12.
function lintCapa(dir, graph, gov = null) {
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
  const pending = decisions.filter(isPendingDecision);
  if (pending.length) warn('PODER', `${pending.length} firma(s) pendiente(s): ${pending.map((d) => d.id).join(', ')}`);

  // E9 — LA REGLA DURA DE ASEGURAMIENTO. No se pasa a 'done' sin (a) una prueba
  // real del Alcance (evidencia kind 'api' o 'e2e-ui') y (b) cero firmas pendientes.
  const lifecycle = m.lifecycle || 'wip';
  if (!LIFECYCLE.includes(lifecycle)) blk('E9', `lifecycle inválido (${lifecycle}); usar ${LIFECYCLE.join('|')}`);
  for (const ev of evidence) {
    if (ev && ev.kind && !EVIDENCE_KINDS.includes(ev.kind)) warn('E9', `evidencia kind inválido (${ev.kind})`);
  }
  const govGrants = governanceGrantsInfraProof(gov);
  if (lifecycle === 'done') {
    // Regla base: prueba del Alcance = api/e2e-ui. DP-12: un objetivo de infra
    // (infra:true, decisión ACEPTADA) la satisface con integration/gate — pero SÓLO
    // si el ADR padre firmó DP-12 en su governance.json.
    if (!hasScopeProof(m, gov)) {
      let detail;
      if (!isInfra(m)) {
        detail = `falta evidencia kind 'api' o 'e2e-ui' (no basta unit/graph). Si es objetivo de infra sin superficie, declará infra:true, firmá DP-12 en el governance.json del ADR y adjuntá prueba 'integration'/'gate' (DP-12)`;
      } else if (!govGrants) {
        detail = `el ADR padre NO firmó DP-12 en su governance.json — infra:true no habilita por sí solo la palanca de Alcance (DP-12)`;
      } else {
        detail = `falta evidencia kind 'integration' o 'gate' con comando reproducible y decisión ACEPTADA (DP-12)`;
      }
      blk('E9', `'done' sin prueba del Alcance: ${detail}`);
    }
    if (pending.length) blk('E9', `'done' con ${pending.length} firma(s) pendiente(s): ${pending.map((d) => d.id).join(', ')}`);
  }

  // E12 — DP-12 higiene: si el objetivo se apoya en prueba de infra (integration/gate)
  // debe (a) declararse infra:true, (b) tener la decisión ACEPTADA y (c) colgar de un ADR que
  // FIRMÓ DP-12 en su governance.json. Si falta cualquiera, la prueba no cuenta.
  //
  // (c) es el cierre del agujero de gobernanza: `infra:true` lo escribe el mismo manifest, así que
  // sin la firma de la visión el objetivo era juez y parte de su propio Alcance.
  //
  // Un objetivo que se DECLARA 'E2E-VERIFIED' está afirmando que su Alcance quedó probado.
  // Si esa afirmación se apoya en una prueba de infra que NO califica, la afirmación no tiene
  // respaldo: BLOQUEO, no aviso.
  const usesInfraProof = evidence.some((e) => e && INFRA_PROOF_KINDS.includes(e.kind));
  const claimsVerified = st.implementation === 'E2E-VERIFIED';
  if (usesInfraProof) {
    const e12 = claimsVerified ? blk : warn;
    if (!isInfra(m)) e12('E12', `evidencia 'integration'/'gate' presente pero manifest.infra != true — no cuenta como prueba de Alcance (DP-12)${claimsVerified ? ` y el manifest se declara '${st.implementation}'` : ''}`);
    else if (st.decision !== 'ACEPTADA') e12('E12', `prueba de infra (DP-12) exige status.decision=ACEPTADA (actual: ${st.decision})${claimsVerified ? ` — un objetivo '${st.implementation}' no puede apoyarse en una prueba que DP-12 no cuenta` : ''}`);
    else if (!govGrants) e12('E12', `prueba de infra (DP-12) invocada pero el ADR padre no firmó DP-12 en su governance.json — infra:true en el manifest no se auto-otorga la palanca${claimsVerified ? ` y el manifest se declara '${st.implementation}'` : ''}`);
    else {
      // Palanca DP-12 concedida: sigue exigiendo que la prueba EJERZA comportamiento. Si toda la
      // evidencia integration/gate es solo-presencia (bash -n / test -f / compose config), es
      // andamio, no Alcance. (No ve el cuerpo de un `dotnet test` — esa clase la caza el lint de fuente.)
      const real = evidence.filter((e) => e && INFRA_PROOF_KINDS.includes(e.kind) && e.command && String(e.command).trim());
      if (real.length && real.every((e) => isPresenceOnlyCommand(e.command))) {
        e12('E12', `la prueba de infra (DP-12) es SOLO-PRESENCIA (bash -n / test -f / compose config) — constata que el artefacto existe, no que el comportamiento corre${claimsVerified ? `, y el manifest se declara '${st.implementation}'` : ''}`);
      }
    }
  }

  // E13 — anti-teatro de DOSSIER: E3 verifica que las dimensiones EXISTAN; E13 que estén ESCRITAS.
  // Una dimensión que sigue siendo la plantilla (marcadores <!-- ... --> sin llenar) no es CAPA: hay
  // estado en el manifest pero sin el porqué/alcance/aseguramiento redactado.
  //
  // Escalado a BLOQUEO cuando el objetivo se declara 'E2E-VERIFIED': anunciar el grado máximo de
  // verificación con el dossier en plantilla es exactamente el teatro que este check existe para
  // atrapar. Para el resto del backlog (PARTIAL, etc.) sigue siendo aviso, para no reventar el gate
  // de PR de una: el backfill se paga por objetivo, a medida que cada uno reclama estar verificado.
  if (st.implementation && st.implementation !== 'NONE') {
    const TEMPLATE_MARKERS = [
      '<!-- ¿Qué duele', '<!-- P1, P2, P3', '<!-- Con qué otros ADR',
      '<!-- Por modelo', '_PROPUESTA \\| ACEPTADA \\| RECHAZADA_', '<!-- No basta HTTP 200',
      '<!-- Cada claim de implementación', '<!-- Mantener sincronizado con manifest.json.decisions',
    ];
    const skeleton = [];
    for (const d of DIMENSIONS) {
      let txt = '';
      try { txt = fs.readFileSync(path.join(dir, `${d}.md`), 'utf8'); } catch { continue; }
      if (TEMPLATE_MARKERS.some((mk) => txt.includes(mk))) skeleton.push(d);
    }
    if (skeleton.length) {
      const e13 = st.implementation === 'E2E-VERIFIED' ? blk : warn;
      e13('E13', `dossier esqueleto (plantilla sin llenar) en ${skeleton.join(', ')} — hay estado '${st.implementation}' en el manifest pero SIN CAPA escrita (teatro de dossier)`);
    }
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
  if (!graphPath) { console.error(c.red('✗ ') + 'falta graphify-out/graph.json — corré `graphify update .`'); return void (process.exitCode = 2); }
  const graph = loadGraph(graphPath);
  console.log(c.dim(`grafo: ${path.relative(root, graphPath)} · ${graph.nodeCount} nodos · commit ${graph.builtAtCommit || '?'}`));
  if (!fs.existsSync(capaDir)) { console.error(c.red('✗ ') + `no existe ${capaDir}`); return void (process.exitCode = 2); }

  let capas = findCapas(capaDir).map((d) => ({ dir: d, rel: path.relative(capaDir, d) }));
  if (onlyAdr) capas = capas.filter((x) => x.rel.toLowerCase().includes(onlyAdr.toLowerCase()));
  if (!capas.length) { console.error(c.red('✗ ') + 'no hay CAPAs para revisar (creá uno con `capa new`)'); return void (process.exitCode = 2); }

  let blockers = 0, warns = 0;
  const govCache = new Map(); // adrDir -> governance.json (o null)
  for (const { dir, rel } of capas.sort((a, b) => a.rel.localeCompare(b.rel))) {
    const adrKey = rel.split(path.sep)[0];
    if (!govCache.has(adrKey)) govCache.set(adrKey, loadGovernance(capaDir, dir));
    const findings = lintCapa(dir, graph, govCache.get(adrKey));
    const b = findings.filter((f) => f.sev === 'BLOCKER');
    const w = findings.filter((f) => f.sev === 'WARN');
    blockers += b.length; warns += w.length;
    console.log(`\n${c.bold(rel)}  ${b.length ? c.red('BLOQUEO') : c.green('OK')}`);
    for (const f of b) console.log('  ' + c.red(`✗ [${f.code}] `) + f.msg);
    for (const f of w) console.log('  ' + c.yellow(`⚠ [${f.code}] `) + f.msg);
    if (!findings.length) console.log('  ' + c.green('✓ sin observaciones'));
  }

  console.log('\n' + c.bold('Resumen: ') + `${capas.length} CAPA(s) · ${blockers ? c.red(blockers + ' bloqueo(s)') : c.green('0 bloqueos')} · ${warns} aviso(s)`);
  if (blockers) { console.log(c.red('\nMODO BLOQUEO — no se aprueba PR hasta cerrar los bloqueos (CAPA §7 · ADR-0017).')); return void (process.exitCode = 1); }
}

module.exports = { runDoctor, lintCapa, findCapas };
