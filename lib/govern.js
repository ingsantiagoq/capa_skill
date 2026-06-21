'use strict';
const fs = require('fs');
const path = require('path');
const { c, die, readJSON } = require('./util');

// `capa govern` — gobernanza a nivel VISIÓN (no CAPA). Lee/escribe
// <vision>/governance.json: las decisiones que requieren firma del PO.
// Estados: pending | signed | rejected.

const STATES = ['pending', 'signed', 'rejected'];

function locate(root, config, adr) {
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  const dir = fs.readdirSync(capaDir).find((n) => n.toLowerCase().includes(adr.toLowerCase()) && fs.existsSync(path.join(capaDir, n, 'governance.json')));
  if (!dir) die(`no hay governance.json para ${adr}`);
  return path.join(capaDir, dir, 'governance.json');
}

function runGovern({ root, config, adr, sign, reject }) {
  if (!adr) die('uso: capa govern ADR-XXXX [--sign DP-x | --reject DP-x]');
  const gPath = locate(root, config, adr);
  const g = readJSON(gPath);
  const decisions = Array.isArray(g.decisions) ? g.decisions : [];

  if (sign || reject) {
    const id = sign || reject;
    const d = decisions.find((x) => x.id === id);
    if (!d) die(`decisión no encontrada: ${id}`);
    d.state = sign ? 'signed' : 'rejected';
    fs.writeFileSync(gPath, JSON.stringify(g, null, 2) + '\n');
    console.log(c.green('✓ ') + `${id} → ${d.state}`);
  }

  const icon = (s) => (s === 'signed' ? c.green('✓ firmada') : s === 'rejected' ? c.red('✗ rechazada') : c.yellow('… pendiente'));
  console.log(c.bold(`\nGobernanza · ${g.adr}`));
  for (const d of decisions) {
    const gate = d.gate ? c.red(' 🔒gate') : '';
    console.log(`  ${icon(d.state).padEnd(20)} ${c.bold(d.id)}${gate}  ${d.what}`);
    console.log(`      ${c.dim('→ ' + (d.recommendation || ''))}`);
    if (d.unblocks) console.log(`      ${c.dim('desbloquea: ' + d.unblocks)}`);
  }
  const pend = decisions.filter((d) => d.state === 'pending');
  const gates = pend.filter((d) => d.gate);
  console.log('\n' + c.bold('Resumen: ') + `${decisions.length} decisiones · ${pend.length} pendiente(s)` + (gates.length ? c.red(` · ${gates.length} gate(s) bloqueando T-INT: ${gates.map((d) => d.id).join(', ')}`) : c.green(' · 0 gates bloqueando')));
}

module.exports = { runGovern, STATES };
