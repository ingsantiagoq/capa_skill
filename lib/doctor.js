'use strict';
const fs = require('fs');
const path = require('path');
const { c, DIMENSIONS, DECISION, IMPLEMENTATION, LIFECYCLE, EVIDENCE_KINDS, INFRA_PROOF_KINDS, FRONT_DESIGN_SKILLS, isInfra, hasScopeProof, governanceGrantsInfraProof, isPresenceOnlyCommand, isPendingDecision, loadGovernance, readJSON } = require('./util');
const { loadGraph, chooseGraph, graphFrameRoots, relativeInside, GRAPH_INDEX_FILENAME } = require('./graph');
const { normalizeRouteEntry, routeCandidatesInFrame } = require('./route');

// A finding is { sev: 'BLOCKER'|'WARN', code, msg }.
// BLOCKER => non-zero exit => MODO BLOQUEO (CAPA §7 · ADR-0017).

function routeNodeCount(graph, prefix) {
  let n = 0;
  for (const node of graph.nodes()) if ((node.source_file || '').startsWith(prefix)) n++;
  return n;
}

// La entrada de route puede estar escrita desde la raíz CAPA o desde la raíz del
// grafo (ver lib/route.js). Basta que UNA de las formas equivalentes tenga nodos:
// todas nombran el mismo directorio. Sin `root` (llamadas viejas de 3 args) se
// comporta como antes.
function routeHasNodes(graph, root, entry, offset) {
  const forms = root ? routeCandidatesInFrame(root, entry, offset) : [entry];
  // `hasFilePrefix` es el mismo startsWith pero por búsqueda binaria; un grafo de prueba (o viejo)
  // que no lo tenga cae al barrido lineal de siempre.
  if (typeof graph.hasFilePrefix === 'function') return forms.some((form) => graph.hasFilePrefix(form));
  return forms.some((form) => routeNodeCount(graph, form) > 0);
}

// Las raíces desde las que se escriben las entradas de `route`: la raíz CAPA (la carpeta con
// capa.config.json), la del grafo (con `"graph": "../graphify-out/graph.json"` es su padre) y el
// workspace que las contiene. Una entrada escrita desde una no resuelve contra la otra, y las tres
// formas conviven en los manifests.
//
// El workspace entra SIEMPRE, y no derivado del grafo elegido, porque si `ubp-app/src` existe en el
// disco no depende de cuál `graph.json` ganó la medición. Que exista fuera del marco del grafo no se
// tapa: eso es lo que marca al objetivo como SOSPECHOSO más abajo.
function diskBases(root, graph) {
  if (!root) return [];
  const capaRoot = path.resolve(root);
  const gp = graph && graph.path;
  const bases = [capaRoot, ...(gp ? graphFrameRoots(gp) : []), path.dirname(capaRoot)];
  return [...new Set(bases)];
}

/**
 * ¿La ruta existe en el DISCO?
 *
 * Es la pregunta que E8 hace de verdad — «¿el CAPA apunta a código que no está?» — y el grafo
 * sólo es un proxy INCOMPLETO de ella: graphify no indexa `.proto` ni `.yml` (medido 2026-09-06
 * sobre el grafo de la raíz: 0 nodos de cada uno, contra 202.251 `.cs` y 52.064 `.md`), ni los
 * `.seed.json` bajo `Catalogs/`. Una route a un proto o a un compose no tiene nodos y no puede
 * tenerlos NUNCA, así que exigirlos bloqueaba por construcción.
 *
 * Medido en ADR-0025: de 22 rutas marcadas «stale», 19 apuntaban a archivos existentes. Un gate
 * que grita 19 veces por cada 3 defectos deja de leerse — y con él se pierden los que sí importan
 * (deriva real de anclas [E4] y teatro de evidencia [E5]).
 *
 * No afloja el guard: `route` sigue acotando qué archivos se pueden editar (lib/runtime/
 * guard-manifest.js), y esto sólo decide si el doctor la considera viva.
 *
 * `offset` (el prefijo con el que la raíz CAPA aparece dentro del grafo elegido) entra acá por la
 * misma razón que en `routeHasNodes`: en un worktree la carpeta se llama distinto que el repo, y
 * `routeCandidates` sólo sabe adivinar el prefijo por el nombre de la carpeta.
 */
