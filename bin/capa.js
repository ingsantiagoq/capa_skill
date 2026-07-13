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
const runtime = require('../lib/runtime/items');
const backlog = require('../lib/runtime/backlog');
const guard = require('../lib/runtime/guard');
const guardManifest = require('../lib/runtime/guard-manifest');
const focus = require('../lib/runtime/focus');
const scope = require('../lib/runtime/scope');
const findings = require('../lib/runtime/findings');
const evidence = require('../lib/runtime/evidence');
const tests = require('../lib/runtime/tests');
const reviews = require('../lib/runtime/reviews');
const closure = require('../lib/runtime/closure');
const sprint = require('../lib/runtime/sprint');
const budget = require('../lib/runtime/budget');

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

function printRuntimeItem(item) {
  if (!item) return console.log('(sin PBI activo)');
  console.log(c.bold(`#${item.id} ${item.title}`));
  console.log(`status: ${item.status}`);
  console.log(`state: ${item.current_state} -> ${item.next_state || '—'}`);
  console.log(`type: ${item.type}`);
  console.log(`updated: ${item.updated_at}`);
}

function printBudget() {
  console.log(c.bold('CAPA BUDGET'));
  for (const line of budget.lines(process.cwd())) console.log(line);
}

function runtimeStart({ flags, pos }) {
  const title = pos.join(' ').trim();
  if (!title) { console.error(c.red('uso: capa iniciar "titulo"')); process.exit(1); }
  const id = runtime.create({ root: process.cwd(), title, type: flags.type || 'task', priority: flags.priority || 3 });
  console.log(c.green(`PBI creado #${id}`));
  console.log('Estado actual: NEW');
  console.log('Próximo estado: DISCOVERY');
}

function runtimeStatus() {
  printRuntimeItem(runtime.active(require('../lib/runtime/db').open(process.cwd())));
  printBudget();
}

function printBacklogRows(rows) {
  if (!rows.length) return console.log('(backlog vacío)');
  for (const r of rows) console.log(`#${r.id} [${r.status}] P${r.priority} ${r.type} :: ${r.title} :: ${r.current_state} -> ${r.next_state || '—'}`);
}

function runtimeBacklog({ flags, pos }) {
  const sub = pos[0] || 'list';
  if (sub === 'list') return printBacklogRows(backlog.list({ root: process.cwd(), status: flags.status || null }));
  if (sub === 'add') {
    const title = pos.slice(1).join(' ').trim();
    if (!title) { console.error(c.red('uso: capa backlog add "titulo" [--description "..."] [--type feature] [--priority 2]')); process.exit(1); }
    const item = backlog.add({ root: process.cwd(), title, description: flags.description || null, type: flags.type || 'task', priority: flags.priority || 3 });
    console.log(c.green(`PBI agregado al backlog #${item.id}`));
    console.log(`${item.title}`);
    return;
  }
  if (sub === 'show') {
    const out = backlog.show({ root: process.cwd(), id: pos[1] });
    if (!out.ok) return console.log(c.yellow(out.message));
    printRuntimeItem(out.item);
    if (!out.tasks.length) return console.log('(sin tareas)');
    for (const task of out.tasks) console.log(`  - #${task.id} [${task.status}] ${task.position}. ${task.title} :: model=${task.owner_model}`);
    return;
  }
  if (sub === 'activate') {
    const out = backlog.activate({ root: process.cwd(), id: pos[1] });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.green(`PBI activo #${out.item.id}`));
    console.log(out.item.title);
    return;
  }
  if (sub === 'cancel') {
    const out = backlog.cancel({ root: process.cwd(), id: pos[1], reason: flags.reason || 'Cancelled from backlog' });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.yellow(`PBI cancelado #${out.item.id}`));
    return;
  }
  if (sub === 'task') return runtimeBacklogTask({ flags, pos: pos.slice(1) });
  console.error(c.red('uso: capa backlog <list|add|show|activate|cancel|task>'));
  process.exit(1);
}

