'use strict';

// Vista «Comprometido para vender»: las mismas métricas del tablero (implementación,
// E2E, barrido) calculadas SÓLO sobre los objetivos con `commitment: "vendible"` en su
// manifest. Sin campo (o con otro valor) cuenta como visión. Fixture: 3 manifests —
// vendible / visión / sin campo — con números elegidos para que global y vendible
// den distinto: si el filtro no filtra, el aserto lo ve.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const binPath = path.join(root, 'bin', 'capa.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-dash-vend-'));

const write = (p, o) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o, null, 2));
};

write(path.join(tmp, 'capa.config.json'), { project: 'smoke', dossierDir: 'capa', graph: 'graphify-out/graph.json' });
write(path.join(tmp, 'graphify-out/graph.json'), { nodes: [] });
write(path.join(tmp, 'capa/ADR-0001-uno/VISION.md'), '# VISIÓN — ADR-0001 · Uno\n');
write(path.join(tmp, 'capa/ADR-0001-uno/obj-vendible/manifest.json'), {
  parentAdr: 'ADR-0001', objetivo: 'obj-vendible', lifecycle: 'done', commitment: 'vendible',
  status: { implementation: 'E2E-VERIFIED', barrido: 'EXISTE' }, slices: [{ id: 's1', done: true }],
});
write(path.join(tmp, 'capa/ADR-0001-uno/obj-vision/manifest.json'), {
  parentAdr: 'ADR-0001', objetivo: 'obj-vision', lifecycle: 'wip', commitment: 'vision',
  status: { implementation: 'PARTIAL', barrido: 'PARCIAL' }, slices: [{ id: 's1', done: false }],
});
write(path.join(tmp, 'capa/ADR-0002-dos/VISION.md'), '# VISIÓN — ADR-0002 · Dos\n');
write(path.join(tmp, 'capa/ADR-0002-dos/obj-sin-campo/manifest.json'), {
  parentAdr: 'ADR-0002', objetivo: 'obj-sin-campo', lifecycle: 'wip',
  status: { implementation: 'NONE', barrido: 'FALTA' }, slices: [{ id: 's1', done: false }],
});

execFileSync(process.execPath, [binPath, 'dashboard'], { cwd: tmp, encoding: 'utf8' });

// 1) la DB derivada lleva la columna, y "sin campo" se normaliza a visión
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(tmp, 'capa-out', 'capa.db'));
const rows = db.prepare('SELECT objetivo, commitment FROM capa ORDER BY objetivo').all();
db.close();
assert.deepStrictEqual(
  rows.map((r) => `${r.objetivo}=${r.commitment}`),
  ['obj-sin-campo=vision', 'obj-vendible=vendible', 'obj-vision=vision'],
  'capa.commitment debe ser vendible|vision (sin campo ⇒ vision)',
);

const html = fs.readFileSync(path.join(tmp, 'capa-out', 'dashboard.html'), 'utf8');
const kpi = (k) => (html.match(new RegExp(`data-kpi="${k}"[^>]*>([^<]*)<`)) || [])[1];

// 2) cabecera global: (1 + ½) / 3 = 50 %  ·  cabecera vendible: 1/1 = 100 %
assert.ok(html.includes('Comprometido para vender'), 'falta la cabecera «Comprometido para vender»');
assert.strictEqual(kpi('all-impl'), '50%', 'implementación global sobre los 3');
assert.strictEqual(kpi('vend-n'), '1', 'sólo 1 objetivo es vendible');
assert.strictEqual(kpi('vend-impl'), '100%', 'implementación vendible = 1 E2E de 1');
assert.strictEqual(kpi('vend-e2e'), '1/1', 'E2E vendible');
assert.strictEqual(kpi('vend-barrido'), '100%', 'barrido vendible = 1 existe de 1');

// 3) índice por ADR: ADR-0001 tiene 1 vendible al 100 %; ADR-0002 ninguno
const ixRow = (adr) => (html.match(new RegExp(`<tr data-adr="${adr}">[\\s\\S]*?</tr>`)) || [''])[0];
assert.ok(/data-col="vend"[^>]*><span class="bexist">1</.test(ixRow('ADR-0001')), 'ADR-0001: 1 vendible');
assert.ok(/data-col="vend-impl"[^>]*>100</.test(ixRow('ADR-0001')), 'ADR-0001: impl vendible 100 %');
assert.ok(/data-col="vend"[^>]*><span class="zero">/.test(ixRow('ADR-0002')), 'ADR-0002: sin vendibles');

// 4) la fila del objetivo lleva la marca
assert.ok(/obj-vendible<\/code>[^<]*<span class="tag vend">vendible</.test(html), 'la fila vendible debe marcarse');
assert.ok(!/obj-sin-campo<\/code>[^<]*<span class="tag vend">/.test(html), 'sin campo NO se marca vendible');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Dashboard vendible smoke test OK');
