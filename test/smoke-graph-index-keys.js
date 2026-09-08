'use strict';

// El índice hermano del grafo se lee por chunks, y sus CLAVES tienen que salir exactas.
//
// Defecto real (2026-09-08): `readGraphIndexPaths` no soltaba la comilla de CIERRE, así que las
// 14.373 claves del índice del backend salían como `.capa/schema.sql"`. Con `startsWith` de un
// prefijo corto el error no se nota —por eso el smoke que sólo contaba claves lo dejó pasar— pero la
// clave está mal: cualquier comparación por igualdad falla, y la búsqueda binaria de
// `makePrefixIndex` ordena contra un string que no es el que el índice guarda.
//
// Este test compara clave por clave contra `JSON.parse`, que es la definición: si el lector por
// chunks se aparta del parser de verdad, acá se ve.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readGraphIndexPaths, makePrefixIndex, GRAPH_INDEX_FILENAME } = require('../lib/graph');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-graph-index-'));

// Rutas elegidas para ejercer lo que el lector por bytes puede romper: acentos (multibyte UTF-8),
// escapes JSON, comillas dentro del valor, y una clave que es prefijo exacto de otra.
const RUTAS = [
  '.capa/schema.sql',
  'btw-ubp-backend/ubp-ledger-service/src/Ubp.Ledger.Domain/JournalEntry.cs',
  'btw-ubp-backend/ubp-ledger-service/src/Ubp.Ledger.Domain/JournalEntryLine.cs',
  'ubp-app/src/app/features/números/año-fiscal.ts',
  'ubp-protos/pos.proto',
  'docs/con "comillas"/nota.md',
  'docs/con\\barra/nota.md',
];

const index = {};
for (const r of RUTAS) index[r] = { mtime: 1, ast_hash: 'x', semantic_hash: '' };
// Un valor que contiene texto parecido a una clave: no debe colarse como ruta.
index['ubp-tax-service/src/TaxCalculationService.cs'] = { mtime: 2, ast_hash: 'no-soy-una-ruta/aunque-lo-parezca.cs', semantic_hash: '' };
fs.writeFileSync(path.join(dir, 'graph.json'), JSON.stringify({ nodes: [], links: [] }));
fs.writeFileSync(path.join(dir, GRAPH_INDEX_FILENAME), JSON.stringify(index, null, 2));

const graphPath = path.join(dir, 'graph.json');
const leidas = readGraphIndexPaths(graphPath);
const esperadas = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, GRAPH_INDEX_FILENAME), 'utf8')));

// 1) Las claves salen EXACTAS — no sólo la misma cantidad.
assert.deepStrictEqual(leidas.slice().sort(), esperadas.slice().sort(),
  `las claves del índice deben coincidir con JSON.parse:\n  leídas   : ${JSON.stringify(leidas)}\n  esperadas: ${JSON.stringify(esperadas)}`);

// 2) Ninguna arrastra comillas — el defecto concreto que este test fija.
for (const k of leidas) {
  assert.ok(!k.startsWith('"') && !k.endsWith('"'),
    `la clave no debe traer comillas de delimitación: ${JSON.stringify(k)}`);
}

// 3) Los VALORES no se cuelan como rutas.
assert.ok(!leidas.includes('no-soy-una-ruta/aunque-lo-parezca.cs'),
  'sólo las claves (profundidad 1) son rutas; los valores no');

// 4) El índice de prefijos responde sobre las claves limpias: una ruta EXACTA se encuentra a sí
//    misma. Con la comilla pegada esto seguía andando por casualidad (startsWith), pero una clave
//    que es prefijo de otra deja de distinguirse — que es lo que el defecto ponía en riesgo.
const hasPrefix = makePrefixIndex(leidas);
assert.ok(hasPrefix('.capa/schema.sql'), 'ruta exacta');
assert.ok(hasPrefix('btw-ubp-backend/ubp-ledger-service/src/Ubp.Ledger.Domain/JournalEntry.cs'), 'clave que es prefijo de otra');
assert.ok(hasPrefix('ubp-app/src/app/features/números'), 'prefijo con acentos (multibyte)');
assert.ok(!hasPrefix('ubp-inexistente/'), 'un prefijo que no está no debe encontrarse');

// 5) Sin índice hermano se devuelve null (no [] — la diferencia decide si el candidato es medible).
const solo = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-graph-index-sin-'));
fs.writeFileSync(path.join(solo, 'graph.json'), JSON.stringify({ nodes: [], links: [] }));
assert.strictEqual(readGraphIndexPaths(path.join(solo, 'graph.json')), null,
  'sin manifest.json hermano el candidato no es medible, y eso NO es cobertura cero');

console.log('Graph index keys (lector por chunks ↔ JSON.parse) smoke test OK');
