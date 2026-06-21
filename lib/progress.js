'use strict';
const fs = require('fs');
const path = require('path');
const { c, die, readJSON } = require('./util');
const { findCapas } = require('./doctor');

// `capa progress` — el registro vivo: marca qué llevo y qué falta (slices del
// Alcance). Progreso ACTUALIZA el Alcance: marcar un slice done reescribe el
// manifest, que el dashboard agrega como % de avance.

function locate(root, config, adr, objetivo) {
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  const dir = findCapas(capaDir).find((d) => {
    const rel = path.relative(capaDir, d).toLowerCase();
    return rel.includes(String(adr).toLowerCase()) && (!objetivo || rel.includes(String(objetivo).toLowerCase()));
  });
  if (!dir) die(`no hay CAPA para ${adr}${objetivo ? '/' + objetivo : ''}`);
  return path.join(dir, 'manifest.json');
}

function runProgress({ root, config, adr, objetivo, done, undone }) {
  if (!adr) die('uso: capa progress ADR-XXXX --objetivo <slug> [--done <sliceId> | --undone <sliceId>]');
  const mPath = locate(root, config, adr, objetivo);
  const m = readJSON(mPath);
  const slices = Array.isArray(m.slices) ? m.slices : [];

  if (done || undone) {
    const id = done || undone;
    const s = slices.find((x) => x.id === id);
    if (!s) die(`slice no encontrado: ${id}`);
    s.done = !!done;
    fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');
    console.log(c.green('✓ ') + `slice ${id} → ${s.done ? 'done' : 'pendiente'}`);
  }

  const total = slices.length;
  const cnt = slices.filter((s) => s.done).length;
  const pct = total ? Math.round((cnt / total) * 100) : 0;
  console.log(c.bold(`\n${m.parentAdr}/${m.objetivo}`) + c.dim(`  lifecycle=${m.lifecycle || 'wip'}  avance ${cnt}/${total} (${pct}%)`));
  for (const s of slices) console.log(`  ${s.done ? c.green('[x]') : c.dim('[ ]')} ${c.dim(s.id)} ${s.title}`);
  const falta = slices.filter((s) => !s.done);
  if (falta.length) console.log('\n' + c.yellow('Falta para cerrar el Alcance: ') + falta.map((s) => s.id).join(', '));
  else console.log('\n' + c.green('Alcance completo en slices.') + c.dim(' (lifecycle=done aún exige prueba api/e2e-ui + firmas · `capa doctor`)'));
}

module.exports = { runProgress };
