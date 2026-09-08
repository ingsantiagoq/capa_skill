'use strict';
// PARIDAD DEL CRITERIO DE ELECCIÓN DE GRAFO.
//
// El criterio vive DUPLICADO en dos lugares que no se pueden importar entre sí:
//   · capa_skill/lib/graph.js            → lo usan `capa doctor` y `capa thread`
//   · btw-ubp-backend/tools/check-capa-governance.mjs → el gate [G4], que tiene que correr en un CI
//     sin el skill en disco
//
// Ya divergieron una vez EN SILENCIO —graph.js elegía por cobertura mientras el gate elegía por
// frescura— y el síntoma fue el peor posible: bajo la misma perturbación, `capa doctor` llamaba viva
// a la semilla que el gate llamaba fantasma. Este test los fija al MISMO resultado sobre los MISMOS
// candidatos, y además fija los umbrales: mover uno de un solo lado se pone rojo acá.
//
// Qué comprueba:
//   1. lib/graph.js reproduce exactamente el vector compartido (test/fixtures/graph-choice-vectors.json).
//   2. Si el .mjs del backend está en disco, reproduce exactamente lo mismo.
//   3. Los dos archivos de vector son byte a byte idénticos.
//   4. Las constantes (minRatio · margenAnchoRatio · maxBehind) coinciden entre las dos implementaciones
//      y con las del vector.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const os = require('os');
const { decidirGrafo, OPCIONES_GRAFO, readGraphSeal } = require('../lib/graph');

// ── 0 · el sello se lee de la COLA ──────────────────────────────────────────────────────────
// Es el hecho que se midió mal y costó una ronda entera: se miró la CABECERA del grafo, se concluyó
// que «no lleva sello de construcción propio» y se pasó a medir frescura por mtime — el único atributo
// que cualquier `touch`/`cp`/rsync reescribe. El sello está al final del archivo, después de `links` y
// `hyperedges`. Medido sobre el grafo real del backend: `tail -c 400` termina en
// `"hyperedges": [], "built_at_commit": "4977a7d4c4ffbc15c5a4b0f38bb3edc5fb537675"`.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-sello-'));
  const relleno = JSON.stringify(Array.from({ length: 5000 }, (_, i) => ({ id: `n${i}`, source_file: `s/${i}.cs` })));
  const conSello = path.join(dir, 'con-sello.json');
  fs.writeFileSync(conSello, `{"nodes": ${relleno}, "links": [], "hyperedges": [], `
    + '"built_at_commit": "4977a7d4c4ffbc15c5a4b0f38bb3edc5fb537675"}\n');
  assert.strictEqual(readGraphSeal(conSello), '4977a7d4c4ffbc15c5a4b0f38bb3edc5fb537675',
    'el sello está en la COLA del archivo y hay que leerlo de ahí, no de la cabecera');

  const sinSello = path.join(dir, 'sin-sello.json');
  fs.writeFileSync(sinSello, `{"nodes": ${relleno}, "links": [], "hyperedges": []}\n`);
  assert.strictEqual(readGraphSeal(sinSello), null,
    'un grafo sin sello devuelve null — es «no se sabe», no un sello inventado');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('✓ el sello (built_at_commit) se lee de la cola del grafo, sin cargarlo entero');
}

const VECTOR_SKILL = path.join(__dirname, 'fixtures', 'graph-choice-vectors.json');
const vector = JSON.parse(fs.readFileSync(VECTOR_SKILL, 'utf8'));

const fallo = (r) => ({ elegido: r.elegido, veredicto: r.veredicto, motivo: r.motivo, avisos: r.avisos });

function correr(nombreImpl, decidir) {
  for (const caso of vector.casos) {
    const real = fallo(decidir(caso.candidatos));
    assert.deepStrictEqual(real, caso.esperado,
      `${nombreImpl} — «${caso.nombre}»\n  esperado: ${JSON.stringify(caso.esperado)}\n  real:     ${JSON.stringify(real)}`);
  }
}

// ── 1 · lib/graph.js contra el vector ──────────────────────────────────────────────────────
correr('lib/graph.js', (candidatos) => decidirGrafo(candidatos, OPCIONES_GRAFO));
assert.deepStrictEqual({ ...OPCIONES_GRAFO }, vector.opciones,
  'lib/graph.js: OPCIONES_GRAFO no coincide con las del vector compartido');
