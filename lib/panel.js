'use strict';
const fs = require('fs');
const path = require('path');
const { c, DIMENSIONS, die, readJSON } = require('./util');

// The "Execution Runtime": CAPA does not free-write prose. It emits a deterministic
// plan of expert prompts — one per CAPA dimension — each grounded in graphify, plus
// an adversarial verifier. The Claude `/capa` skill consumes this plan (as a Workflow
// or sequential agents) to fill/refresh the dossier. `--json` for machine consumption.

const EXPERTS = {
  CONTEXTO: 'Arquitecto de dominio + experto del negocio. Redactá CONTEXTO: problema, principios rectores, modelo/lenguaje ubicuo y reglas de negocio (1.6). Cada concepto del modelo DEBE citar un nodo graphify (`graphify explain "<X>"`). Prohibido afirmar que algo existe sin nodo.',
  ALCANCE: 'Tech lead. Redactá ALCANCE: slices CQRS de la iteración, contrato OpenAPI, exclusiones explícitas y DoD. Cada slice "hecho" cita su nodo graphify; lo no construido va como exclusión, no como hecho.',
  PROGRESO: 'QA/release. Redactá PROGRESO: tabla viva (fecha|módulo|PR|evidencia|tests|swagger|riesgos). CADA fila cuelga un comando reproducible. Si no hay comando, la fila no entra.',
  ASEGURAMIENTO: 'Ingeniero de calidad + seguridad. Redactá ASEGURAMIENTO: header 2-ejes, matriz invariante→test, coverage-by-path, budgets, RBAC/anti-IDOR y contract-test de paridad. Solo marcás E2E-VERIFIED con comando + ancla viva.',
  PODER: 'PO/gobernanza. Redactá PODER: decisiones de firma, compliance/comercial, RBAC y gates de ratificación. Marcá cada decisión pending|signed|rejected con dueño.',
};

const VERIFIER = 'Verificador ADVERSARIAL (abogado del diablo). Asumí que cada claim del dossier es falso hasta probarlo. Para cada ancla: ¿el nodo existe en el grafo? Para cada evidencia: ¿el comando corre y da verde? Refutá todo "verde" sin artefacto. Tu salida es la lista de claims que NO sobrevivieron.';

function runPanel({ root, config, adr, objetivo }) {
  if (!adr) die('uso: capa panel ADR-XXXX --objetivo <slug> [--json]');
  const { findCapas } = require('./doctor');
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  const dir = findCapas(capaDir).find((d) => {
    const rel = path.relative(capaDir, d).toLowerCase();
    return rel.includes(adr.toLowerCase()) && (!objetivo || rel.includes(String(objetivo).toLowerCase()));
  });
  if (!dir) die(`no hay CAPA para ${adr}${objetivo ? '/' + objetivo : ''}. Creálo: capa new ${adr} --objetivo <slug>`);
  const m = readJSON(path.join(dir, 'manifest.json'));

  const plan = {
    adr: m.parentAdr,
    objetivo: m.objetivo,
    route: m.route,
    dossier: path.relative(root, dir),
    graph: config.graph,
    rule: 'Anti-teatro: toda afirmación se ancla a un nodo graphify + un comando reproducible (ADR-0017).',
    stages: [
      { phase: 'Redacción', agents: DIMENSIONS.map((d) => ({ dimension: d, file: `${d}.md`, prompt: EXPERTS[d] })) },
      { phase: 'Verificación', agents: [{ dimension: 'ALL', prompt: VERIFIER }] },
    ],
  };

  if (process.argv.includes('--json')) { console.log(JSON.stringify(plan, null, 2)); return; }

  console.log(c.bold(`\nPanel CAPA · ${m.parentAdr}/${m.objetivo} — ${m.title}`));
  console.log(c.dim(`ruta: ${(m.route || []).join(', ') || '(sin ruta)'}`));
  console.log(c.dim(plan.rule) + '\n');
  console.log(c.bold('Fase 1 · Redacción (5 expertos, en paralelo, anclados a graphify):'));
  for (const d of DIMENSIONS) console.log(`  ${c.cyan(d.padEnd(14))} → ${d}.md\n     ${c.dim(EXPERTS[d])}`);
  console.log('\n' + c.bold('Fase 2 · Verificación adversarial:'));
  console.log('  ' + c.dim(VERIFIER));
  console.log('\n' + c.dim('La skill /capa ejecuta este plan (Workflow). `--json` para consumo máquina.'));
}

module.exports = { runPanel, EXPERTS, VERIFIER };
