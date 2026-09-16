'use strict';

// `capa verify` — ejecuta la evidencia de UN objetivo del dossier y registra la corrida.
//
// Por qué existe (medido 2026-09-16 sobre btw-ubp-backend):
//   594 objetivos afirman implementación · 594 tienen evidencia · 0 afirman sin ella.
// Esa correlación perfecta no es rigor: la fabrica el propio gate (doctor.js [E5]/[E6]), que exige
// que EXISTA un comando y nunca pregunta si ese comando todavía pasa. Hay 3289 comandos
// reproducibles y cero fecha de última corrida verde.
//
// ⛔ La regla que ordena todo este archivo: LA FECHA NO SE ESCRIBE, SE DERIVA DE EJECUTAR.
// No hay —y no puede haber— parámetro, bandera ni variable de entorno que fije `ran_at`,
// `exit_code` o `ran_at_commit`. Una fecha que se puede declarar es un sello de goma con
// timestamp, y es PEOR que no tener fecha, porque parece verificación.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');
const { open, now } = require('./db');
const { readJSON } = require('../util');

// Tres estados, y nunca dos. «No saber» no es «estar bien».
const SIN_CORRIDA = 'sin-corrida';
const VERDE = 'verde';
const ROJO = 'rojo';

const OUTPUT_TAIL_CHARS = 2000;

function hashCommand(command) {
  return crypto.createHash('sha256').update(String(command)).digest('hex').slice(0, 16);
}

function headCommit(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// Cuántos commits quedaron por encima del commit contra el que se corrió. Un verde de hace 300
// commits no es un verde: es una fecha de vencimiento que ya pasó.
function commitsAhead(root, fromCommit) {
  if (!fromCommit) return null;
  try {
    const out = execFileSync('git', ['-C', root, 'rev-list', '--count', `${fromCommit}..HEAD`], { encoding: 'utf8' });
    return Number(out.trim());
  } catch {
    return null;
  }
}

// Ubica el directorio del objetivo por su manifest, no por convención de nombre: el directorio del
// ADR lleva sufijo descriptivo (ADR-0004-operacion-y-plataforma) y adivinarlo es frágil.
function findObjective({ root, config, adr, objetivo }) {
  const capaDir = path.resolve(root, (config && config.dossierDir) || 'capa');
  const found = [];
  let adrDirs;
  try { adrDirs = fs.readdirSync(capaDir, { withFileTypes: true }); } catch { return null; }
  for (const e of adrDirs) {
    if (!e.isDirectory()) continue;
    const dir = path.join(capaDir, e.name, objetivo);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    let m;
    try { m = readJSON(manifestPath); } catch { continue; }
    if (adr && m.parentAdr && m.parentAdr !== adr) continue;
    found.push({ dir, manifestPath, manifest: m });
  }
  return found.length === 1 ? found[0] : (found[0] || null);
}

function executableEvidence(manifest) {
  const evidence = Array.isArray(manifest.evidence) ? manifest.evidence : [];
  return evidence
    .filter((e) => e && typeof e === 'object' && e.command && String(e.command).trim())
    .map((e) => ({ command: String(e.command).trim(), claim: e.claim ? String(e.claim) : null }));
}

// Ejecuta y registra. Los argumentos dicen QUÉ objetivo correr; nunca CÓMO salió.
function run({ root, config, adr, objetivo }) {
  const target = findObjective({ root, config, adr, objetivo });
  if (!target) return { ok: false, message: `No encuentro el objetivo ${adr || ''}/${objetivo}` };

  const commands = executableEvidence(target.manifest);
  if (!commands.length) {
    // Sin comandos no se escribe NADA. Un objetivo sin evidencia ejecutable no queda «verde
    // porque no falló»: queda sin corrida, que es la verdad.
    return { ok: true, adr: target.manifest.parentAdr || adr, objetivo, runs: [], state: SIN_CORRIDA, empty: true };
  }

  const db = open(root);
  const commit = headCommit(root);
  const insert = db.prepare(`INSERT INTO capa_evidence_runs
    (adr, objetivo, command_hash, command, claim, exit_code, ran_at, ran_at_commit, duration_ms, output_tail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const runs = [];
  for (const { command, claim } of commands) {
    const startedAt = Date.now();
    const proc = spawnSync('/bin/sh', ['-c', command], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const durationMs = Date.now() - startedAt;

    // spawnSync devuelve status null si el proceso murió por señal o no se pudo lanzar. Eso no es
    // un verde: es un rojo del que hay que poder distinguir la causa.
    const exitCode = proc.status === null || proc.status === undefined ? -1 : proc.status;
    const output = `${proc.stdout || ''}${proc.stderr || ''}${proc.error ? `\n${proc.error.message}` : ''}`;
    const ranAt = now();

    insert.run(
      target.manifest.parentAdr || adr || null,
      objetivo,
      hashCommand(command),
      command,
      claim,
      exitCode,
      ranAt,
      commit,
      durationMs,
      output.slice(-OUTPUT_TAIL_CHARS),
    );
    runs.push({ command, claim, exitCode, ranAt, ranAtCommit: commit, durationMs });
  }

  const state = runs.every((r) => r.exitCode === 0) ? VERDE : ROJO;
  return { ok: true, adr: target.manifest.parentAdr || adr, objetivo, runs, state, commit };
}

// Estado de UN objetivo: la última corrida de cada comando que el manifest declara HOY.
//
// Se cruza contra el manifest a propósito: si alguien agrega un comando nuevo, ese comando está
// «sin corrida» aunque los viejos estén verdes, y el objetivo no puede figurar verde por los que ya
// estaban.
function status({ root, config, adr, objetivo }) {
  const target = findObjective({ root, config, adr, objetivo });
  if (!target) return { ok: false, message: `No encuentro el objetivo ${adr || ''}/${objetivo}` };

  const commands = executableEvidence(target.manifest);
  const db = open(root);
  const last = db.prepare(`SELECT exit_code, ran_at, ran_at_commit, duration_ms FROM capa_evidence_runs
    WHERE objetivo = ? AND command_hash = ? ORDER BY ran_at DESC, id DESC LIMIT 1`);

  const rows = commands.map(({ command, claim }) => {
    const row = last.get(objetivo, hashCommand(command));
    if (!row) return { command, claim, state: SIN_CORRIDA, ranAt: null, ranAtCommit: null, behind: null };
    return {
      command,
      claim,
      state: row.exit_code === 0 ? VERDE : ROJO,
      exitCode: row.exit_code,
      ranAt: row.ran_at,
      ranAtCommit: row.ran_at_commit,
      behind: commitsAhead(root, row.ran_at_commit),
    };
  });

  // El peor estado manda, y «sin corrida» no se colapsa en verde: un objetivo con un comando sin
  // correr no es un objetivo verificado.
  let state = SIN_CORRIDA;
  if (rows.length) {
    if (rows.some((r) => r.state === ROJO)) state = ROJO;
    else if (rows.every((r) => r.state === VERDE)) state = VERDE;
    else state = SIN_CORRIDA;
  }

  const verdes = rows.filter((r) => r.state === VERDE && typeof r.behind === 'number');
  const behind = verdes.length ? Math.max(...verdes.map((r) => r.behind)) : null;

  return { ok: true, adr: target.manifest.parentAdr || adr, objetivo, rows, state, behind };
}

module.exports = { run, status, findObjective, executableEvidence, hashCommand, SIN_CORRIDA, VERDE, ROJO };
