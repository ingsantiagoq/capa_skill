'use strict';

// El ÚNICO dashboard de CAPA: `capa dashboard` -> capa-out/dashboard.html,
// derivado de los manifests. Este smoke levanta un proyecto CAPA mínimo en un
// tmpdir, lo renderiza y verifica que el índice consolidado salga con los tiers.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const binPath = path.join(root, 'bin', 'capa.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-dash-'));

const write = (p, o) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o, null, 2));
};

write(path.join(tmp, 'capa.config.json'), {
  project: 'smoke', dossierDir: 'capa', graph: 'graphify-out/graph.json',
  tiers: [{ name: 'Fundacional', from: 'ADR-0001', to: 'ADR-0005' }],
});
write(path.join(tmp, 'graphify-out/graph.json'), { nodes: [] });
write(path.join(tmp, 'capa/ADR-0001-uno/VISION.md'), '# VISIÓN — ADR-0001 · Uno\n');
write(path.join(tmp, 'capa/ADR-0001-uno/objetivo-hecho/manifest.json'), {
  parentAdr: 'ADR-0001', objetivo: 'objetivo-hecho', title: 'Hecho', lifecycle: 'done',
  status: { decision: 'ACEPTADA', implementation: 'E2E-VERIFIED', barrido: 'COMPLETO' },
  slices: [{ id: 's1', done: true }],
});
write(path.join(tmp, 'capa/ADR-0020-veinte/VISION.md'), '# VISIÓN — ADR-0020 · Veinte\n');
write(path.join(tmp, 'capa/ADR-0020-veinte/objetivo-falta/manifest.json'), {
  parentAdr: 'ADR-0020', objetivo: 'objetivo-falta', title: 'Falta', lifecycle: 'wip',
  status: { decision: 'PROPUESTA', implementation: 'NONE', barrido: 'FALTA' },
  slices: [{ id: 's1', done: false }],
});

execFileSync(process.execPath, [binPath, 'dashboard'], { cwd: tmp, encoding: 'utf8' });

const htmlPath = path.join(tmp, 'capa-out', 'dashboard.html');
assert.ok(fs.existsSync(htmlPath), 'capa dashboard debe escribir capa-out/dashboard.html');
assert.ok(fs.existsSync(path.join(tmp, 'capa-out', 'capa.db')), 'debe escribir la SQLite derivada');
const html = fs.readFileSync(htmlPath, 'utf8');

// índice consolidado: tier declarado + tier por defecto para lo que cae afuera
assert.ok(html.includes('class="index"'), 'falta el índice consolidado');
assert.ok(html.includes('>Fundacional<'), 'falta el tier declarado en capa.config.json');
assert.ok(html.includes('>OTROS<'), 'un ADR fuera de todo rango debe caer en OTROS');

// el índice enlaza a la sección de cada ADR y la sección existe
assert.ok(html.includes('href="#ADR-0001"'), 'el índice debe enlazar al ADR');
assert.ok(html.includes('id="ADR-0001"'), 'la sección del ADR debe ser anclable');

// el título del índice no repite el id que ya va en su columna
assert.ok(!html.includes('>ADR-0001 · Uno<'), 'el índice no debe repetir el id en el título');

// madurez: 1 E2E de 1 = 100%; 0 de 1 = 0%
assert.ok(/100<small>%<\/small>/.test(html), 'ADR-0001 debe rendir 100% de implementación');

// los TRES ejes se publican juntos; implementación es el titular
for (const axis of ['implementación', 'barrido', 'lifecycle']) {
  assert.ok(html.includes(`>${axis}</th>`), `falta la columna del eje ${axis}`);
}
assert.ok(/Manda <b>implementación<\/b>/.test(html), 'el titular debe declararse explícito');

// el dashboard es estático: sin servidor, sin fetch
assert.ok(!/fetch\(|XMLHttpRequest/.test(html), 'el dashboard no debe hacer llamadas de red');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Dashboard HTML smoke test OK');
