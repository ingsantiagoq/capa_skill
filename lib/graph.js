'use strict';
const fs = require('fs');
const path = require('path');
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
 */
const FRAME_COVERAGE_MIN_RATIO = 0.1;

/**
 * Elige el grafo que comparte marco con lo que se va a juzgar, en vez del primero que exista en disco.
 * Es lo que hace que el mismo repo funcione clonado suelto (grafo local) y dentro de un workspace
 * (grafo de la raíz) sin que nadie edite `capa.config.json`.
 * verdict: 'ok' | 'mismatch' (ningún candidato cubre) | 'unmeasured' (no hay rutas o no hay índice).
 */
function chooseGraph({ root, configGraph, routeEntries = [] }) {
  const paths = graphCandidatePaths(root, configGraph);
  if (!paths.length) return { path: null, candidates: [], verdict: 'missing' };

  const configPath = configGraph ? path.resolve(root, configGraph) : null;
  // `fromConfig` se estampa en CADA candidato, no sólo en el elegido: quien reporta un marco
  // equivocado necesita poder señalar al del config aunque no haya ganado.
  const candidates = paths.map((p) => ({ ...measureFrameCoverage(p, root, routeEntries), fromConfig: p === configPath }));
  const measurable = candidates.filter((cd) => cd.measurable);
  const sinIndice = candidates.filter((cd) => !cd.measurable);
  const elegir = (cd, verdict, extra) => ({ ...cd, candidates, verdict, fromConfig: cd.path === configPath, ...extra });

  if (!routeEntries.length || !measurable.length) return elegir(candidates[0], 'unmeasured');

  // Empate ⇒ gana el de mayor prioridad (el del config): la cobertura desempata, no reordena.
  const best = measurable.reduce((a, b) => (b.covered > a.covered ? b : a));
  if (best.covered / best.total >= FRAME_COVERAGE_MIN_RATIO) return elegir(best, 'ok');

  // Ningún grafo MEDIBLE cubre. Antes se declaraba MARCO EQUIVOCADO acá mismo, y eso trataba a un
  // candidato SIN `manifest.json` hermano como peor que uno medible con cobertura CERO. No lo es:
  // «no se pudo pesar» no es «pesa cero». El caso concreto que rompía —y que andaba antes de que el
  // grafo se eligiera por cobertura— es un grafo bueno en el config al que le falta el índice hermano
  // (grafo viejo, o copiado a mano) conviviendo con un `../graphify-out` ajeno que sí lo tiene: el
  // ajeno ganaba la medición con 0, y el doctor salía 2 sin emitir un solo hallazgo.
  //
  // Se cae al no medible de mayor prioridad (el del config primero) y se avisa, en vez de abortar:
  // `bestMeasured` lleva lo que sí se pudo pesar para que quien reporte pueda decir por qué.
  if (sinIndice.length) return elegir(sinIndice[0], 'unmeasured', { bestMeasured: best });
  return elegir(best, 'mismatch');
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

function loadGraph(graphPath) {
  const raw = readGraphFile(graphPath);
  const nodes = raw.nodes || (raw.graph && raw.graph.nodes) || [];
  const links = raw.links || (raw.graph && raw.graph.links) || [];
  const byId = new Map();
  for (const n of nodes) byId.set(n.id, n);
  let filePrefix = null; // se arma al primer uso: sólo `doctor` lo necesita
  return {
    path: graphPath,
    builtAtCommit: raw.built_at_commit || null,
    nodeCount: nodes.length,
    linkCount: links.length,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
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
  relativeInside,
  readGraphIndexPaths, graphIndexProbe, makePrefixIndex, FRAME_COVERAGE_MIN_RATIO, GRAPH_INDEX_FILENAME,
};
