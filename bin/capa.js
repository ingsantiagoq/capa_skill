#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { c, loadConfig, readJSON } = require('../lib/util');
const { init, vision, newCapa } = require('../lib/scaffold');
const { runDoctor, findCapas } = require('../lib/doctor');
const { runThread } = require('../lib/thread');
const { runProgress } = require('../lib/progress');
const { runGovern } = require('../lib/govern');
const { runDashboard } = require('../lib/dashboard');
const { install, uninstall } = require('../lib/install');
const { runPanel } = require('../lib/panel');

const pkg = require('../package.json');

function parseFlags(args) {
  const flags = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2), next = args[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { flags, pos };
}

function cmdStatus({ root, config }) {
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  if (!fs.existsSync(capaDir)) { console.log('(sin CAPAs)'); return; }
  const rows = [];
  for (const dir of findCapas(capaDir).sort()) {
    try {
      const m = readJSON(path.join(dir, 'manifest.json'));
      rows.push([
        `${m.parentAdr || '?'}/${m.objetivo || path.basename(dir)}`,
        m.status?.decision || '?', m.status?.implementation || '?',
        m.status?.verified_against || '—',
        String((m.anchors || []).length), String((m.evidence || []).length), String((m.route || []).length),
      ]);
    } catch { rows.push([path.relative(capaDir, dir), 'ILEGIBLE', '', '', '', '', '']); }
  }
  if (!rows.length) { console.log('(sin CAPAs — solo visiones. Creá uno con `capa new`)'); return; }
  const head = ['ADR/Objetivo', 'Decisión', 'Implementación', 'vs', 'ancl', 'evid', 'ruta'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || '').length)));
  const fmt = (r) => r.map((cell, i) => (cell || '').padEnd(w[i])).join('  ');
  console.log(c.bold(fmt(head)));
  for (const r of rows) {
    const impl = r[2];
    const color = impl === 'E2E-VERIFIED' ? c.green : impl === 'PARTIAL' ? c.yellow : c.dim;
    console.log(fmt([r[0], r[1], color(r[2].padEnd(w[2])), r[3], r[4], r[5], r[6]]));
  }
}

function help() {
  console.log(`${c.bold('capa')} v${pkg.version} — Contexto · Alcance · Progreso · Aseguramiento · Poder

Un ADR es la ${c.bold('visión')}; cada iteración/módulo/objetivo es ${c.bold('1 CAPA')} (detalle extremo, cero imaginación).

${c.bold('Uso:')} capa <comando> [opciones]

  ${c.cyan('init')}                          config + capa/ (exige graphify)
  ${c.cyan('vision')} <ADR-XXXX>             carpeta-visión de un ADR  [--title "..."]
  ${c.cyan('new')} <ADR-XXXX> --objetivo S   1 CAPA bajo la visión  [--title "..."] [--route a,b]
  ${c.cyan('thread')} <ADR-XXXX> --objetivo S  activa graphify sobre la ruta e hila dependencias
  ${c.cyan('progress')} <ADR> --objetivo S    marca qué llevo/qué falta  [--done|--undone <sliceId>]
  ${c.cyan('govern')} <ADR>                   decisiones de firma (gobernanza)  [--sign|--reject DP-x]
  ${c.cyan('panel')} <ADR-XXXX> --objetivo S   plan del panel de expertos (Execution Runtime)
  ${c.cyan('doctor')} [--adr ID]             gate anti-teatro + regla dura de Done (E9/E10)
  ${c.cyan('dashboard')}                     construye SQLite derivada + HTML del proyecto
  ${c.cyan('status')}                        tabla 2-ejes de todos los CAPAs
  ${c.cyan('install')} / ${c.cyan('uninstall')}        skill + sección CLAUDE.md  [--platform claude] [--global]

CAPA depende de ${c.bold('graphify')}: cada claim se ancla a un nodo; cada ruta se hila contra el grafo.`);
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { flags, pos } = parseFlags(rest);
  switch (cmd) {
    case 'init': return init({ root: process.cwd(), dossierDir: flags.dir || 'capa' });
    case 'vision': { const { root, config } = loadConfig(); return vision({ root, config, adr: pos[0], title: flags.title, slug: flags.slug }); }
    case 'new': { const { root, config } = loadConfig(); return newCapa({ root, config, adr: pos[0], objetivo: flags.objetivo, title: flags.title, route: flags.route, frontend: !!flags.frontend }); }
    case 'thread': { const { root, config } = loadConfig(); return runThread({ root, config, adr: pos[0], objetivo: flags.objetivo }); }
    case 'progress': { const { root, config } = loadConfig(); return runProgress({ root, config, adr: pos[0], objetivo: flags.objetivo, done: flags.done, undone: flags.undone }); }
    case 'govern': { const { root, config } = loadConfig(); return runGovern({ root, config, adr: pos[0], sign: flags.sign, reject: flags.reject }); }
    case 'dashboard': { const { root, config } = loadConfig(); return runDashboard({ root, config }); }
    case 'panel': { const { root, config } = loadConfig(); return runPanel({ root, config, adr: pos[0], objetivo: flags.objetivo }); }
    case 'doctor': { const { root, config } = loadConfig(); return runDoctor({ root, config, onlyAdr: flags.adr }); }
    case 'status': { const { root, config } = loadConfig(); return cmdStatus({ root, config }); }
    case 'install': return install({ platform: flags.platform || 'claude', global: !!flags.global, root: process.cwd() });
    case 'uninstall': return uninstall({ platform: flags.platform || 'claude', global: !!flags.global, root: process.cwd() });
    case 'version': case '--version': case '-v': return console.log(pkg.version);
    case undefined: case 'help': case '--help': case '-h': return help();
    default: console.error(c.red(`comando desconocido: ${cmd}`)); help(); process.exit(1);
  }
}

main();
