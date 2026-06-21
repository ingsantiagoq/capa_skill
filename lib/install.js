'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { c, die } = require('./util');

const BEGIN = '<!-- BEGIN CAPA -->';
const END = '<!-- END CAPA -->';

const SECTION = `${BEGIN}
## CAPA — Contexto · Alcance · Progreso · Aseguramiento · Poder

Este proyecto usa **CAPA** (vía \`capa-cli\`). Antes de cerrar cualquier PR que toque un ADR:

1. Cada ADR tiene un dossier en \`capa/<ADR>/\` con 5 dimensiones + \`manifest.json\`.
2. **Anti-teatro (ADR-0017):** todo claim de implementación se ancla a un nodo de graphify
   y a un comando reproducible. No se escribe \`E2E-VERIFIED\` sin ambos.
3. Gate obligatorio: \`capa doctor\` debe salir verde (0 bloqueos = MODO BLOQUEO si no).
4. Para generar/actualizar un dossier con el panel de expertos: usá la skill \`/capa\`.

Comandos: \`capa new <ADR>\` · \`capa doctor [--adr ID]\` · \`capa status\`.
${END}`;

function targetRoot(opts) {
  return opts.global ? os.homedir() : (opts.root || process.cwd());
}

function platformDir(opts) {
  // Only "claude" is implemented; structured to add more platforms later.
  if (opts.platform && opts.platform !== 'claude') die(`plataforma no soportada aún: ${opts.platform} (disponible: claude)`);
  return path.join(targetRoot(opts), '.claude');
}

function upsertClaudeMd(root) {
  const p = path.join(root, 'CLAUDE.md');
  let body = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  if (body.includes(BEGIN)) {
    body = body.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), SECTION);
  } else {
    body = (body.trimEnd() + '\n\n' + SECTION + '\n');
  }
  fs.writeFileSync(p, body);
  return p;
}

function install(opts) {
  const base = platformDir(opts);
  const skillDst = path.join(base, 'skills', 'capa', 'SKILL.md');
  const skillSrc = path.join(__dirname, '..', 'skill', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillDst), { recursive: true });
  fs.copyFileSync(skillSrc, skillDst);
  console.log(c.green('✓ ') + `skill copiada → ${skillDst}`);

  const claudeMd = upsertClaudeMd(targetRoot(opts));
  console.log(c.green('✓ ') + `sección CAPA en ${claudeMd}`);
  console.log(c.dim('  (idempotente · `capa uninstall` la remueve entre markers)'));
  console.log(c.green('✓ ') + 'instalado. Recordá: CAPA depende de graphify (graph.json).');
}

function uninstall(opts) {
  const base = platformDir(opts);
  const skillDir = path.join(base, 'skills', 'capa');
  if (fs.existsSync(skillDir)) { fs.rmSync(skillDir, { recursive: true, force: true }); console.log(c.green('✓ ') + 'skill removida'); }

  const p = path.join(targetRoot(opts), 'CLAUDE.md');
  if (fs.existsSync(p)) {
    let body = fs.readFileSync(p, 'utf8');
    if (body.includes(BEGIN)) {
      body = body.replace(new RegExp(`\\n*${BEGIN}[\\s\\S]*?${END}\\n*`), '\n').trimEnd() + '\n';
      fs.writeFileSync(p, body);
      console.log(c.green('✓ ') + 'sección CAPA removida de CLAUDE.md');
    }
  }
  console.log(c.green('✓ ') + 'desinstalado. (No se tocó capa/ — tus dossiers quedan.)');
}

module.exports = { install, uninstall };