function resolveRouteOnDisk(bases, root, entry, offset) {
  if (!bases.length) return null;
  const forms = root ? routeCandidatesInFrame(root, entry, offset) : [entry];
  for (const form of forms) {
    for (const base of bases) {
      const abs = path.resolve(base, form);
      if (fs.existsSync(abs)) return abs;
    }
  }
  return null;
}

// Repos hermanos del workspace, para convertir un [E8] en algo accionable. Memoizado por carpeta:
// `lintCapa` corre 1651 veces por corrida y el readdir es el mismo para todas.
const hermanosCache = new Map();
function reposHermanos(dir) {
  if (!hermanosCache.has(dir)) {
    let nombres = [];
    try { nombres = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name); }
    catch { /* sin permiso de lectura no hay pista que dar */ }
    hermanosCache.set(dir, nombres);
  }
  return hermanosCache.get(dir);
}

/**
 * ¿La entrada existe bajo OTRO repo del workspace? Es el defecto de «route escrita desde una tercera
 * raíz»: `src/app/features/gl/gl-journal-list.page.ts` no resuelve ni desde la raíz CAPA ni desde el
 * workspace, pero sí desde `ubp-app/`. Sigue siendo un defecto —esa forma es ambigua, cualquier repo
 * tiene un `src/`— pero el mensaje deja de ser un callejón sin salida y dice el prefijo que falta.
 */
function hermanoQueLaTiene(root, entry) {
  const norm = normalizeRouteEntry(entry);
  if (!norm || norm.startsWith('..') || path.isAbsolute(norm)) return null;
  const ws = path.dirname(path.resolve(root));
  const hits = reposHermanos(ws).filter((n) => fs.existsSync(path.join(ws, n, norm)));
  return hits.length ? hits : null;
}

/**
 * Rutas de ESTE objetivo que existen en el disco pero caen FUERA del árbol que el grafo indexó.
 *
 * Es el estado que faltaba entre 'ok' y 'mismatch'. El veredicto de marco se toma por CORPUS
 * (doctor.js → chooseGraph), y con eso alcanza para cazar el caso catastrófico —el grafo es de otro
 * árbol y NADA cubre—, pero no el intermedio: medido en el bundle cc-sucursal-bodega, el grafo local
 * del backend cubre 1388/1645 rutas (84,4 %), muy por encima de FRAME_COVERAGE_MIN_RATIO = 0,1, así
 * que el veredicto sale 'ok' y los objetivos que viven en las otras 257 rutas siguen cosechando
 * [E4]/[E8] falsos SIN UN SOLO AVISO. La medición 8/8 vs 0/8 que justifica el umbral es POR OBJETIVO;
 * el veredicto se toma por corpus, y esa brecha es justo donde se esconde el falso positivo.
 *
 * Acá se pregunta por objetivo y por geometría, no por cobertura: si la route resuelve a un absoluto
 * que no está bajo ninguna raíz del marco del grafo, ese grafo NO PUEDE opinar sobre este objetivo.
 */
function rutasFueraDeMarco(bases, frames, root, route, offset) {
  if (!root || !frames.length) return [];
  const fuera = [];
  for (const entry of route) {
    const abs = resolveRouteOnDisk(bases, root, entry, offset);
    if (!abs) continue; // no existe: eso lo juzga E8, no es cuestión de marco
    if (!frames.some((f) => relativeInside(f, abs) !== null)) fuera.push(entry);
  }
  return fuera;
}