function runtimeBacklogTask({ flags, pos }) {
  const sub = pos[0];
  if (sub === 'add') {
    const itemId = flags.pbi || flags.item || pos[1];
    const title = flags.title || pos.slice(itemId === pos[1] ? 2 : 1).join(' ').trim();
    if (!itemId || !title) { console.error(c.red('uso: capa backlog task add --pbi <id> "titulo" [--acceptance "..."] [--model sonnet]')); process.exit(1); }
    const out = backlog.addTask({ root: process.cwd(), itemId, title, description: flags.description || null, acceptance: flags.acceptance || null, ownerModel: flags.model || flags['owner-model'] || 'sonnet' });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.green(`Tarea #${out.task.id} agregada al PBI #${out.item.id}`));
    console.log(`${out.task.title} :: model=${out.task.owner_model}`);
    return;
  }
  if (sub === 'list') {
    const itemId = flags.pbi || flags.item || pos[1];
    const out = backlog.listTasks({ root: process.cwd(), itemId });
    if (!out.ok) return console.log(c.yellow(out.message));
    if (!out.tasks.length) return console.log('(sin tareas)');
    for (const task of out.tasks) console.log(`#${task.id} [${task.status}] ${task.position}. ${task.title} :: model=${task.owner_model}${task.acceptance ? ` :: acceptance=${task.acceptance}` : ''}`);
    return;
  }
  if (sub === 'done') {
    const taskId = pos[1] || flags.task;
    const out = backlog.doneTask({ root: process.cwd(), taskId, summary: flags.summary || 'Task done' });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.green(`Tarea cerrada #${out.task.id}`));
    return;
  }
  console.error(c.red('uso: capa backlog task <add|list|done>'));
  process.exit(1);
}

function runtimeNext() {
  const out = runtime.moveNext({ root: process.cwd() });
  if (!out.ok) return console.log(c.yellow(out.message));
  console.log(c.bold('CAPA ONE-STEP'));
  console.log(`PBI: #${out.item.id} ${out.item.title}`);
  console.log(`Estado a ejecutar: ${out.state}`);
  console.log(`Próximo estado: ${out.following || '—'}`);
  console.log('Regla: ejecuta solo este estado, registra evidencia y detente.');
  printBudget();
}

function runtimeGo() {
  console.log(c.bold('CAPA GO'));
  const out = runtime.moveNext({ root: process.cwd() });
  if (!out.ok) {
    console.log(c.yellow(out.message));
    console.log('No avances ni edites. Completa el estado actual primero.');
    return;
  }
  console.log(`PBI: #${out.item.id} ${out.item.title}`);
  console.log(`Estado a ejecutar: ${out.state}`);
  console.log(`Próximo estado: ${out.following || '—'}`);
  console.log('Regla: haz solo este estado, registra evidencia si aplica, completa y detente.');
  printBudget();
}

function runtimeComplete({ flags }) {
  const out = runtime.complete({ root: process.cwd(), status: flags.status || 'ok', summary: flags.summary || 'transition completed' });
  if (!out.ok) return console.log(c.yellow(out.message));
  console.log(c.green('CAPA STOP'));
  console.log(`Estado ejecutado: ${out.item.current_state}`);
  console.log(`Resultado: ${out.status}`);
  console.log(`Próximo estado: ${out.item.next_state || '—'}`);
}

function runtimeBlock({ pos }) {
  const reason = pos.join(' ').trim() || 'Blocked';
  const out = runtime.setBlocked({ root: process.cwd(), reason });
  if (!out.ok) return console.log(c.yellow(out.message));
  console.log(c.red(`PBI bloqueado #${out.item.id}: ${reason}`));
}

function runtimeGuard({ flags, pos }) {
  const action = pos[0];
  if (!action) { console.error(c.red('uso: capa guard <edit|write|delete|close|done> [--file ruta] [--manifest] [--auto-fix]')); process.exit(1); }
  if (flags.manifest) {
    const { root, config } = loadConfig();
    const result = guardManifest.evaluate({ root, config, file: flags.file });
    guardManifest.print(result);
    if (!result.allowed) process.exit(result.code || 2);
    return;
  }
  const result = guard.evaluate({ root: process.cwd(), action, file: flags.file, autoFix: Boolean(flags['auto-fix'] || flags.autofix) });
  guard.print(result);
  if (!result.allowed) process.exit(result.code || 2);
}

