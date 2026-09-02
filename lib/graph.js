'use strict';
const fs = require('fs');
const path = require('path');

// graphify is a hard dependency: CAPA anchors every claim to a graph node so it
// cannot drift from the code, and threads a CAPA's dependencies along its route.

function resolveGraphPath(root, configGraph) {
  const candidates = [
    configGraph && path.resolve(root, configGraph),
    path.join(root, 'graphify-out', 'graph.json'),
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
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
  return {
    path: graphPath,
    builtAtCommit: raw.built_at_commit || null,
    nodeCount: nodes.length,
    linkCount: links.length,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    nodes: () => nodes,
    links: () => links,
  };
}

module.exports = { resolveGraphPath, loadGraph, streamParseGraph, FAST_PATH_MAX_BYTES };