// `gov` = governance.json del ADR padre (o null). Es lo que habilita la palanca DP-12.
// `opts.routeOffset` = prefijo con el que la raíz CAPA aparece dentro del grafo elegido (ver
// lib/graph.js → graphFrameOffset). Default null = comportamiento previo.
function lintCapa(dir, graph, gov = null, root = null, opts = {}) {
  const findings = [];
  const blk = (code, msg) => findings.push({ sev: 'BLOCKER', code, msg });
  const warn = (code, msg) => findings.push({ sev: 'WARN', code, msg });

  let m;
  try { m = readJSON(path.join(dir, 'manifest.json')); } catch (e) { blk('E1', `manifest.json ilegible: ${e.message}`); return findings; }

  const st = m.status || {};
  if (!DECISION.includes(st.decision)) blk('E2', `status.decision inválido (${st.decision})`);
  if (!IMPLEMENTATION.includes(st.implementation)) blk('E2', `status.implementation inválido (${st.implementation})`);

  for (const d of DIMENSIONS) if (!fs.existsSync(path.join(dir, `${d}.md`))) blk('E3', `falta dimensión ${d}.md`);

  // El disco se consulta PRIMERO: además de ser la pregunta correcta, es O(1) contra un
  // `routeNodeCount` que recorre los 450k nodos del grafo por cada forma de cada entrada.
  const route = Array.isArray(m.route) ? m.route : [];
  const bases = diskBases(root, graph);
  const frames = opts.frameRoots || (graph && graph.path ? graphFrameRoots(graph.path) : []);
  const fueraDeMarco = rutasFueraDeMarco(bases, frames, root, route, opts.routeOffset);

  // Este objetivo vive (al menos en parte) fuera del árbol que el grafo indexó, así que el grafo no
  // puede afirmar nada sobre sus anclas: sus [E4]/[E6]/[E7] serían ciertos sobre el grafo y falsos
  // sobre el código, que es la mentira PESIMISTA que este doctor existe para no cometer. Se degradan
  // a aviso diciendo por qué, en vez de bloquear.
  //
  // No abre una puerta para silenciar deriva real: la sospecha exige que la route EXISTA en el disco
  // fuera del marco. Una route inventada no existe ⇒ [E8] la bloquea igual, y la que la disparó
  // aparece nombrada en el aviso y contada en el encabezado.
  const sospechoso = fueraDeMarco.length > 0;
  const porque = sospechoso
    ? ` — SOSPECHOSO: el grafo indexa ${[...new Set(frames.map((f) => path.basename(f)))].join(' o ')}/ y este objetivo declara `
      + `route fuera de ese marco (${fueraDeMarco.join(', ')}), así que no puede juzgar sus anclas`
    : '';
  const drift = sospechoso ? warn : blk;

  const anchors = Array.isArray(m.anchors) ? m.anchors : [];
  let resolved = 0;
  for (const a of anchors) {
    if (!a || !a.id) { warn('E4', 'ancla sin id'); continue; }
    if (graph.has(a.id)) resolved++;
    else drift('E4', `ancla NO existe en el grafo (drift): ${a.id} ${a.label ? `(${a.label})` : ''}${porque}`);
  }

  const evidence = Array.isArray(m.evidence) ? m.evidence : [];
  for (const ev of evidence) {
    if (!ev || !ev.command || !String(ev.command).trim()) blk('E5', `evidencia sin comando reproducible (teatro): "${(ev && ev.claim) || '??'}"`);
  }

  if (st.implementation === 'E2E-VERIFIED') {
    if (!st.verified_against) blk('E6', 'E2E-VERIFIED sin status.verified_against');
    if (!evidence.some((e) => e && e.command)) blk('E6', 'E2E-VERIFIED sin ninguna evidencia con comando');
    // Las otras dos ramas de E6 no miran el grafo y siguen bloqueando; ésta sí, así que hereda la
    // sospecha por la misma razón que E4.
    if (resolved === 0) drift('E6', `E2E-VERIFIED pero ninguna ancla resuelve en el grafo${porque}`);
  }
  if (st.implementation && st.implementation !== 'NONE' && resolved === 0) {
    drift('E7', `implementation=${st.implementation} pero 0 anclas vivas${porque}`);
  }

  // E8 — la ruta debe existir: en el DISCO (la pregunta real) o, para artefactos generados, en el
  // grafo. Si no está en ninguno de los dos, el CAPA apunta a código que no está.
  if (st.implementation && st.implementation !== 'NONE' && route.length === 0) {
    warn('E8', 'sin route: no se pueden hilar dependencias (`capa thread`)');
  }
  for (const pfx of route) {
    if (resolveRouteOnDisk(bases, root, pfx, opts.routeOffset)) continue;
    if (routeHasNodes(graph, root, pfx, opts.routeOffset)) continue;
    // Antes de dar el veredicto, la pista que lo vuelve accionable: la entrada puede estar escrita
    // desde la raíz de OTRO repo del workspace, que no es ninguna de las dos formas que lib/route.js
    // reconoce. Sigue siendo defecto —`src/...` es ambiguo, cualquier repo tiene un `src/`— pero el
    // arreglo es una línea y el mensaje ahora la dice.
    const hermanos = root ? hermanoQueLaTiene(root, pfx) : null;
    if (hermanos) {
      blk('E8', `route escrita desde la raíz de otro repo (no resuelve desde acá): ${pfx} — existe bajo `
        + `${hermanos.map((h) => `${h}/`).join(' y ')}; prefijala (p. ej. "${hermanos[0]}/${normalizeRouteEntry(pfx)}")`);
      continue;
    }
    blk('E8', `route inexistente — no está en el disco ni en el grafo (stale): ${pfx}`);
  }
  if (sospechoso) {
    warn('E8', `${fueraDeMarco.length} route(s) fuera del marco del grafo (${fueraDeMarco.join(', ')}): existen en el disco `
      + `pero el grafo elegido no las indexa, así que los [E4]/[E6]/[E7] de este objetivo quedan como SOSPECHOSOS, `
      + `no como deriva. Para juzgarlos de verdad hace falta un grafo del árbol que las contiene.`);
  }

  const decisions = Array.isArray(m.decisions) ? m.decisions : [];
  const pending = decisions.filter(isPendingDecision);
  if (pending.length) warn('PODER', `${pending.length} firma(s) pendiente(s): ${pending.map((d) => d.id).join(', ')}`);

  // E11 — slices invisibles al tablero. El dashboard cuenta `s.done` (booleano · dashboard.js);
  // un slice que declara su cierre en OTRO vocabulario (estado/status/state: done|hecho|e2e-verified…)
  // renderiza 0/N aunque el trabajo esté hecho — el tablero miente por omisión. Barrido 2026-07-26:
  // 30 objetivos / 97 slices invisibles, drift acumulado por sesiones que inventaron su dialecto.
  //
  // AVISO, no bloqueo: el defecto es de VISIBILIDAD, no de verdad — el manifest no afirma nada falso,
  // solo lo dice donde el tablero no mira. Fix: agregar `done: true` SIN borrar el campo original.
  // Un slice con `done` explícito (aunque sea false) no avisa: eso es un override deliberado.
  const DONEISH_SLICE = ['done', 'hecho', 'ok', 'completo', 'completa', 'e2e', 'e2e-verified', 'entregado', 'cerrado', 'delivered'];
  const slices = Array.isArray(m.slices) ? m.slices : [];
  const invisibles = slices.filter((s) => s && typeof s === 'object' && !Array.isArray(s) && !('done' in s)
    && ['estado', 'state', 'status'].some((k) => DONEISH_SLICE.includes(String(s[k] == null ? '' : s[k]).trim().toLowerCase())));
  if (invisibles.length) {
    const ids = invisibles.map((s) => s.id || s.slice || s.nombre || s.name || '?');
    warn('E11', `${invisibles.length} slice(s) cerrados en un vocabulario que el tablero NO lee (estado/status/state sin \`done\`): ${ids.slice(0, 4).join(', ')}${ids.length > 4 ? '…' : ''} — el dashboard cuenta s.done; agregá done:true conservando el campo original`);
  }

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

// Rutas que los dossiers declaran — el patrón contra el que se mide si el grafo habla de su mismo
// árbol. Se descartan dos clases de ruido conocidas que NUNCA tienen nodos y ensuciarían la medición:
// las que apuntan al propio dossierDir (markdown) y las que se escapan de la raíz CAPA ('..').
function declaredRoutePaths(capaDirs, root, dossierRel) {
  const out = [];
  const seen = new Set();
  for (const dir of capaDirs) {
    let m;
    try { m = readJSON(path.join(dir, 'manifest.json')); } catch { continue; }
    for (const entry of Array.isArray(m.route) ? m.route : []) {
      const norm = normalizeRouteEntry(entry);
      if (!norm || norm.startsWith('..') || seen.has(norm)) continue;
      const forms = routeCandidatesInFrame(root, norm, null);
      if (forms.some((f) => f === dossierRel || f.startsWith(`${dossierRel}/`))) continue;
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

// El fallo que este bloque existe para evitar: con un grafo de OTRO árbol, cada objetivo cosecha
// [E4] "drift" y [E8] "stale" que son ciertos sobre el grafo y falsos sobre el código. Esa pared de
// mentiras pesimistas es la que enseña a ignorar el gate, así que acá se corta con UN error.
function reportFrameMismatch(root, choice) {
  const rel = (p) => path.relative(root, p) || '.';
  const parent = path.resolve(root, '..');
  console.error(c.red('✗ MARCO EQUIVOCADO') + ' — el grafo no indexa el árbol que los CAPA nombran: '
    + `${choice.covered} de ${choice.total} rutas declaradas existen en el mejor grafo disponible.`);
  console.error('  Con un grafo de otro árbol todo [E4] "drift" y todo [E8] "stale" sería falso, así que no se');
  console.error('  reporta deriva: lo que está desactualizado es el grafo, no los dossiers.');
  console.error('  candidatos evaluados:');
  for (const cd of choice.candidates) {
    const cobertura = cd.measurable ? `${cd.covered}/${cd.total} rutas`
      : `sin ${GRAPH_INDEX_FILENAME} hermano — no se puede medir`;
    console.error(`    · ${rel(cd.path)} → indexa ${cd.frameRoot} · ${cobertura}`);
  }
  // La causa no siempre es «el grafo está viejo»: si el grafo del config no tiene su índice hermano
  // no se lo puede pesar, y `graphify update .` sobre el árbol equivocado no arregla NADA. Decirlo
  // acá, en la Acción, y no sólo como una nota al pie en la línea del candidato.
  const delConfig = choice.candidates.find((cd) => cd.fromConfig) || choice.candidates[0];
  if (delConfig && !delConfig.measurable) {
    console.error(`\n  Ojo: a ${rel(delConfig.path)} le falta su ${GRAPH_INDEX_FILENAME} hermano, así que no se pudo pesar —`);
    console.error('  puede ser el grafo correcto y estar quedando afuera por eso. Es lo que pasa con un grafo viejo o');
    console.error(`  copiado a mano: regenerarlo en su MISMO árbol vuelve a escribir el índice al lado (${GRAPH_INDEX_FILENAME}).`);
  }
  console.error('\n  Acción: regenerá el grafo del árbol que juzgan los CAPA —');
  console.error(`    cd "${root}" && graphify update .`);
  console.error('  Si las rutas cruzan repos (ubp-app/…, ubp-protos/…), el que sirve es el de la raíz del workspace:');
  console.error(`    cd "${parent}" && graphify update .`);
  console.error(c.dim('  (no hace falta tocar capa.config.json → graph: el grafo se elige por cobertura, para que el mismo'));
  console.error(c.dim('   repo funcione clonado suelto y dentro de un workspace.)'));
}

function runDoctor({ root, config, onlyAdr }) {
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  if (!fs.existsSync(capaDir)) { console.error(c.red('✗ ') + `no existe ${capaDir}`); return void (process.exitCode = 2); }

  const allCapas = findCapas(capaDir);
  let capas = allCapas.map((d) => ({ dir: d, rel: path.relative(capaDir, d) }));
  if (onlyAdr) capas = capas.filter((x) => x.rel.toLowerCase().includes(onlyAdr.toLowerCase()));
  if (!capas.length) { console.error(c.red('✗ ') + 'no hay CAPAs para revisar (creá uno con `capa new`)'); return void (process.exitCode = 2); }

  // La cobertura se mide sobre el corpus ENTERO aunque se filtre por --adr: el marco es una propiedad
  // del grafo, no del objetivo que se esté mirando, y un subconjunto chico daría un veredicto frágil.
  const dossierRel = normalizeRouteEntry(path.relative(root, capaDir)) || 'capa';
  const choice = chooseGraph({ root, configGraph: config.graph, routeEntries: declaredRoutePaths(allCapas, root, dossierRel) });
  if (!choice.path) { console.error(c.red('✗ ') + 'falta graphify-out/graph.json — corré `graphify update .`'); return void (process.exitCode = 2); }
  if (choice.verdict === 'mismatch') { reportFrameMismatch(root, choice); return void (process.exitCode = 2); }

  const graph = loadGraph(choice.path);
  // El encabezado dice QUÉ ÁRBOL indexa el grafo y cuánto de lo que se va a juzgar cubre: sin ese par
  // de datos no hay forma de distinguir un [E4]/[E8] real de uno nacido de juzgar con el grafo ajeno.
  const cobertura = choice.measurable ? `${choice.covered}/${choice.total} rutas` : `sin ${GRAPH_INDEX_FILENAME} hermano: no medida`;
  console.log(c.dim(`grafo: ${path.relative(root, choice.path)} · ${graph.nodeCount} nodos · commit ${graph.builtAtCommit || '?'}`
    + ` · indexa ${path.basename(choice.frameRoot) || choice.frameRoot}/ · cobertura ${cobertura}`));
  if (config.graph && !choice.fromConfig) {
    const delConfig = choice.candidates.find((cd) => cd.path === path.resolve(root, config.graph));
    const cubre = delConfig && delConfig.measurable ? `cubre ${delConfig.covered}/${delConfig.total} rutas` : 'no se pudo medir';
    console.log(c.yellow('⚠ ') + `capa.config.json → graph ("${config.graph}") ${cubre}; se usa `
      + `${path.relative(root, choice.path)} (${cobertura}), que cubre más. No hace falta editar el config.`);
  }
  // El estado INTERMEDIO, dicho de una: el grafo cubre lo suficiente para no ser 'mismatch' pero deja
  // rutas afuera, y los objetivos que viven en ellas son los que cosechan hallazgos falsos. Medido en
  // cc-sucursal-bodega: con el grafo local del backend son 257 de 1645 rutas (cobertura 84,4 %, muy
  // por encima del umbral de marco). Sin esta línea, ese caso pasaba por 'ok' sin un solo aviso.
  if (choice.measurable && choice.covered < choice.total) {
    const afuera = choice.total - choice.covered;
    console.log(c.yellow('⚠ ') + `${afuera} de ${choice.total} rutas declaradas NO están en el índice de este grafo. `
      + `Los objetivos que las nombran pueden cosechar [E4]/[E6]/[E7] falsos; el doctor los marca SOSPECHOSOS `
      + `cuando la route existe en el disco fuera del marco, pero un grafo del árbol correcto es lo que los cierra.`);
  }
  // Ningún grafo MEDIBLE cubría y se cayó a uno sin índice hermano (ver chooseGraph). No es un marco
  // equivocado —no se lo pudo pesar— pero tampoco es un grafo verificado: si acá abajo aparecen [E4]
  // y [E8] en masa, la primera hipótesis es el grafo, no los dossiers.
  if (choice.bestMeasured) {
    console.log(c.yellow('⚠ ') + `ningún grafo con ${GRAPH_INDEX_FILENAME} hermano cubre las rutas declaradas `
      + `(el mejor medible, ${path.relative(root, choice.bestMeasured.path)}, cubre ${choice.bestMeasured.covered}/${choice.bestMeasured.total}). `
      + `Se usa ${path.relative(root, choice.path)}, que NO se pudo pesar: puede ser el correcto o ser de otro árbol.`);
    console.log(c.dim(`  Para salir de la duda, regenerá el grafo en el árbol que juzgan los CAPA — cd "${root}" && graphify update .`));
  }

  // Se calcula UNA vez: es una propiedad del grafo elegido, no de cada objetivo.
  const frames = graphFrameRoots(choice.path);

  let blockers = 0, warns = 0;
  const govCache = new Map(); // adrDir -> governance.json (o null)
  for (const { dir, rel } of capas.sort((a, b) => a.rel.localeCompare(b.rel))) {
    const adrKey = rel.split(path.sep)[0];
    if (!govCache.has(adrKey)) govCache.set(adrKey, loadGovernance(capaDir, dir));
    const findings = lintCapa(dir, graph, govCache.get(adrKey), root, { routeOffset: choice.offset, frameRoots: frames });
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

module.exports = { runDoctor, lintCapa, findCapas, declaredRoutePaths };
