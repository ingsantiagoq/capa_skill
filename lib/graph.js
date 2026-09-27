'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { routeIndexForms } = require('./route');

// graphify is a hard dependency: CAPA anchors every claim to a graph node so it
// cannot drift from the code, and threads a CAPA's dependencies along its route.

// Candidatos de grafo, en orden de prioridad. El tercero existe porque los CAPA de un repo que vive
// dentro de un workspace (ubp-app/…, ubp-protos/…) sólo pueden juzgarse con el grafo del workspace,
// que está un nivel arriba. En un clon suelto ese candidato no existe y no estorba.
function graphCandidatePaths(root, configGraph) {
  const candidates = [
    configGraph && path.resolve(root, configGraph),
    path.join(root, 'graphify-out', 'graph.json'),
    path.join(root, '..', 'graphify-out', 'graph.json'),
  ].filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    let key = p;
    try { key = fs.realpathSync(p); } catch { /* sin realpath vale la ruta tal cual */ }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function resolveGraphPath(root, configGraph) {
  return graphCandidatePaths(root, configGraph)[0] || null;
}

// graphify escribe, al lado del grafo, un índice `ruta → {mtime, ast_hash}` con las rutas EN EL MARCO
// del grafo. Es el dato que permite saber QUÉ ÁRBOL indexó un grafo sin abrir sus 900 MB.
const GRAPH_INDEX_FILENAME = 'manifest.json';

function graphIndexPath(graphPath) {
  return path.join(path.dirname(graphPath), GRAPH_INDEX_FILENAME);
}

/**
 * Claves del índice hermano del grafo (sus rutas indexadas), leídas por chunks: el índice del
 * workspace pesa ~75 MB y no hace falta materializar sus valores para saber qué árbol cubre.
 * En el objeto plano `{ "<ruta>": { … } }` los únicos strings a profundidad 1 son las claves.
 * Devuelve null si el grafo no tiene índice hermano (grafo viejo o armado a mano).
 */
function readGraphIndexPaths(graphPath) {
  const idxPath = graphIndexPath(graphPath);
  if (!fs.existsSync(idxPath)) return null;

  const CHUNK = 4 * 1024 * 1024;
  const OPEN_BRACE = 0x7b, CLOSE_BRACE = 0x7d, OPEN_BRACKET = 0x5b, CLOSE_BRACKET = 0x5d;
  const QUOTE = 0x22, BACKSLASH = 0x5c, COLON = 0x3a, COMMA = 0x2c;

  const fd = fs.openSync(idxPath, 'r');
  const buf = Buffer.allocUnsafe(CHUNK);
  const paths = [];
  let depth = 0, inString = false, escaped = false, afterColon = false;
  let strBytes = null;
  let bytesRead;
  try {
    while ((bytesRead = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
      for (let i = 0; i < bytesRead; i++) {
        const b = buf[i];
        if (inString) {
          if (strBytes) strBytes.push(b);
          if (escaped) { escaped = false; continue; }
          if (b === BACKSLASH) { escaped = true; continue; }
          if (b === QUOTE) {
            inString = false;
            if (strBytes) {
              // `strBytes` arranca DESPUÉS de la comilla de apertura (se crea en el `case QUOTE` de
              // afuera, que no empuja su byte) y acumula hasta la de cierre INCLUIDA: hay que soltar
              // la última. Sin esto las 14.373 claves del índice salían como `.capa/schema.sql"`, con
              // la comilla pegada — inocuo para `startsWith` de un prefijo corto, pero la clave está
              // mal y cualquier comparación por igualdad falla. `streamParseGraph` ya lo recortaba
              // (con `.slice(1, -1)`, porque allá sí se empuja la de apertura).
              paths.push(unescapeJsonString(Buffer.from(strBytes.slice(0, strBytes.length - 1)).toString('utf8')));
              strBytes = null;
            }
            afterColon = false;
          }
          continue;
        }
        switch (b) {
          case QUOTE: inString = true; if (depth === 1 && !afterColon) strBytes = []; break;
          case COLON: afterColon = true; break;
          case COMMA: afterColon = false; break;
          case OPEN_BRACE: case OPEN_BRACKET: depth++; afterColon = false; break;
          case CLOSE_BRACE: case CLOSE_BRACKET: depth--; afterColon = false; break;
          default: break;
        }
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return paths;
}

/**
 * Índice de prefijos sobre rutas: responde "¿hay alguna ruta que empiece con P?" en O(log n),
 * con la MISMA semántica de `String.startsWith` que tenía el barrido lineal. Existe porque medir
 * cobertura o casar 4142 routes contra 466k nodos con un barrido por ruta son miles de millones de
 * comparaciones por corrida.
 */
function makePrefixIndex(paths) {
  const sorted = paths.slice().sort();
  return (prefix) => {
    if (!prefix) return sorted.length > 0;
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < prefix) lo = mid + 1; else hi = mid;
    }
    return lo < sorted.length && sorted[lo].startsWith(prefix);
  };
}

/**
 * Marcos de coordenadas posibles del grafo: el directorio que lo contiene (padre de `graphify-out`),
 * leído por la ruta TAL CUAL y además por realpath.
 *
 * El orden importa y antes estaba invertido. `graphify-out` de un worktree suele ser un symlink al
 * del checkout principal (medido en el bundle cc-sucursal-bodega: los DOS candidatos son enlaces a
 * `BTW UBP/…`), y resolver el enlace mueve el marco a OTRO árbol: `path.relative` contra la raíz CAPA
 * del worktree arranca con `..` y `graphFrameOffset` devolvía null para ambos candidatos. Con el
 * offset en null, `routeCandidatesInFrame` degenera en `routeCandidates` —que adivina el prefijo por
 * el nombre de la carpeta— y todo el mecanismo de marco quedaba muerto justo donde hace falta.
 *
 * El marco correcto es el del ENLACE: un worktree que comparte el grafo comparte la forma del árbol,
 * y las rutas de sus CAPA se nombran desde SU carpeta. El realpath queda de respaldo para el caso
 * inverso (el config apunta al grafo a través de un `..` que sí es enlace).
 */
function graphFrameRoots(graphPath) {
  const link = path.dirname(path.dirname(path.resolve(graphPath)));
  const out = [link];
  try {
    const real = path.dirname(path.dirname(fs.realpathSync(graphPath)));
    if (real !== link) out.push(real);
  } catch { /* sin realpath vale la ruta tal cual */ }
  return out;
}

function graphFrameRoot(graphPath) {
  return graphFrameRoots(graphPath)[0];
}

/** Prefijo (estilo POSIX) de `abs` dentro de `frame`, o null si `abs` cae fuera. '' = es el frame. */
function relativeInside(frame, abs) {
  const rel = path.relative(frame, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Prefijo con el que las rutas de `root` aparecen DENTRO del grafo ('' si el grafo enmarca la raíz
 * CAPA misma). null = el grafo no contiene a `root`: no puede juzgar nada suyo.
 */
function graphFrameOffset(graphPath, root) {
  const abs = path.resolve(root);
  for (const frame of graphFrameRoots(graphPath)) {
    const rel = relativeInside(frame, abs);
    if (rel !== null) return rel;
  }
  let realRoot = abs;
  try { realRoot = fs.realpathSync(abs); } catch { /* idem */ }
  if (realRoot === abs) return null;
  for (const frame of graphFrameRoots(graphPath)) {
    const rel = relativeInside(frame, realRoot);
    if (rel !== null) return rel;
  }
  return null;
}

/**
 * Sonda de prefijos sobre el índice hermano de un grafo: `(prefijo) => bool`, o null si el grafo no
 * tiene índice. Memoizada por ruta+mtime+tamaño porque la misma corrida la pide una vez por candidato
 * (chooseGraph) y otra por objetivo (doctor), y el índice de la raíz pesa 75 MB — medido 2026-09-08:
 * 0,32 s de lectura + 0,01 s de ordenado por vez.
 */
const probeCache = new Map();
function graphIndexProbe(graphPath) {
  let key = graphPath;
  try {
    const st = fs.statSync(graphIndexPath(graphPath));
    key = `${graphPath}|${st.mtimeMs}|${st.size}`;
  } catch { /* sin índice: se cachea por ruta y readGraphIndexPaths devolverá null */ }
  if (!probeCache.has(key)) {
    const indexed = readGraphIndexPaths(graphPath);
    probeCache.set(key, indexed ? makePrefixIndex(indexed) : null);
  }
  return probeCache.get(key);
}

/**
 * Cobertura de marco: cuántas de las rutas que los dossiers declaran existen en el árbol del grafo.
 * `uncovered` lleva las que NO — sin ellas el aviso del encabezado sólo puede decir un número, y un
 * número no le dice a nadie qué hacer a continuación.
 */
function measureFrameCoverage(graphPath, root, routeEntries) {
  const offset = graphFrameOffset(graphPath, root);
  const hasPrefix = graphIndexProbe(graphPath);
  const base = { path: graphPath, offset, frameRoot: graphFrameRoot(graphPath), total: routeEntries.length };
  if (!hasPrefix) return { ...base, measurable: false, covered: 0, uncovered: [] };
  let covered = 0;
  const uncovered = [];
  for (const entry of routeEntries) {
    if (routeIndexForms(root, entry, offset).some(hasPrefix)) covered++;
    else uncovered.push(entry);
  }
  return { ...base, measurable: true, covered, uncovered };
}

/**
 * Por debajo de esta fracción de rutas cubiertas el grafo no está juzgando el mismo árbol que los
 * dossiers: la deriva real golpea objetivos sueltos, un marco equivocado hunde la cobertura a ~0
 * (medido: grafo del workspace 8/8 rutas del objetivo, grafo local del repo 0/8). El umbral se deja
 * bien abajo para que un backlog con muchas rutas legítimamente muertas nunca dispare la alarma.
 *
 * ⛔ Es un filtro de MARCO («¿este grafo enmarca el árbol que voy a juzgar?»), NO una nota de calidad.
 * Entre dos que lo pasan, el porcentaje no vuelve a decidir por sí solo: ver `decidirGrafo`.
 */
const FRAME_COVERAGE_MIN_RATIO = 0.1;

// ── Sello de construcción ───────────────────────────────────────────────────────────────────
/**
 * `built_at_commit`: el commit del árbol que graphify indexó, escrito DENTRO del archivo del grafo.
 *
 * ⛔ Es el único atributo de antigüedad que sirve, y hubo que aprenderlo dos veces. La versión
 * anterior de esto medía frescura por `mtime` con una justificación escrita que era FALSA —decía que
 * el archivo «no lleva sello de construcción propio (medido: su cabecera arranca directo en nodes)».
 * Se había medido la CABECERA; el sello está en la COLA. Medido 2026-09-08 sobre el grafo del backend:
 * `tail -c 400 graphify-out/graph.json` termina en
 * `"hyperedges": [], "built_at_commit": "4977a7d4c4ffbc15c5a4b0f38bb3edc5fb537675"`.
 *
 * Por qué el mtime no sirve: un `touch`, un `cp -p` mal hecho, un rsync, un restore de backup o
 * simplemente que otra sesión regenere el grafo del repo hermano lo reescriben sin que nadie decida
 * nada, y el agujero es MUDO. Medido: con `touch` sobre el grafo angosto, la semilla muerta pasaba
 * verde, 4 vivas salían fantasma y el gate publicaba el mtime falso como si fuera la fecha del
 * conocimiento. Un mtime es una AFIRMACIÓN que cualquier copia reescribe; un commit es COMPROBABLE —
 * se le pregunta a git si lo conoce, si es ancestro de HEAD y a cuántos commits está.
 *
 * Se lee de la COLA (y de la cabecera como respaldo, por si una versión de graphify lo mueve): abrir
 * 931 MB para leer 40 caracteres es justo lo que este módulo existe para no hacer.
 */
const SEAL_PROBE_BYTES = 8192;
const SEAL_RE = /"built_at_commit"\s*:\s*"([0-9a-f]{7,40})"/;

function readGraphSeal(graphPath) {
  let size;
  try { size = fs.statSync(graphPath).size; } catch { return null; }
  let fd;
  try { fd = fs.openSync(graphPath, 'r'); } catch { return null; }
  try {
    const n = Math.min(SEAL_PROBE_BYTES, size);
    const buf = Buffer.allocUnsafe(n);
    // latin1 y no utf8: el patrón es ASCII puro y así un corte a mitad de un carácter multibyte
    // (inevitable al leer una ventana arbitraria) no puede romper la decodificación.
    for (const offset of [Math.max(0, size - n), 0]) {
      fs.readSync(fd, buf, 0, n, offset);
      const m = SEAL_RE.exec(buf.toString('latin1'));
      if (m) return m[1];
      if (offset === 0) break;
    }
    return null;
  } catch { return null; }
  finally { fs.closeSync(fd); }
}

/**
 * Le pregunta a git QUÉ es ese sello. Es la mitad que vuelve verificable a la frescura:
 *   · sealState 'ok'      → el repo conoce el commit; `behind` = commits que HEAD tiene y el grafo no,
 *                           `ahead` = commits del grafo que HEAD no tiene (>0 ⇒ se construyó en otra rama).
 *   · sealState 'unknown' → hay sello pero este repo no lo conoce (grafo de OTRO repo, clon shallow).
 *   · sealState 'none'    → no hay sello.
 *
 * 'unknown' y 'none' NO son lo mismo que «viejo» ni que «fresco»: son «no se puede saber». Ver
 * `decidirGrafo` para qué se hace con eso (spoiler: no gana frescura, y tampoco se lo descalifica).
 */
const sealCache = new Map();
function verifyGraphSeal(root, seal) {
  if (!seal) return { seal: null, sealState: 'none', behind: null, ahead: null };
  const key = `${root}|${seal}`;
  if (sealCache.has(key)) return sealCache.get(key);
  let out = { seal, sealState: 'unknown', behind: null, ahead: null };
  try {
    execFileSync('git', ['-C', root, 'cat-file', '-e', `${seal}^{commit}`], { stdio: 'ignore' });
    const count = (range) => Number(execFileSync('git', ['-C', root, 'rev-list', '--count', range],
      { encoding: 'utf8' }).trim());
    out = { seal, sealState: 'ok', behind: count(`${seal}..HEAD`), ahead: count(`HEAD..${seal}`) };
  } catch { /* este repo no conoce el commit: queda 'unknown', que es la verdad */ }
  sealCache.set(key, out);
  return out;
}

// ── El criterio ─────────────────────────────────────────────────────────────────────────────
/**
 * Ventaja de cobertura que hace ganar al grafo ANCHO aunque el otro sea más fresco, como fracción de
 * la muestra. Cada punto de muestra que el grafo elegido NO cubre es un lugar donde va a inventar
 * fantasmas: sus ids ni siquiera existen en su marco. Medido 2026-09-08 sobre este workspace (muestra
 * de 1916 rutas declaradas por los CAPA + carpetas de las amarras):
 *
 *   · grafo de la RAÍZ     → 1850/1916 (96,6 %)
 *   · grafo LOCAL del repo → 1583/1916 (82,6 %)
 *   · sólo el local cubre: 0 rutas  ⇒ la raíz es SUPERCONJUNTO ESTRICTO
 *   · margen: 267 rutas = 13,9 % de la muestra (ubp-app/…, ubp-infra/…, admin-console/…)
 *
 * 5 % (96 rutas acá) deja al margen medido casi 3x por encima del umbral y, al mismo tiempo, no le
 * regala la elección a una diferencia de un puñado de rutas —ésa sí la decide la frescura—.
 */
const WIDTH_MARGIN_RATIO = 0.05;

/**
 * A partir de acá el grafo ya no puede certificar: está tan atrás de HEAD que el conocimiento MUERTO
 * le parece vivo. Medido en btw-ubp-backend el 2026-09-08:
 *
 *   · cadencia real, últimos 14 días: mediana 47 commits/día, media 58, PICO de 122 en un solo día.
 *   · el grafo local está a 411 commits de HEAD (sello 4977a7d4c, 2026-08-31).
 *   · el commit que borró `ConfiguredPayrollTimezoneResolver` (39683fb95, 2026-09-06) cae 299 commits
 *     DESPUÉS del sello: ese grafo respondía con total aplomo sobre una clase que ya no existía.
 *
 * 200 deja ~1,6x de margen sobre el peor día medido (122), así que un grafo regenerado ayer nunca lo
 * toca; y a la cadencia mediana son ~4 días, con lo que un grafo de la semana pasada sí lo toca. El
 * incidente real (hueco de 411, con la muerte adentro a los 299) queda holgadamente del lado que NO
 * certifica.
 */
const MAX_BEHIND_HEAD = 200;

const OPCIONES_GRAFO = {
  minRatio: FRAME_COVERAGE_MIN_RATIO,
  margenAnchoRatio: WIDTH_MARGIN_RATIO,
  maxBehind: MAX_BEHIND_HEAD,
};

/** Orden fijo de los avisos: la paridad entre las dos implementaciones se compara por igualdad. */
const ORDEN_AVISOS = ['grafo-mas-ancho-descartado', 'grafo-mas-fresco-descartado',
  'sello-no-verificable', 'sello-viejo'];

function esSuperconjuntoEstricto(x, y) {
  if (!Array.isArray(x.coveredKeys) || !Array.isArray(y.coveredKeys)) return false;
  if (x.covered <= y.covered) return false;
  const suyas = new Set(x.coveredKeys);
  return y.coveredKeys.every((k) => suyas.has(k));
}

/** ¿`x` es ANCHO frente a `y`? Superconjunto estricto, o `margenAnchoRatio` de la muestra por encima. */
function esMasAncho(x, y, margenAnchoRatio) {
  if (!x.measurable || !y.measurable || x.total !== y.total || x.total === 0) return null;
  if (esSuperconjuntoEstricto(x, y)) return 'superconjunto';
  if (x.covered - y.covered >= Math.ceil(x.total * margenAnchoRatio)) return 'margen-de-cobertura';
  return null;
}

/** Frescura COMPROBABLE: sólo entre dos sellos que este repo conoce. Sin sello no se gana ni se pierde. */
function esMasFresco(x, y) {
  return x.sealState === 'ok' && y.sealState === 'ok' && x.behind < y.behind;
}

/**
 * EL CRITERIO, puro y sin E/S. Está DUPLICADO —byte por byte en espíritu— en
 * `btw-ubp-backend/tools/check-capa-governance.mjs`, que no puede importar el skill porque tiene que
 * correr en un CI sin él en disco. Los fija al mismo resultado el vector compartido
 * `test/fixtures/graph-choice-vectors.json` (test: `smoke-graph-choice-parity.js`), que también fija
 * las constantes: si alguien mueve un umbral de un solo lado, el test se pone rojo.
 *
 * Entrada: candidatos EN ORDEN DE PRIORIDAD (el del `capa.config.json` primero), cada uno
 *   { id, measurable, covered, total, coveredKeys, sealState, behind, ahead }.
 *
 * Orden de las reglas, y por qué:
 *   1. FILTRO DE MARCO. Un grafo que no enmarca el árbol no compite: sus ids llevan otro marco adentro
 *      y declararía fantasma a todo lo vivo.
 *   2. EL ANCHO GANA. Superconjunto estricto (o `margenAnchoRatio` por encima) le gana a cualquier
 *      ventaja de frescura. Un grafo más nuevo que no ve `ubp-app/` no es más nuevo para `ubp-app/`:
 *      es CIEGO ahí. Una ventaja marginal de frescura no paga perder cobertura del árbol que se juzga.
 *   3. SELLO. Entre los que quedan parejos en ancho, gana el que esté a menos commits de HEAD. Sólo
 *      entre sellos verificables: sin sello no se gana frescura (no se puede demostrar) y tampoco se
 *      descalifica (no se puede demostrar lo contrario) — se compite por lo que sí se puede medir.
 *   4. COBERTURA, y 5. PRIORIDAD, como desempates.
 *
 * `motivo` refleja la última comparación ganada; con dos candidatos —el caso real— es exacto.
 */
function decidirGrafo(candidatos, opciones = OPCIONES_GRAFO) {
  const { minRatio, margenAnchoRatio, maxBehind } = opciones;
  const vacio = { elegido: null, veredicto: 'missing', motivo: 'sin-candidatos', avisos: [] };
  if (!Array.isArray(candidatos) || !candidatos.length) return vacio;

  const idx = candidatos.map((_, i) => i);
  const medibles = idx.filter((i) => candidatos[i].measurable && candidatos[i].total > 0);
  const sinIndice = idx.filter((i) => !candidatos[i].measurable);

  // Sin nadie a quien calificar (ningún índice hermano, o muestra vacía) se cae en el de mayor
  // prioridad y se dice que el marco NO se midió: «no se pudo pesar» nunca es «pesa cero».
  if (!medibles.length) {
    const elegido = sinIndice.length ? sinIndice[0] : 0;
    return { elegido, veredicto: 'unmeasured', motivo: sinIndice.length ? 'sin-indice' : 'sin-muestra',
      avisos: avisosDe(candidatos, elegido) };
  }

  const califican = medibles.filter((i) => candidatos[i].covered / candidatos[i].total >= minRatio);
  if (!califican.length) {
    if (sinIndice.length) {
      return { elegido: sinIndice[0], veredicto: 'unmeasured', motivo: 'sin-indice',
        avisos: avisosDe(candidatos, sinIndice[0]) };
    }
    // Ningún candidato enmarca. `elegido` apunta igual al mejor medible: el veredicto ya dice que no se
    // juzga, y quien reporta necesita poder nombrar contra qué se midió.
    const mejor = medibles.reduce((a, b) => (candidatos[b].covered > candidatos[a].covered ? b : a));
    return { elegido: mejor, veredicto: 'mismatch', motivo: 'ningun-marco', avisos: [] };
  }

  let elegido = califican[0];
  let motivo = 'prioridad';
  for (const rival of califican.slice(1)) {
    const b = candidatos[rival], a = candidatos[elegido];
    const anchoB = esMasAncho(b, a, margenAnchoRatio);
    if (anchoB) { elegido = rival; motivo = anchoB; continue; }
    if (esMasAncho(a, b, margenAnchoRatio)) continue;
    if (esMasFresco(b, a)) { elegido = rival; motivo = 'sello-mas-fresco'; continue; }
    if (esMasFresco(a, b)) continue;
    if (b.covered > a.covered) { elegido = rival; motivo = 'mas-cobertura'; }
  }

  const avisos = avisosDe(candidatos, elegido);
  const c = candidatos[elegido];
  // El mejor grafo disponible está demasiado atrás: el gate NO JUZGA. Certificar con él es publicar
  // como vivo un conocimiento que puede llevar días muerto (ver MAX_BEHIND_HEAD).
  if (c.sealState === 'ok' && c.behind > maxBehind) {
    return { elegido, veredicto: 'stale', motivo, avisos: ordenar([...avisos, 'sello-viejo']) };
  }
  return { elegido, veredicto: 'ok', motivo, avisos };
}

function ordenar(avisos) {
  return [...new Set(avisos)].sort((a, b) => ORDEN_AVISOS.indexOf(a) - ORDEN_AVISOS.indexOf(b));
}

/**
 * Avisos SIMÉTRICOS. La versión anterior sólo avisaba al descartar un grafo más NUEVO y se callaba al
 * elegir uno más ANGOSTO — o sea: gritaba por el eje que estaba privilegiando y enmudecía por el que
 * había demotado. Acá los dos ejes avisan igual, y encima se declara siempre cuando la antigüedad del
 * elegido no se pudo verificar.
 */
function avisosDe(candidatos, elegido) {
  const c = candidatos[elegido];
  const avisos = [];
  if (c.sealState !== 'ok') avisos.push('sello-no-verificable');
  candidatos.forEach((r, i) => {
    if (i === elegido) return;
    if (r.sealState === 'ok' && c.sealState === 'ok' && r.behind < c.behind) avisos.push('grafo-mas-fresco-descartado');
    if (r.measurable && c.measurable && r.covered > c.covered) avisos.push('grafo-mas-ancho-descartado');
  });
  return ordenar(avisos);
}

/** Las muestras que un candidato SÍ cubre = las declaradas menos las que `measureFrameCoverage` dejó afuera. */
function coveredKeysOf(routeEntries, uncovered) {
  const fuera = new Set(uncovered || []);
  return routeEntries.filter((r) => !fuera.has(r));
}

/**
 * Elige el grafo que comparte marco con lo que se va a juzgar, en vez del primero que exista en disco,
 * y entre los que enmarcan aplica `decidirGrafo` (ancho > sello > cobertura > prioridad). Es lo que
 * hace que el mismo repo funcione clonado suelto (grafo local) y dentro de un workspace (grafo de la
 * raíz) sin que nadie edite `capa.config.json`.
 * verdict: 'ok' | 'stale' (el elegido está demasiado atrás de HEAD) | 'mismatch' (ningún candidato
 * enmarca) | 'unmeasured' (no hay rutas o no hay índice) | 'missing'.
 */
function chooseGraph({ root, configGraph, routeEntries = [] }) {
  const paths = graphCandidatePaths(root, configGraph);
  if (!paths.length) return { path: null, candidates: [], verdict: 'missing', motivo: 'sin-candidatos', avisos: [] };

  const configPath = configGraph ? path.resolve(root, configGraph) : null;
  // `fromConfig` se estampa en CADA candidato, no sólo en el elegido: quien reporta un marco
  // equivocado necesita poder señalar al del config aunque no haya ganado.
  const candidates = paths.map((p) => ({
    ...measureFrameCoverage(p, root, routeEntries),
    ...verifyGraphSeal(root, readGraphSeal(p)),
    fromConfig: p === configPath,
  }));

  const fallo = decidirGrafo(candidates.map((cd) => ({
    id: path.relative(root, cd.path) || cd.path,
    measurable: cd.measurable,
    covered: cd.covered,
    total: cd.total,
    coveredKeys: cd.measurable ? coveredKeysOf(routeEntries, cd.uncovered) : null,
    sealState: cd.sealState,
    behind: cd.behind,
    ahead: cd.ahead,
  })), OPCIONES_GRAFO);

  const base = { candidates, verdict: fallo.veredicto, motivo: fallo.motivo, avisos: fallo.avisos };
  if (fallo.elegido === null) return { path: null, ...base };

  const cd = candidates[fallo.elegido];
  // Se cayó en un candidato SIN índice hermano teniendo alguno medible: `bestMeasured` lleva lo que sí
  // se pudo pesar, para que quien reporte pueda decir por qué. (Un grafo bueno en el config al que le
  // falta el `manifest.json` hermano conviviendo con un `../graphify-out` ajeno que sí lo tiene.)
  const extra = {};
  if (fallo.veredicto === 'unmeasured' && !cd.measurable) {
    const medibles = candidates.filter((x) => x.measurable && x.total > 0);
    if (medibles.length) extra.bestMeasured = medibles.reduce((a, b) => (b.covered > a.covered ? b : a));
  }
  return { ...cd, ...base, ...extra };
}

/**
 * El grafo del `capa.config.json` NO fue el elegido: quien corre el comando tiene que enterarse, o
 * queda leyendo un veredicto emitido contra un grafo que él no pidió.
 *
 * Vive acá, y no en doctor.js, porque `capa thread` elige el grafo con el MISMO `chooseGraph` y hasta
 * ahora no decía nada: sólo emitía el aviso de `bestMeasured` (lib/thread.js), así que quien hila sin
 * correr el doctor nunca se enteraba de que su config había sido ignorado.
 *
 * Devuelve el texto del aviso, o null si no hay nada que avisar.
 */
function avisoConfigIgnorado(root, configGraph, choice) {
  if (!configGraph || !choice || !choice.path || choice.fromConfig) return null;
  const rel = (p) => path.relative(root, p) || '.';
  const delConfig = (choice.candidates || []).find((cd) => cd.path === path.resolve(root, configGraph));
  let cubre;
  if (!delConfig) cubre = 'no existe en el disco';
  else if (delConfig.measurable) cubre = `cubre ${delConfig.covered}/${delConfig.total} rutas`;
  else cubre = `no se pudo medir (sin ${GRAPH_INDEX_FILENAME} hermano)`;
  const usado = choice.measurable ? `${choice.covered}/${choice.total} rutas` : 'no medible';
  // Por qué ganó el otro. El caso más común no es «le ganó» sino «el del config ni siquiera enmarca
  // este árbol»: quedó afuera por el filtro de marco antes de competir, y decirlo así es lo que evita
  // que alguien salga a editar el config buscando un empate que nunca hubo.
  const noEnmarca = delConfig && delConfig.measurable && delConfig.total > 0
    && delConfig.covered / delConfig.total < FRAME_COVERAGE_MIN_RATIO;
  const porque = noEnmarca ? ', que sí enmarca este árbol'
    : ({ superconjunto: ', que cubre un superconjunto estricto', 'margen-de-cobertura': ', que cubre bastante más',
      'sello-mas-fresco': ', con el sello más cerca de HEAD', 'mas-cobertura': ', que cubre más' }[choice.motivo] || '');
  return `capa.config.json → graph ("${configGraph}") ${cubre}; se usa ${rel(choice.path)} (${usado})${porque}. `
    + 'No hace falta editar el config: el grafo se elige por MARCO y, entre los que enmarcan, por ANCHO '
    + 'de cobertura y después por SELLO de construcción (built_at_commit) — nunca por mtime.';
}

/**
 * Frescura del grafo MULTI-REPO (el de la raíz del workspace), medida AL CONSULTAR.
 *
 * El de la raíz no es un repo git, así que no lleva `built_at_commit` y `verifyGraphSeal` lo deja en
 * 'none'. Lo que sí trae es `BUILD-STAMP.json` (qué sha de cada repo indexó) y, desde INFRA R96
 * (2026-09-27), `graphify-freshness.sh` al lado: el MISMO medidor que imprime `graphify query`, así
 * los dos encabezados no pueden decir cosas distintas. Medido ese día: el sello escrito al armar
 * decía «VEREDICTO FRESH» con el grafo 32/32/4 commits detrás de develop.
 *
 * Devuelve { estado: 'fresh'|'atrasado'|'no-verificable', lineas: [...] } o null si no hay medidor.
 */
const frescuraCache = new Map();
function frescuraMultiRepo(graphPath) {
  if (!graphPath) return null;
  const dir = path.dirname(graphPath);
  const medidor = path.join(dir, 'graphify-freshness.sh');
  if (!fs.existsSync(medidor) || !fs.existsSync(path.join(dir, 'BUILD-STAMP.json'))) return null;
  if (frescuraCache.has(dir)) return frescuraCache.get(dir);
  const r = spawnSync('bash', [medidor, dir], { encoding: 'utf8', timeout: 20000 });
  const lineas = String(r.stdout || '').split('\n').filter((l) => l.trim());
  const estado = { 0: 'fresh', 3: 'atrasado' }[r.status] || 'no-verificable';
  const out = { estado, lineas: lineas.length ? lineas : ['VEREDICTO NO VERIFICABLE — el medidor no respondió'] };
  frescuraCache.set(dir, out);
  return out;
}

/** Cómo se lee un sello en una línea de encabezado. Nunca miente: si no se pudo verificar, lo dice. */
function describirSello(cd) {
  if (!cd) return 'sin sello';
  if (cd.sealState === 'none') {
    const f = frescuraMultiRepo(cd.path);
    if (f) return f.lineas[0];
  }
  if (cd.sealState === 'ok') {
    const rama = cd.ahead > 0 ? `, ${cd.ahead} de otra rama` : '';
    return `sello ${String(cd.seal).slice(0, 9)} · ${cd.behind} commit(s) detrás de HEAD${rama}`;
  }
  if (cd.sealState === 'unknown') return `sello ${String(cd.seal).slice(0, 9)} · este repo NO conoce ese commit`;
  return 'SIN sello de construcción · antigüedad NO verificable';
}

/**
 * Los avisos del encabezado, en texto. Se arman acá y no en doctor.js porque `capa thread` elige el
 * grafo con el MISMO `chooseGraph` y tiene que decir exactamente lo mismo.
 */
function textosDeAvisos(root, choice) {
  if (!choice || !choice.avisos || !choice.avisos.length) return [];
  const rel = (p) => path.relative(root, p) || '.';
  const otros = (choice.candidates || []).filter((cd) => cd.path !== choice.path);
  const out = [];
  for (const code of choice.avisos) {
    if (code === 'grafo-mas-ancho-descartado') {
      const anchos = otros.filter((cd) => cd.measurable && choice.measurable && cd.covered > choice.covered);
      out.push(`SE ELIGIÓ UN GRAFO MÁS ANGOSTO: ${anchos.map((cd) => `${rel(cd.path)} (${cd.covered}/${cd.total})`).join(', ')} `
        + `cubre más que ${rel(choice.path)} (${choice.covered}/${choice.total}). En lo que el elegido no enmarca, `
        + 'sus ids ni siquiera existen: ahí todo [E4]/fantasma es falso.');
    } else if (code === 'grafo-mas-fresco-descartado') {
      const frescos = otros.filter((cd) => cd.sealState === 'ok' && choice.sealState === 'ok' && cd.behind < choice.behind);
      out.push(`SE DESCARTÓ UN GRAFO MÁS FRESCO: ${frescos.map((cd) => `${rel(cd.path)} (${describirSello(cd)})`).join(', ')} `
        + `está más cerca de HEAD que ${rel(choice.path)} (${describirSello(choice)}). Cuanto más atrás quede el que `
        + 'juzga, más conocimiento MUERTO pasa por vivo.');
    } else if (code === 'sello-no-verificable') {
      // El de la raíz SÍ se puede verificar si trae su medidor: FRESH no avisa; ATRASADO avisa con
      // los números y el comando. Una alarma que suena siempre no la escucha nadie.
      const f = choice.sealState === 'none' ? frescuraMultiRepo(choice.path) : null;
      if (f && f.estado === 'fresh') continue;
      if (f) { out.push(`${rel(choice.path)}: ${f.lineas.join(' ')}`); continue; }
      out.push(`${rel(choice.path)} ${describirSello(choice)}. No se puede probar que esté al día NI que esté viejo; `
        + 'graphify sólo sella un árbol que sea un repo git (el de la raíz del workspace no lo es). '
        + 'Regeneralo antes de creerle a un verde que dependa de él.');
    } else if (code === 'sello-viejo') {
      out.push(`${rel(choice.path)} está ${choice.behind} commit(s) detrás de HEAD, por encima de los `
        + `${MAX_BEHIND_HEAD} que se toleran: NO se juzga con él. Regeneralo — graphify update .`);
    }
  }
  return out;
}

/**
 * V8 no puede materializar un string de más de ~512 MB (0x1fffffe8 chars). Por encima de eso
 * `fs.readFileSync(p, 'utf8')` tira ERR_STRING_TOO_LONG ANTES de parsear nada, y `JSON.parse` tampoco
 * sirve porque también coacciona el Buffer a string. Un grafo de workspace grande cruza ese techo y
 * deja a CAPA sin `thread` ni `doctor` — o sea sin gate — para TODOS los objetivos a la vez.
 *
 * El umbral se elige por debajo del techo duro porque lo que cuenta son CARACTERES, no bytes: un
 * archivo de 500 MB con acentos supera 512 M chars sólo al decodificar. 400 MB deja margen sano.
 */
const FAST_PATH_MAX_BYTES = 400 * 1024 * 1024;

/**
 * Lector por chunks para grafos que no entran en un string. Recorre los BYTES y extrae uno por uno los
 * elementos de `nodes` y `links` (objetos chicos que sí se parsean sueltos), sin materializar el archivo
 * entero en memoria como texto.
 *
 * Seguro sobre UTF-8: los bytes estructurales que mira ({ } [ ] " \ : ,) son todos ASCII, y en UTF-8
 * ningún byte de continuación cae en el rango ASCII. Por eso escanear a nivel byte no puede confundir un
 * carácter multibyte con una llave, y cortar un chunk en medio de un carácter es inocuo: los bytes del
 * elemento se acumulan y recién se decodifican al cerrarlo.
 */
function streamParseGraph(graphPath) {
  const CHUNK = 16 * 1024 * 1024;
  const fd = fs.openSync(graphPath, 'r');
  const buf = Buffer.allocUnsafe(CHUNK);

  const result = { nodes: [], links: [], built_at_commit: null };

  // Pila de contenedores. Para objetos guardamos la clave que se está poblando.
  const stack = [];
  let inString = false;
  let escaped = false;
  let strBytes = null;      // bytes del string en curso (sólo se acumulan si puede ser clave o valor útil)
  let afterColon = false;   // true = lo próximo es un valor, no una clave

  // Recolección de un elemento de array objetivo.
  let target = null;        // 'nodes' | 'links'
  let elemDepth = 0;        // profundidad relativa dentro del elemento en curso
  let elemBytes = null;

  const OPEN_BRACE = 0x7b, CLOSE_BRACE = 0x7d, OPEN_BRACKET = 0x5b, CLOSE_BRACKET = 0x5d;
  const QUOTE = 0x22, BACKSLASH = 0x5c, COLON = 0x3a, COMMA = 0x2c;

  /** ¿La pila dice que estamos DENTRO del array `nodes`/`links`? Devuelve cuál, o null. */
  const currentTarget = () => {
    const top = stack[stack.length - 1];
    if (!top || top.kind !== 'arr') return null;
    const key = top.key;
    if (key !== 'nodes' && key !== 'links') return null;
    // Acepta la forma plana {nodes:[...]} y la anidada {graph:{nodes:[...]}}, nada más hondo:
    // un "nodes" dentro de un nodo no debe capturarse.
    const owners = stack.filter((s) => s.kind === 'obj');
    if (owners.length > 2) return null;
    return key;
  };

  let bytesRead;
  let leftover = null; // string a medio cerrar entre chunks: se acumula en strBytes, no acá
  try {
    while ((bytesRead = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
      for (let i = 0; i < bytesRead; i++) {
        const b = buf[i];

        if (elemBytes) elemBytes.push(b);

        if (inString) {
          if (strBytes) strBytes.push(b);
          if (escaped) { escaped = false; continue; }
          if (b === BACKSLASH) { escaped = true; continue; }
          if (b === QUOTE) {
            inString = false;
            if (strBytes) {
              // Quitar las comillas de apertura/cierre y decodificar.
              const raw = Buffer.from(strBytes.slice(1, strBytes.length - 1)).toString('utf8');
              strBytes = null;
              const top = stack[stack.length - 1];
              if (top && top.kind === 'obj' && !afterColon) top.key = unescapeJsonString(raw);
              else if (top && top.kind === 'obj' && afterColon && top.key === 'built_at_commit'
                       && stack.filter((s) => s.kind === 'obj').length === 1) {
                result.built_at_commit = unescapeJsonString(raw);
              }
            }
            afterColon = false;
          }
          continue;
        }

        switch (b) {
          case QUOTE:
            inString = true;
            // Sólo vale la pena acumular strings que pueden ser clave o el commit del grafo.
            if (!elemBytes) strBytes = [b];
            break;
          case COLON:
            if (!elemBytes) afterColon = true;
            break;
          // Un valor ESCALAR (número, true/false/null) no deja rastro estructural: sin esto, después de
          // `"input_tokens": 0,` la bandera seguía en "esperando valor" y el siguiente string —que SÍ es
          // clave— no se registraba. Consecuencia real: `nodes` quedaba sin reconocer y el grafo salía
          // con 0 nodos y todos los links, que es exactamente el síntoma que trajo acá.
          case COMMA:
            if (!elemBytes) afterColon = false;
            break;
          case OPEN_BRACE:
            if (elemBytes) { elemDepth++; break; }
            if (target) { elemBytes = [b]; elemDepth = 1; break; }
            stack.push({ kind: 'obj', key: null });
            afterColon = false;
            break;
          case CLOSE_BRACE:
            if (elemBytes) {
              elemDepth--;
              if (elemDepth === 0) {
                const text = Buffer.from(elemBytes).toString('utf8');
                elemBytes = null;
                try { result[target].push(JSON.parse(text)); }
                catch { /* elemento ilegible: se omite en vez de tumbar el gate entero */ }
              }
              break;
            }
            stack.pop();
            afterColon = false;
            break;
          case OPEN_BRACKET:
            if (elemBytes) { break; }
            {
              const owner = stack[stack.length - 1];
              const key = owner && owner.kind === 'obj' ? owner.key : null;
              stack.push({ kind: 'arr', key });
              target = currentTarget();
            }
            afterColon = false;
            break;
          case CLOSE_BRACKET:
            if (elemBytes) { break; }
            stack.pop();
            target = currentTarget();
            afterColon = false;
            break;
          default:
            break;
        }
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  void leftover;
  return result;
}

/** JSON.parse de un string suelto para resolver escapes (\n, é, …) sin reimplementarlos. */
function unescapeJsonString(raw) {
  if (raw.indexOf('\\') === -1) return raw;
  try { return JSON.parse(`"${raw}"`); } catch { return raw; }
}

function readGraphFile(graphPath) {
  const size = fs.statSync(graphPath).size;
  if (size <= FAST_PATH_MAX_BYTES) return JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  return streamParseGraph(graphPath);
}

/**
 * Normalización de id de graphify (`graphify/ids.py:33-40`): NFKC, runs de no-palabra a un guion
 * bajo, colapsar repetidos, recortar bordes y minúsculas. Se replica acá —en vez de aproximarla—
 * porque cualquier desvío hace que el índice corto mida otra cosa que el grafo.
 */
function normalizeGraphId(s) {
  return String(s).normalize('NFKC')
    .replace(/[^\p{L}\p{N}_]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/**
 * Id CORTO de un nodo de archivo tal como lo arma graphify >= 0.8.44: `{directorio_padre}_{stem}`,
 * un solo nivel de padre y sin extensión (`graphify/extract.py:79-95`, issues #550 y #1033).
 * Los dossiers viejos anclan con el esquema derivado de la RUTA COMPLETA; por eso hace falta poder
 * ir de una ruta al id corto para reconciliarlos.
 */
function anchorShortId(sourceFile) {
  const segs = String(sourceFile || '').split('/').filter(Boolean);
  if (!segs.length) return '';
  const file = segs[segs.length - 1].replace(/\.[^.]+$/, '');
  const parent = segs.length > 1 ? segs[segs.length - 2] : '';
  return normalizeGraphId(parent ? `${parent}_${file}` : file);
}

function loadGraph(graphPath) {
  const raw = readGraphFile(graphPath);
  const nodes = raw.nodes || (raw.graph && raw.graph.nodes) || [];
  const links = raw.links || (raw.graph && raw.graph.links) || [];
  const byId = new Map();
  for (const n of nodes) byId.set(n.id, n);
  // Índice secundario por id CORTO. No reemplaza a `byId`: lo acompaña, y sólo se consulta cuando
  // el id exacto no está. Es una LISTA por clave a propósito — el id corto es ambiguo (medido en
  // UBP: `endpoints_v1tenantendpoints` nombra a dos archivos de servicios distintos), así que
  // quien resuelva tiene que desempatar con la ruta, no quedarse con el primero.
  // ⚠ `byId` se queda con el ÚLTIMO nodo de cada id, y un grafo puede traer el mismo id dos veces
  // (justamente por la ambigüedad del esquema corto). Para resolver anclas hace falta la lista
  // completa, o el desempate por ruta elegiría al azar.
  let byShort = null; // se arma al primer uso: sólo `doctor` lo necesita
  let byIdAll = null;
  const shortIndex = () => {
    if (byShort) return byShort;
    byShort = new Map();
    byIdAll = new Map();
    for (const n of nodes) {
      if (!n) continue;
      if (n.id) {
        if (!byIdAll.has(n.id)) byIdAll.set(n.id, []);
        byIdAll.get(n.id).push(n);
      }
      if (!n.source_file) continue;
      const k = anchorShortId(n.source_file);
      if (!k) continue;
      if (!byShort.has(k)) byShort.set(k, []);
      byShort.get(k).push(n);
    }
    return byShort;
  };
  let filePrefix = null; // se arma al primer uso: sólo `doctor` lo necesita
  return {
    path: graphPath,
    builtAtCommit: raw.built_at_commit || null,
    nodeCount: nodes.length,
    linkCount: links.length,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    /**
     * Resuelve un ancla contra el grafo tolerando el cambio de esquema de id de graphify, SIN
     * ablandar el gate:
     *   1. id exacto → ese nodo (el esquema con el que se escribió el ancla no importa);
     *   2. si no está, se busca por id corto **y** se exige que el `source_file` de un ÚNICO
     *      candidato termine en la ruta declarada por el ancla (`src`).
     * Sin ruta declarada, o con más de un candidato, devuelve `null` y el ancla sigue bloqueando:
     * un match por nombre a secas daría por buena un ancla que apunta a otro archivo homónimo, que
     * es exactamente el verde que no mide nada que el gate existe para evitar.
     */
    resolveAnchor: (id, rutaDeclarada) => {
      const ruta = String(rutaDeclarada || '').replace(/^\.\//, '').replace(/^\/+/, '');
      if (!ruta) return byId.has(id) ? byId.get(id) : null;
      // Con ruta declarada, un id exacto sólo vale si NO contradice esa ruta: un nodo sin
      // `source_file` (los sintéticos) pasa, y uno cuyo `source_file` apunta a otro archivo cae al
      // desempate de abajo en vez de devolver el homónimo equivocado.
      shortIndex();
      const exactos = (byIdAll.get(id) || [])
        .filter((n) => !n.source_file || String(n.source_file).endsWith(ruta));
      if (exactos.length === 1) return exactos[0];
      // El id del ancla tiene que seguir describiendo a ESA ruta, en uno de los dos esquemas: el
      // corto de hoy (`{padre}_{stem}`) o el largo con el que se escribió el dossier (ruta
      // completa). Si no coincide con ninguno, el ancla apunta a otra cosa y se deja bloquear:
      // resolver sólo por `src` volvería decorativo al id.
      const corto = anchorShortId(ruta);
      const largo = normalizeGraphId(ruta.replace(/\.[^./]+$/, ''));
      if (id !== corto && !largo.endsWith(id) && id !== largo) return null;
      // ⚠ El índice corto agrupa por `source_file`, así que un archivo aporta TODOS sus símbolos a
      // la misma clave (medido: 65 nodos para `Ubp.Parties.Domain/Party.cs`). El ancla apunta al
      // nodo DE ARCHIVO, que es el único cuyo id es exactamente el id corto — los símbolos llevan
      // el nombre del símbolo pegado. Sin este filtro nunca habría candidato único.
      const cands = (shortIndex().get(corto) || [])
        .filter((n) => n.id === corto && String(n.source_file || '').endsWith(ruta));
      return cands.length === 1 ? cands[0] : null;
    },
    nodes: () => nodes,
    links: () => links,
    hasFilePrefix: (prefix) => {
      if (!filePrefix) filePrefix = makePrefixIndex(nodes.map((n) => n.source_file || '').filter(Boolean));
      return filePrefix(prefix);
    },
  };
}

module.exports = {
  resolveGraphPath, loadGraph, streamParseGraph, FAST_PATH_MAX_BYTES,
  chooseGraph, graphCandidatePaths, measureFrameCoverage, graphFrameRoot, graphFrameRoots, graphFrameOffset,
  relativeInside, avisoConfigIgnorado, describirSello, textosDeAvisos, frescuraMultiRepo,
  readGraphSeal, verifyGraphSeal, decidirGrafo, OPCIONES_GRAFO, WIDTH_MARGIN_RATIO, MAX_BEHIND_HEAD,
  readGraphIndexPaths, graphIndexProbe, makePrefixIndex, FRAME_COVERAGE_MIN_RATIO, GRAPH_INDEX_FILENAME,
  anchorShortId, normalizeGraphId,
};