function runtimeFocus({ flags, pos }) {
  const { root, config } = loadConfig();
  const sub = pos[0];
  if (sub === 'clear' || flags.clear) {
    focus.clearFocus(root);
    console.log('Foco CAPA limpiado.');
    return;
  }
  // `capa focus` sin args, o `capa focus show` → mostrar
  if (!sub || sub === 'show') {
    const f = focus.getFocus(root);
    if (!f) { console.log('(sin objetivo en foco — usá `capa focus <ADR> <objetivo>`)'); return; }
    console.log(`Objetivo en foco: ${f.adr}/${f.objetivo}`);
    return;
  }
  // `capa focus <ADR> <objetivo>` o `capa focus <ADR> --objetivo <slug>`
  const adr = sub;
  const objetivo = pos[1] || flags.objetivo;
  const out = focus.setFocus({ root, config, adr, objetivo });
  if (!out.ok) { console.error(c.red(out.message)); process.exit(1); }
  console.log(c.green(`Foco CAPA: ${out.adr}/${out.objetivo}`));
}

function runtimeScope({ flags, pos }) {
  const sub = pos[0];
  if (sub === 'add') {
    const allowedPath = pos[1];
    if (!allowedPath) { console.error(c.red('uso: capa scope add <ruta> [--reason "motivo"]')); process.exit(1); }
    const out = scope.add({ root: process.cwd(), allowedPath, reason: flags.reason || null });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.green(`Scope agregado al PBI #${out.item.id}: ${out.allowedPath}`));
    if (out.reason) console.log(`Motivo: ${out.reason}`);
    return;
  }
  if (sub === 'list') {
    const out = scope.list({ root: process.cwd() });
    if (!out.ok) return console.log(c.yellow(out.message));
    if (!out.rows.length) return console.log('(scope vacío)');
    for (const row of out.rows) console.log(`#${row.id} ${row.allowed_path}${row.reason ? ` :: ${row.reason}` : ''}`);
    return;
  }
  console.error(c.red('uso: capa scope <add|list>'));
  process.exit(1);
}

function runtimeFinding({ flags, pos }) {
  const sub = pos[0];
  if (sub === 'add') {
    const title = pos.slice(1).join(' ').trim();
    if (!title) { console.error(c.red('uso: capa finding add "titulo" [--description "..."] [--outside] [--action record]')); process.exit(1); }
    const out = findings.add({ root: process.cwd(), title, description: flags.description || null, belongs: !Boolean(flags.outside), action: flags.action || 'record' });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.green(`Finding #${out.findingId} registrado en PBI #${out.item.id}: ${out.title}`));
    console.log(`Pertenece al PBI actual: ${out.belongs ? 'SI' : 'NO'}`);
    console.log(`Acción: ${out.action}`);
    return;
  }
  if (sub === 'list') {
    const out = findings.list({ root: process.cwd() });
    if (!out.ok) return console.log(c.yellow(out.message));
    if (!out.rows.length) return console.log('(sin hallazgos)');
    for (const row of out.rows) console.log(`#${row.id} [${row.belongs_to_current_item ? 'IN' : 'OUT'}] ${row.title} :: ${row.action}`);
    return;
  }
  console.error(c.red('uso: capa finding <add|list>'));
  process.exit(1);
}

function runtimeEvidence({ flags, pos }) {
  const sub = pos[0];
  if (sub === 'add') {
    const claim = pos.slice(1).join(' ').trim();
    if (!claim) { console.error(c.red('uso: capa evidence add "claim" [--classification VERIFIED|PARTIAL|ASSUMPTION|UNKNOWN] [--type test] [--file ruta] [--command "..."]')); process.exit(1); }
    const out = evidence.add({ root: process.cwd(), claim, classification: flags.classification || flags.class || 'UNKNOWN', sourceType: flags.type || null, filePath: flags.file || null, symbol: flags.symbol || null, command: flags.command || null, resultSummary: flags.result || flags.summary || null, confidence: flags.confidence || null });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.green(`Evidence #${out.evidenceId} registrada en PBI #${out.item.id}`));
    console.log(`Clasificación: ${out.classification}`);
    console.log(`Claim: ${out.claim}`);
    return;
  }
  if (sub === 'list') {
    const out = evidence.list({ root: process.cwd() });
    if (!out.ok) return console.log(c.yellow(out.message));
    if (!out.rows.length) return console.log('(sin evidencia)');
    for (const row of out.rows) console.log(`#${row.id} [${row.classification}] ${row.state} :: ${row.claim}${row.source_type ? ` :: ${row.source_type}` : ''}`);
    return;
  }
  console.error(c.red('uso: capa evidence <add|list>'));
  process.exit(1);
}

