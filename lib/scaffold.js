'use strict';
const fs = require('fs');
const path = require('path');
const { c, DIMENSIONS, FRONT_DESIGN_SKILLS, die, writeFileSafe } = require('./util');
const { resolveGraphPath } = require('./graph');

const TPL = path.join(__dirname, '..', 'templates');
const TPL_DOSSIER = path.join(TPL, 'dossier');

function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// `capa init` — config + capa/ at the project root, after checking graphify exists.
function init({ root = process.cwd(), dossierDir = 'capa' } = {}) {
  const configPath = path.join(root, 'capa.config.json');
  if (fs.existsSync(configPath)) die('ya existe capa.config.json acá.');
  const graphPath = resolveGraphPath(root, null);
  if (!graphPath) {
    console.log(c.yellow('⚠ ') + 'no se encontró graphify-out/graph.json. CAPA depende de graphify.');
    console.log('  Corré ' + c.cyan('graphify update .') + ' y reintentá `capa init`.');
    process.exit(2);
  }
  const config = { project: path.basename(root), dossierDir, graph: path.relative(root, graphPath), capaVersion: require('../package.json').version };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  fs.mkdirSync(path.join(root, dossierDir), { recursive: true });
  console.log(c.green('✓ ') + `capa.config.json creado (grafo: ${config.graph})`);
  console.log(c.dim('  Visión de un ADR:  ') + c.cyan('capa vision ADR-XXXX --title "..."'));
  console.log(c.dim('  CAPA por objetivo: ') + c.cyan('capa new ADR-XXXX --objetivo <slug> --route <paths>'));
}

function adrFolder(root, config, adr) {
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  const existing = fs.existsSync(capaDir) && fs.readdirSync(capaDir).find((n) => n.toLowerCase().startsWith(adr.toLowerCase() + '-') || n.toLowerCase() === adr.toLowerCase());
  return existing ? path.join(capaDir, existing) : null;
}

// `capa vision ADR-XXXX` — scaffold the ADR's vision folder (NOT a CAPA).
function vision({ root, config, adr, title = '', slug = '' }) {
  if (!adr || !/^ADR-\d{3,4}$/i.test(adr)) die('uso: capa vision ADR-XXXX [--title "..."] [--slug ...]');
  adr = adr.toUpperCase();
  slug = slug || slugify(title || adr.replace('ADR-', 'adr'));
  const dir = path.resolve(root, config.dossierDir || 'capa', `${adr}-${slug}`);
  if (fs.existsSync(dir)) die(`ya existe la visión ${path.basename(dir)}`);
  const tpl = fs.readFileSync(path.join(TPL, 'VISION.md'), 'utf8');
  writeFileSafe(path.join(dir, 'VISION.md'), render(tpl, { ADR: adr, TITLE: title || adr }));
  console.log(c.green('✓ ') + `visión creada: ${path.relative(root, dir)}/VISION.md`);
  console.log(c.dim('  agregá objetivos: ') + c.cyan(`capa new ${adr} --objetivo <slug> --route <paths>`));
}

// `capa new ADR-XXXX --objetivo <slug>` — ONE CAPA (one Alcance) nested under the ADR vision.
function newCapa({ root, config, adr, objetivo, title = '', route = '', frontend = false }) {
  if (!adr || !/^ADR-\d{3,4}$/i.test(adr)) die('uso: capa new ADR-XXXX --objetivo <slug> [--title "..."] [--route a,b]');
  if (!objetivo) die('falta --objetivo <slug> (un CAPA = un objetivo/iteración/módulo)');
  adr = adr.toUpperCase();
  const visionDir = adrFolder(root, config, adr);
  if (!visionDir) die(`no existe la visión de ${adr}. Creála: capa vision ${adr} --title "..."`);
  const objSlug = slugify(objetivo);
  const dir = path.join(visionDir, objSlug);
  if (fs.existsSync(dir)) die(`ya existe el CAPA ${adr}/${objSlug}`);

  const routeArr = route ? String(route).split(',').map((s) => s.trim()).filter(Boolean) : [];
  const graphRel = path.relative(dir, path.resolve(root, config.graph)).split(path.sep).join('/');
  const vars = { ADR: adr, OBJETIVO: objSlug, TITLE: title || objSlug, GRAPHREL: graphRel };

  for (const d of DIMENSIONS) {
    writeFileSafe(path.join(dir, `${d}.md`), render(fs.readFileSync(path.join(TPL_DOSSIER, `${d}.md`), 'utf8'), vars));
  }
  // manifest with route baked in
  const manifest = JSON.parse(render(fs.readFileSync(path.join(TPL_DOSSIER, 'manifest.json'), 'utf8'), vars));
  manifest.route = routeArr;
  if (frontend) { manifest.frontend = true; manifest.requiresSkills = [...FRONT_DESIGN_SKILLS]; }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(c.green('✓ ') + `CAPA creado: ${path.relative(root, dir)}`);
  if (frontend) console.log(c.dim('  frontend: ') + `requiere skills ${FRONT_DESIGN_SKILLS.join(', ')}`);
  if (routeArr.length) console.log(c.dim('  ruta: ') + routeArr.join(', '));
  console.log(c.dim('  hilá dependencias: ') + c.cyan(`capa thread ${adr} --objetivo ${objSlug}`));
  console.log(c.dim('  validá:            ') + c.cyan(`capa doctor --adr ${adr}`));
}

module.exports = { init, vision, newCapa, render, slugify };
