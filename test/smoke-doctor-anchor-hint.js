'use strict';

// [E4] no es un callejón sin salida: dice la completación.
//
// Los ids de graphify son `<ruta>_<símbolo>`, y el error más común al escribir un ancla a mano es
// quedarse con la primera mitad. Medido 2026-09-07 sobre el repo: de 399 anclas rotas, 122 son esa
// truncadura exacta y 60 más resuelven con algún completado — casi la mitad de la «deriva» es un id
// a medio escribir. Un bloqueo que sólo dice «no existe» obliga a redescubrir el formato leyendo el
// graph.json; diciendo qué existe bajo ese prefijo, se arregla en un renglón.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { lintCapa } = require('../lib/doctor');

const OBJ = 'ancla-truncada';

function scaffold(anchors) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-anchor-hint-'));
  const dossier = path.join(root, 'capa', 'ADR-0025-pos', OBJ);
  fs.mkdirSync(dossier, { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  for (const d of ['CONTEXTO', 'ALCANCE', 'PROGRESO', 'ASEGURAMIENTO', 'PODER']) {
    fs.writeFileSync(path.join(dossier, `${d}.md`), `# ${d}\n`);
  }
  fs.writeFileSync(path.join(dossier, 'manifest.json'), JSON.stringify({
    parentAdr: 'ADR-0025', objetivo: OBJ, lifecycle: 'wip',
    status: { decision: 'PROPUESTA', implementation: 'NONE', verified_against: null },
    route: ['src'], slices: [], anchors, evidence: [], decisions: [],
  }));
  return { root, dossier };
}

const graph = {
  nodes: () => [
    { id: 'ubp_ar_application_isalesbyperiodservice_isalesbyperiodservice', source_file: 'src/ISalesByPeriodService.cs' },
    { id: 'ubp_ar_application_isalesbyperiodservice_isalesbyperiodservice_getsalesasync', source_file: 'src/ISalesByPeriodService.cs' },
    { id: 'endpoints_posofflinetrust_posofflinetrustverifier', source_file: 'src/PosOfflineTrust.cs' },
    { id: 'treasury_cash_page_cashpage_confirmclose', source_file: 'src/cash.page.ts' },
  ],
  has(id) { return this.nodes().some((n) => n.id === id); },
};

const e4 = (f) => f.filter((x) => x.code === 'E4' && x.sev === 'BLOCKER');

// 1) Truncadura: el bloqueo nombra el completado, y prefiere `<id>_<último segmento>` sobre el método.
{
  const { root, dossier } = scaffold([{ id: 'ubp_ar_application_isalesbyperiodservice', label: 'ISalesByPeriodService' }]);
  const f = e4(lintCapa(dossier, graph, null, root));
  assert.strictEqual(f.length, 1);
  assert.ok(/¿quisiste decir `ubp_ar_application_isalesbyperiodservice_isalesbyperiodservice`\?/.test(f[0].msg),
    `debe proponer la clase, no el método: ${f[0].msg}`);
  assert.ok(/y 1 más bajo ese prefijo/.test(f[0].msg), `debe decir cuántos más hay: ${f[0].msg}`);
}

// 2) Renombre sin guion de por medio (…trust → …trustverifier): también se propone.
{
  const { root, dossier } = scaffold([{ id: 'endpoints_posofflinetrust_posofflinetrust' }]);
  const f = e4(lintCapa(dossier, graph, null, root));
  assert.ok(/¿quisiste decir `endpoints_posofflinetrust_posofflinetrustverifier`\?/.test(f[0].msg),
    `el prefijo no exige guion: ${f[0].msg}`);
}

// 3) Espacios al borde: el id se ve correcto y no resuelve. El bloqueo lo dice explícitamente.
{
  const { root, dossier } = scaffold([{ id: 'treasury_cash_page_cashpage_confirmclose ' }]);
  const f = e4(lintCapa(dossier, graph, null, root));
  assert.strictEqual(f.length, 1);
  assert.ok(/espacios al borde; sin ellos SÍ existe/.test(f[0].msg), `debe nombrar el espacio: ${f[0].msg}`);
}

// 4) Deriva de verdad (nada bajo ese prefijo): mensaje pelado, sin sugerencia inventada.
{
  const { root, dossier } = scaffold([{ id: 'treasury_cash_page_cashpage_canconfirmclose', label: 'CashPage.canConfirmClose()' }]);
  const f = e4(lintCapa(dossier, graph, null, root));
  assert.strictEqual(f.length, 1);
  assert.ok(!/quisiste decir/.test(f[0].msg), `sin candidatos no se inventa nada: ${f[0].msg}`);
  assert.ok(/CashPage\.canConfirmClose/.test(f[0].msg), 'el label sigue en el mensaje');
}

// 5) Un ancla que resuelve no dice nada, y la sugerencia nunca se propone a sí misma.
{
  const { root, dossier } = scaffold([{ id: 'endpoints_posofflinetrust_posofflinetrustverifier' }]);
  assert.deepStrictEqual(e4(lintCapa(dossier, graph, null, root)), []);
}

// 6) Un grafo sin `nodes()` (stubs viejos de 3 args) no rompe: se degrada al mensaje pelado.
{
  const { root, dossier } = scaffold([{ id: 'lo_que_sea' }]);
  const f = e4(lintCapa(dossier, { has: () => false }, null, root));
  assert.strictEqual(f.length, 1);
  assert.ok(!/quisiste decir/.test(f[0].msg));
}

console.log('Doctor E4 anchor-hint smoke test OK');