function runtimeTest({ flags, pos }) {
  const sub = pos[0];
  if (sub === 'add') {
    const out = tests.add({ root: process.cwd(), testType: flags.type || null, command: flags.command || pos.slice(1).join(' ').trim() || null, status: flags.status || 'unknown', summary: flags.summary || null });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.green(`Test #${out.testId} registrado en PBI #${out.item.id}`));
    console.log(`Status: ${out.status}`);
    return;
  }
  if (sub === 'list') {
    const out = tests.list({ root: process.cwd() });
    if (!out.ok) return console.log(c.yellow(out.message));
    if (!out.rows.length) return console.log('(sin tests)');
    for (const row of out.rows) console.log(`#${row.id} [${row.status}] ${row.test_type || 'test'} :: ${row.command || row.summary || ''}`);
    return;
  }
  console.error(c.red('uso: capa test <add|list>'));
  process.exit(1);
}

function runtimeReview({ flags, pos }) {
  const sub = pos[0];
  if (sub === 'add') {
    const out = reviews.add({ root: process.cwd(), status: flags.status || 'ok', diffSummary: flags.summary || pos.slice(1).join(' ').trim() || null, findings: flags.findings || null, riskLevel: flags.risk || null });
    if (!out.ok) return console.log(c.yellow(out.message));
    console.log(c.green(`Review #${out.reviewId} registrada en PBI #${out.item.id}`));
    console.log(`Status: ${out.status}`);
    return;
  }
  if (sub === 'list') {
    const out = reviews.list({ root: process.cwd() });
    if (!out.ok) return console.log(c.yellow(out.message));
    if (!out.rows.length) return console.log('(sin reviews)');
    for (const row of out.rows) console.log(`#${row.id} [${row.status}] risk=${row.risk_level || '—'} :: ${row.diff_summary || ''}`);
    return;
  }
  console.error(c.red('uso: capa review <add|list>'));
  process.exit(1);
}

function runtimeClose({ flags, pos }) {
  const target = pos[0];
  if (target === 'pbi') {
    const out = closure.closePbi({ root: process.cwd(), summary: flags.summary || null });
    if (!out.ok) {
      console.log(c.red('CAPA BLOCK'));
      if (out.item) console.log(`PBI: #${out.item.id} ${out.item.title}`);
      for (const blocker of out.blockers) console.log(`- ${blocker}`);
      process.exit(2);
    }
    console.log(c.green('CAPA PBI CLOSED'));
    console.log(`PBI: #${out.item.id} ${out.item.title}`);
    console.log(`Resumen: ${out.summary}`);
    return;
  }
  if (target === 'sprint') {
    const out = sprint.closeSprint({ root: process.cwd(), summary: flags.summary || null });
    console.log(c.green('CAPA SPRINT CLOSED'));
    console.log(`Closure: #${out.closureId}`);
    console.log(`PBIs cerrados: ${out.closedCount}`);
    console.log(`PBIs pendientes: ${out.pendingCount}`);
    console.log(`Hallazgos: ${out.findingCount}`);
    console.log(out.summary);
    return;
  }
  console.error(c.red('uso: capa cerrar <pbi|sprint> [--summary "..."]'));
  process.exit(1);
}