console.log(`✓ lib/graph.js reproduce los ${vector.casos.length} casos del vector`);

// ── 2/3/4 · el gate .mjs del backend, si está en disco ─────────────────────────────────────
/**
 * Dónde buscar el .mjs. No se puede depender de una ruta fija: el repo se clona en cualquier lado y
 * además vive en worktrees (el bundle multi-sesión tiene una copia por worktree). Se buscan TODAS las
 * copias, no la primera: si conviven dos y una quedó atrás, eso es exactamente la divergencia que este
 * test existe para cazar. `CAPA_GOVERNANCE_MJS` fija una a mano y saltea la búsqueda.
 */
const REL_GATE = path.join('btw-ubp-backend', 'tools', 'check-capa-governance.mjs');
const WORKSPACE = path.resolve(__dirname, '..', '..');

function ubicarGates() {
  const explicito = process.env.CAPA_GOVERNANCE_MJS;
  if (explicito) return fs.existsSync(explicito) ? [explicito] : [];
  const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return []; } };
  const out = [];
  for (const h of dirs(WORKSPACE)) {
    const directo = path.join(WORKSPACE, h.name, REL_GATE);
    if (fs.existsSync(directo)) out.push(directo);
    // …/_worktrees/<bundle>/btw-ubp-backend/tools/…
    for (const n of dirs(path.join(WORKSPACE, h.name))) {
      const anidado = path.join(WORKSPACE, h.name, n.name, REL_GATE);
      if (fs.existsSync(anidado)) out.push(anidado);
    }
  }
  return out;
}

/**
 * Sólo se importa una copia que EXPORTE el criterio. Una que no lo exporta es anterior al contrato: no
 * hay nada que comparar, y además importarla ejecutaría el gate entero —incluido su `process.exit(1)`,
 * que mataría este test—. Se nombra en la salida para que la copia vieja no pase inadvertida.
 */
const EXPORTA_CRITERIO = /export\s+function\s+decidirGrafo\b/;

(async () => {
  const gates = ubicarGates();
  const conContrato = gates.filter((g) => EXPORTA_CRITERIO.test(fs.readFileSync(g, 'utf8')));
  for (const viejo of gates.filter((g) => !conContrato.includes(g))) {
    console.log(`○ ${path.relative(WORKSPACE, viejo)} no expone el criterio (copia anterior al contrato): `
      + 'no se compara. Cuando esa rama integre el cambio, entra sola.');
  }
  if (!conContrato.length) {
    // No se falla: capa_skill tiene que poder testearse solo, sin el repo de UBP al lado. El gate del
    // backend corre esta MISMA verificación contra su propia copia del vector en CADA corrida, así que
    // el lado que falta acá está cubierto allá.
    console.log('○ paridad con el gate del backend: ninguna copia con el contrato en disco '
      + '(fijala con CAPA_GOVERNANCE_MJS=<ruta> si querés comprobarla acá).');
    return;
  }

  for (const gate of conContrato) {
    const vectorGate = path.join(path.dirname(gate), 'graph-choice-vectors.json');
    assert.ok(fs.existsSync(vectorGate), `el gate no trae su copia del vector: falta ${vectorGate}`);
    assert.strictEqual(fs.readFileSync(vectorGate, 'utf8'), fs.readFileSync(VECTOR_SKILL, 'utf8'),
      `las dos copias del vector difieren (${vectorGate}): se editó una sola. Copiá la buena sobre la otra.`);

    const mod = await import(require('url').pathToFileURL(gate).href);
    assert.strictEqual(typeof mod.decidirGrafo, 'function', `${gate}: no exporta decidirGrafo`);
    correr(path.relative(WORKSPACE, gate), (candidatos) => mod.decidirGrafo(candidatos, mod.OPCIONES_GRAFO));
    assert.deepStrictEqual({ ...mod.OPCIONES_GRAFO }, { ...OPCIONES_GRAFO },
      `${gate}: los umbrales del gate y los del skill difieren — alguien movió uno de un solo lado`);
    console.log(`✓ ${path.relative(WORKSPACE, gate)} da EXACTAMENTE lo mismo en los `
      + `${vector.casos.length} casos, con los mismos umbrales`);
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