function help() {
  console.log(`${c.bold('capa')} v${pkg.version} — Contexto · Alcance · Progreso · Aseguramiento

${c.bold('Runtime DB-first:')}
  ${c.cyan('iniciar')} "titulo"              crea PBI activo en .capa/capa.db
  ${c.cyan('estado')}                         muestra PBI activo DB-first
  ${c.cyan('budget')}                         muestra presupuesto por transición
  ${c.cyan('go')} / ${c.cyan('vamos')}        flujo natural: avanza una transición y se detiene
  ${c.cyan('siguiente')}                      inicia una sola transición one-step
  ${c.cyan('completar')} [--status ok]        registra cierre de transición
  ${c.cyan('bloquear')} "motivo"              bloquea PBI activo
  ${c.cyan('backlog')} <list|add|show|activate|cancel|task> gestiona backlog, PBIs y tareas
  ${c.cyan('guard')} <acción> [--file ruta] [--manifest]  valida si una acción está permitida (--manifest = modo dossier)
  ${c.cyan('focus')} <ADR> <objetivo>         declara el objetivo manifest en foco (gate de edición modo-manifest)
  ${c.cyan('scope')} <add|list>               administra alcance permitido
  ${c.cyan('finding')} <add|list>             registra hallazgos laterales
  ${c.cyan('evidence')} <add|list>            registra evidencia verificable
  ${c.cyan('test')} <add|list>                registra pruebas del PBI
  ${c.cyan('review')} <add|list>              registra code review del PBI
  ${c.cyan('cerrar')} pbi                     cierra PBI con gates mínimos
  ${c.cyan('cerrar')} sprint                  compacta sprint desde SQLite

${c.bold('Backlog examples:')}
  ${c.cyan('backlog add')} "Crear login" --type feature --priority 1
  ${c.cyan('backlog activate')} 3
  ${c.cyan('backlog task add')} --pbi 3 "Crear endpoint" --model sonnet --acceptance "test ok"
  ${c.cyan('backlog task list')} --pbi 3
  ${c.cyan('backlog task done')} 7 --summary "implementado"

${c.bold('Legacy dossier:')}
  ${c.cyan('init')}                           config + capa/ (exige graphify)
  ${c.cyan('vision')} <ADR-XXXX>              carpeta-visión de un ADR  [--title "..."]
  ${c.cyan('new')} <ADR-XXXX> --objetivo S    1 CAPA bajo la visión  [--title "..."] [--route a,b]
  ${c.cyan('thread')} <ADR-XXXX> --objetivo S activa graphify sobre la ruta e hila dependencias
  ${c.cyan('progress')} <ADR> --objetivo S    marca qué llevo/qué falta  [--done|--undone <sliceId>]
  ${c.cyan('govern')} <ADR>                   decisiones de gobernanza  [--sign|--reject DP-x]
  ${c.cyan('panel')} <ADR-XXXX> --objetivo S  plan del panel de expertos
  ${c.cyan('doctor')} [--adr ID]              gate anti-teatro
  ${c.cyan('dashboard')}                      ÚNICO tablero: capa-out/dashboard.html (+ SQLite derivada)
  ${c.cyan('status')}                         tabla legacy de todos los CAPAs
  ${c.cyan('install')} / ${c.cyan('uninstall')} skill + sección CLAUDE.md`);
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { flags, pos } = parseFlags(rest);
  switch (cmd) {
    case 'iniciar': case 'start': return runtimeStart({ flags, pos });
    case 'estado': case 'active': return runtimeStatus();
    case 'budget': return printBudget();
    case 'go': case 'vamos': case 'seguir': case 'next-step': return runtimeGo();
    case 'siguiente': case 'next': return runtimeNext();
    case 'completar': case 'complete': return runtimeComplete({ flags });
    case 'bloquear': case 'block': return runtimeBlock({ pos });
    case 'backlog': return runtimeBacklog({ flags, pos });
    case 'guard': return runtimeGuard({ flags, pos });
    case 'focus': return runtimeFocus({ flags, pos });
    case 'scope': return runtimeScope({ flags, pos });
    case 'finding': return runtimeFinding({ flags, pos });
    case 'evidence': return runtimeEvidence({ flags, pos });
    case 'test': return runtimeTest({ flags, pos });
    case 'review': return runtimeReview({ flags, pos });
    case 'cerrar': case 'close': return runtimeClose({ flags, pos });
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
