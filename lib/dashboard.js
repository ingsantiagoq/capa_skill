'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { c, die, readJSON, hasScopeProof, loadGovernance, isPendingDecision } = require('./util');
const { findCapas } = require('./doctor');

// `capa dashboard` — build a DERIVED SQLite projection from the manifests (+ git)
// and render a project-wide HTML. The DB is a cache: it is dropped and rebuilt
// every run from git-tracked manifests. The source of truth stays in the code.

function loadSqlite() {
  try { return require('node:sqlite'); } catch (e) { die('node:sqlite no disponible (necesita Node >=22). ' + e.message); }
}

function gitShort(root) {
  try { return execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return null; }
}

function progress(m) {
  const slices = Array.isArray(m.slices) ? m.slices : [];
  const total = slices.length;
  const done = slices.filter((s) => s && s.done).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : (m.lifecycle === 'done' ? 100 : 0) };
}

function blockedReason(m, gov) {
  const reasons = [];
  const hasProof = hasScopeProof(m, gov);
  const pending = (m.decisions || []).filter(isPendingDecision);
  if (!hasProof) reasons.push('sin prueba api/e2e-ui');
  if (pending.length) reasons.push(`firmas: ${pending.map((d) => d.id).join(',')}`);
  return reasons;
}

function buildDb(root, config) {
  const { DatabaseSync } = loadSqlite();
  const capaDir = path.resolve(root, config.dossierDir || 'capa');
  const outDir = path.join(root, 'capa-out');
  fs.mkdirSync(outDir, { recursive: true });
  const dbPath = path.join(outDir, 'capa.db');
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE vision (adr TEXT PRIMARY KEY, title TEXT, dir TEXT);
    CREATE TABLE capa (
      adr TEXT, objetivo TEXT, title TEXT, lifecycle TEXT, decision TEXT,
      implementation TEXT, verified_against TEXT, frontend INTEGER,
      slices_total INTEGER, slices_done INTEGER, pct INTEGER,
      anchors INTEGER, evidence INTEGER, has_proof INTEGER,
      pending INTEGER, blocked TEXT, route TEXT, barrido TEXT
    );
    CREATE TABLE governance (adr TEXT, id TEXT, what TEXT, state TEXT, gate INTEGER, unblocks TEXT);
  `);

  // visions = top-level dirs with a VISION.md
  for (const name of fs.existsSync(capaDir) ? fs.readdirSync(capaDir) : []) {
    const vdir = path.join(capaDir, name);
    if (fs.statSync(vdir).isDirectory() && fs.existsSync(path.join(vdir, 'VISION.md'))) {
      const adr = (name.match(/ADR-\d{3,4}/i) || [name])[0].toUpperCase();
      const title = (fs.readFileSync(path.join(vdir, 'VISION.md'), 'utf8').match(/^#\s+VISI[ÓO]N\s+[—-]\s+(.+)$/m) || [, name])[1];
      db.prepare('INSERT OR REPLACE INTO vision VALUES (?,?,?)').run(adr, title.trim(), path.relative(root, vdir));
      // governance (decisiones de firma a nivel visión)
      const gPath = path.join(vdir, 'governance.json');
      if (fs.existsSync(gPath)) {
        try {
          const gov = readJSON(gPath);
          const gi = db.prepare('INSERT INTO governance VALUES (?,?,?,?,?,?)');
          for (const d of gov.decisions || []) gi.run(adr, d.id, d.what || '', d.state || 'pending', d.gate ? 1 : 0, d.unblocks || '');
        } catch { /* governance opcional */ }
      }
    }
  }

  const ins = db.prepare(`INSERT INTO capa VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const govCache = new Map(); // adrDir -> governance.json (o null)
  for (const dir of findCapas(capaDir)) {
    let m; try { m = readJSON(path.join(dir, 'manifest.json')); } catch { continue; }
    const adrKey = path.relative(capaDir, dir).split(path.sep)[0];
    if (!govCache.has(adrKey)) govCache.set(adrKey, loadGovernance(capaDir, dir));
    const gov = govCache.get(adrKey);
    const p = progress(m);
    const evidence = Array.isArray(m.evidence) ? m.evidence : [];
    const hasProof = hasScopeProof(m, gov) ? 1 : 0;
    const pending = (m.decisions || []).filter(isPendingDecision).length;
    ins.run(
      m.parentAdr || '?', m.objetivo || path.basename(dir), m.title || '', m.lifecycle || 'wip',
      m.status?.decision || '?', m.status?.implementation || '?', m.status?.verified_against || '',
      m.frontend ? 1 : 0, p.total, p.done, p.pct, (m.anchors || []).length, evidence.length,
      hasProof, pending, blockedReason(m, gov).join(' · '), (m.route || []).join(', '), m.status?.barrido || ''
    );
  }
  return { db, dbPath, outDir };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));

function bar(pct, lifecycle) {
  const color = lifecycle === 'done' ? '#2f7d4f' : pct === 100 ? '#c98a1a' : '#7c6f9e';
  return `<div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div><span>${pct}%</span></div>`;
}
const lifePill = (l) => `<span class="pill ${l}">${l}</span>`;

// Agrupa los ADR en tiers para el índice. `capa.config.json` puede declarar
// `tiers: [{ name, from, to }]` (rangos inclusivos por id). Sin config: un solo grupo.
function tierOf(adr, tiers) {
  for (const t of tiers) if (adr >= t.from && adr <= t.to) return t.name;
  return 'OTROS';
}

// El VISION.md suele titularse "ADR-0001 · Arquitectura…"; el id ya se muestra aparte.
const stripAdr = (title) => String(title).replace(/^ADR-\d{3,4}\s*[·—-]\s*/i, '');

// Un manifest lleva TRES ejes de avance, independientes entre sí. El tablero los
// muestra juntos para que la contradicción se vea en vez de esconderse:
//
//   implementation  qué está construido y probado  <- EJE TITULAR (lo que audita `doctor`)
//   barrido         sweep manual código vs objetivo
//   lifecycle       flag de workflow que declara el agente, sin prueba detrás
//
// Publicar uno solo hace que dos tableros del mismo repo den 5% y 91% para el
// mismo ADR. Si divergen, el que manda es `implementation`.
const inorm = (v) => {
  if (v === 'E2E-VERIFIED') return 'E2E';
  if (v === 'PARTIAL') return 'PARTIAL';
  if (String(v).startsWith('BLOCKED')) return 'BLOCKED';
  return 'NONE';
};
const icount = (rows) => rows.reduce((a, x) => { const k = inorm(x.implementation); a[k] = (a[k] || 0) + 1; return a; }, {});
const imat = (c, total) => (total ? Math.round(((c.E2E || 0) + (c.PARTIAL || 0) / 2) / total * 100) : 0);

function renderHtml(db, meta) {
  const visions = db.prepare('SELECT * FROM vision ORDER BY adr').all();
  const allCapas = db.prepare('SELECT * FROM capa ORDER BY adr, objetivo').all();
  const agg = db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN lifecycle='done' THEN 1 ELSE 0 END) done, ROUND(AVG(pct)) avgpct FROM capa`).get();
  const orphanAdrs = new Set(allCapas.map((x) => x.adr));
  for (const v of visions) orphanAdrs.delete(v.adr);

  const govAll = db.prepare('SELECT * FROM governance ORDER BY adr, id').all();
  const govPending = govAll.filter((g) => g.state === 'pending').length;
  const govGates = govAll.filter((g) => g.state === 'pending' && g.gate).length;

  // Barrido: implementación real vs código (existe / parcial / falta), leído de manifest.status.barrido
  // HECHO/COMPLETO/OK son sinónimos de EXISTE (implementación presente = puntaje 1) en la madurez.
  const bnorm = (v) => { const k = v || 'SD'; return (k === 'HECHO' || k === 'COMPLETO' || k === 'OK') ? 'EXISTE' : k; };
  const bcount = (rows) => rows.reduce((a, x) => { const k = bnorm(x.barrido); a[k] = (a[k] || 0) + 1; return a; }, {});
  const iAll = icount(allCapas);
  const iMatAll = imat(iAll, allCapas.length);
  const bagg = bcount(allCapas);
  const bE = bagg.EXISTE || 0, bP = bagg.PARCIAL || 0, bF = bagg.FALTA || 0, bSD = bagg.SD || 0;
  const bTot = bE + bP + bF;
  const bMat = bTot ? Math.round((bE + bP / 2) / bTot * 100) : 0;
  const bbar = (e, p, f, w) => {
    const t = e + p + f || 1; const pc = (x) => (x / t * 100).toFixed(1);
    return `<div class="bbar"${w ? ` style="width:${w}"` : ''}><i style="width:${pc(e)}%;background:#2f7d4f"></i><i style="width:${pc(p)}%;background:#c98a1a"></i><i style="width:${pc(f)}%;background:#cfc8bc"></i></div>`;
  };
  const bpill = (s) => s ? `<span class="bpill ${s}">${s.toLowerCase()}</span>` : '<span class="bpill SD">s/d</span>';

  const govBlock = (adr) => {
    const gov = govAll.filter((g) => g.adr === adr);
    if (!gov.length) return '';
    const rows = gov.map((g) => {
      const pill = g.state === 'signed' ? '<span class="pill done">firmada</span>' : g.state === 'rejected' ? '<span class="no">rechazada</span>' : '<span class="pill review">pendiente</span>';
      return `<tr><td><code>${esc(g.id)}</code>${g.gate ? ' 🔒' : ''}</td><td>${pill}</td><td>${esc(g.what)}</td><td class="blk">${esc(g.unblocks)}</td></tr>`;
    }).join('');
    return `<details class="gov"><summary>Gobernanza · ${gov.filter((g) => g.state === 'pending').length} pendiente(s)${gov.some((g) => g.gate && g.state === 'pending') ? ' · 🔒 gate bloqueando' : ''}</summary>
      <table><thead><tr><th>DP</th><th>Estado</th><th>Decisión</th><th>Desbloquea</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  };

  const section = (adr, title) => {
    const capas = allCapas.filter((x) => x.adr === adr);
    const rows = capas.map((x) => `
      <tr>
        <td><code>${esc(x.objetivo)}</code>${x.frontend ? ' <span class="tag">front</span>' : ''}</td>
        <td>${bpill(x.barrido)}</td>
        <td>${lifePill(x.lifecycle)}</td>
        <td><span class="ax">${esc(x.decision)}</span> / <span class="ax impl-${esc(x.implementation)}">${esc(x.implementation)}</span></td>
        <td style="min-width:160px">${bar(x.pct, x.lifecycle)}<small>${x.slices_done}/${x.slices_total} slices</small></td>
        <td>${x.has_proof ? '<span class="ok">✓ api/e2e</span>' : '<span class="no">✗ sin prueba</span>'}</td>
        <td class="blk">${x.blocked ? '🔒 ' + esc(x.blocked) : '—'}</td>
      </tr>`).join('');
    const c = bcount(capas);
    const se = c.EXISTE || 0, sp = c.PARCIAL || 0, sf = c.FALTA || 0, st = se + sp + sf;
    const bsum = st ? `${bbar(se, sp, sf, '150px')}<small class="bnums"><span class="bexist">${se}</span>·<span class="bpart">${sp}</span>·<span class="bmiss">${sf}</span> falta</small>` : '';
    return `
      <section id="${esc(adr)}">
        <h2>${esc(adr)} <small>${esc(stripAdr(title))}</small> <span class="hbar">${bsum}</span></h2>
        ${capas.length ? `<table>
          <thead><tr><th>Objetivo (CAPA)</th><th>Barrido</th><th>Lifecycle</th><th>Decisión / Impl</th><th>Progreso</th><th>Prueba</th><th>Bloqueo</th></tr></thead>
          <tbody>${rows}</tbody></table>` : '<p class="empty">visión sin CAPAs — creá un objetivo con <code>capa new</code></p>'}
        ${govBlock(adr)}
      </section>`;
  };

  const sections = [
    ...visions.map((v) => section(v.adr, v.title)),
    ...[...orphanAdrs].map((adr) => section(adr, '(sin VISION.md)')),
  ].join('');

  // Índice consolidado: una fila por ADR, agrupada en tiers.
  const tiers = Array.isArray(meta.tiers) ? meta.tiers : [];
  const idxAdrs = [...visions.map((v) => ({ adr: v.adr, title: v.title })), ...[...orphanAdrs].map((adr) => ({ adr, title: '(sin VISION.md)' }))]
    .sort((a, b) => a.adr.localeCompare(b.adr));
  const num = (n, cls) => (n ? `<span class="${cls}">${n}</span>` : '<span class="zero">–</span>');
  const idxRow = (v) => {
    const capas = allCapas.filter((x) => x.adr === v.adr), t = capas.length;
    const ic = icount(capas);
    const iE = ic.E2E || 0, iP = ic.PARTIAL || 0, iN = (ic.NONE || 0) + (ic.BLOCKED || 0);
    const iMat = imat(ic, t);
    const bc = bcount(capas);
    const bE2 = bc.EXISTE || 0, bP2 = bc.PARCIAL || 0, bF2 = bc.FALTA || 0, bT2 = bE2 + bP2 + bF2;
    const bMat2 = bT2 ? Math.round((bE2 + bP2 / 2) / bT2 * 100) : 0;
    const life = capas.filter((x) => x.lifecycle === 'done').length;
    // flag-rot: objetivo E2E-VERIFIED, con TODOS sus slices hechos y sin decisión
    // pendiente, que sigue sin lifecycle=done. Eso es campo sin mantener. Un E2E con
    // slices pendientes NO cuenta — es incompletitud honesta, no rot.
    const rot = capas.filter((x) => inorm(x.implementation) === 'E2E'
      && x.slices_total > 0 && x.slices_done === x.slices_total
      && x.pending === 0 && x.lifecycle !== 'done').length;
    const stale = rot >= 3 ? ' stale' : '';
    const nblk = capas.filter((x) => x.blocked).length;
    const hot = nblk ? ` <i class="dot" title="${nblk} objetivo(s) con bloqueo"></i>` : '';
    return `<tr>
      <td class="ix"><a href="#${esc(v.adr)}">${esc(v.adr.replace('ADR-', ''))}</a>${hot}</td>
      <td class="ixt">${esc(stripAdr(v.title))}</td>
      <td class="ixb">${bbar(iE, iP, iN, '120px')}</td>
      <td class="n">${num(iE, 'bexist')}</td>
      <td class="n">${num(iP, 'bpart')}</td>
      <td class="n">${num(iN, 'bmiss')}</td>
      <td class="n tot">${t}</td>
      <td class="n mat">${iMat}<small>%</small></td>
      <td class="n ax2" title="barrido: sweep manual código vs objetivo">${bMat2}<small>%</small></td>
      <td class="n ax2${stale}" title="lifecycle: flag de workflow, sin prueba detrás${stale ? ` — ${rot} objetivo(s) E2E completos sin marcar done (flag-rot)` : ''}">${life}<small>/${t}</small></td>
    </tr>`;
  };
  const groups = new Map();
  for (const v of idxAdrs) {
    const k = tiers.length ? tierOf(v.adr, tiers) : 'ADRs';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const indexHead = `<tr class="ixh">
    <th></th><th></th><th>implementación</th>
    <th class="n">e2e</th><th class="n">parc</th><th class="n">falta</th>
    <th class="n">total</th><th class="n">impl</th>
    <th class="n">barrido</th><th class="n">lifecycle</th></tr>`;
  const indexHtml = [...groups].map(([name, vs]) => `
    <tr class="grp"><th colspan="10">${esc(name)}</th></tr>
    ${vs.map(idxRow).join('')}`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CAPA · ${esc(meta.project)}</title>
<style>
  :root{--bg:#faf7f2;--card:#fffdfa;--ink:#1f1d1a;--dim:#8a8378;--line:#e6e0d6;--accent:#2f7d4f;
        --green:#2f7d4f;--amber:#c98a1a;--muted:#c3bcb1;--red:#a4402f}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:32px}
  header{max-width:1160px;margin:0 auto 24px}h1{margin:0 0 4px;font-size:22px;letter-spacing:-.01em}.sub{color:var(--dim)}
  .kpis{display:flex;gap:16px;margin-top:16px;flex-wrap:wrap}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;min-width:120px}
  .kpi b{font-size:24px;display:block}.kpi span{color:var(--dim);font-size:12px}
  main{max-width:1160px;margin:0 auto}
  section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:16px}
  section:target{box-shadow:0 0 0 2px var(--accent)}
  h2{font-size:16px;margin:0 0 12px;display:flex;align-items:center;gap:10px;scroll-margin-top:20px}h2 small{color:var(--dim);font-weight:400}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
  th{color:var(--dim);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  code{background:#f2ede4;padding:1px 6px;border-radius:5px;color:#4a4336;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  small{color:var(--dim)}
  .bar{position:relative;height:16px;background:#efe9df;border-radius:8px;overflow:hidden;display:inline-block;width:120px;vertical-align:middle}
  .bar .fill{height:100%}.bar span{position:absolute;inset:0;text-align:center;font-size:10px;line-height:16px;color:#3a352d}
  .pill{padding:2px 8px;border-radius:20px;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
  .pill.wip{background:#ece8f5;color:#5b4f80}.pill.review{background:#f8efd8;color:#8a6410}.pill.done{background:#e2f0e6;color:#276b43}
  .ax{color:var(--dim)}.impl-E2E-VERIFIED{color:var(--green);font-weight:600}.impl-PARTIAL{color:var(--amber);font-weight:600}
  .ok{color:var(--green)}.no{color:var(--red)}.blk{color:var(--red);font-size:12px}
  .tag{background:#e4eef3;color:#2c5a6e;padding:1px 6px;border-radius:5px;font-size:11px}
  .empty{color:var(--dim)}footer{max-width:1160px;margin:20px auto 0;color:var(--dim);font-size:12px}
  details.gov{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
  details.gov summary{cursor:pointer;color:#8a6410;font-size:13px;font-weight:500}details.gov table{margin-top:8px}
  .barrido{margin-top:16px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px}
  .barrido .bh{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px}
  .barrido .bh b{font-size:14px}.barrido .bh span{color:var(--dim);font-size:12px}
  .bbar{display:inline-flex;height:10px;border-radius:5px;overflow:hidden;background:#efe9df;vertical-align:middle}
  .bbar i{height:100%}
  .bleg{display:flex;gap:18px;margin-top:8px;font-size:12px;font-weight:600}
  .bexist{color:var(--green)}.bpart{color:var(--amber)}.bmiss{color:#9a9287}
  .bnums{margin-left:8px;font-weight:600;color:var(--dim)}.bnums span{margin:0 2px}
  .hbar{display:inline-flex;align-items:center;gap:8px;margin-left:auto;font-weight:400}
  .bpill{padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:.02em;white-space:nowrap}
  .bpill.EXISTE{background:#e2f0e6;color:#276b43}
  .bpill.PARCIAL{background:#f8efd8;color:#8a6410}
  .bpill.FALTA{background:#efe9df;color:#7d766b}
  .bpill.SD{background:#f4f0e9;color:#a8a196}
  /* índice consolidado */
  .index{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px 0 0;margin-bottom:16px;overflow:hidden}
  .index table{width:100%}
  .index tr.grp th{background:#f4efe6;color:#6b6459;font-size:11px;letter-spacing:.12em;font-weight:700;
    padding:10px 16px;text-transform:uppercase;border-bottom:1px solid var(--line)}
  .index td{padding:9px 12px}
  .index td.ix{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim);width:74px;padding-left:16px}
  .index td.ix a{color:var(--dim);text-decoration:none}.index td.ix a:hover{color:var(--ink)}
  .index .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--red);margin-left:5px;vertical-align:middle}
  .index td.ixt{font-weight:500}
  .index td.ixb{width:140px}
  .index td.n{text-align:right;width:52px;font-variant-numeric:tabular-nums}
  .index td.n .zero{color:var(--muted)}
  .index td.tot{color:var(--dim)}
  .index td.mat{font-weight:600;width:58px}
  .index td.mat small{color:var(--dim);font-weight:400}
  .index tr.ixh th{font-size:10px;color:#a29a8e;padding:10px 12px 6px;border-bottom:1px solid var(--line)}
  .index tr.ixh th.n{text-align:right}
  .index td.ax2{color:var(--dim);width:64px;font-weight:400}
  .index td.ax2:last-child{padding-right:16px}
  .index td.ax2 small{color:var(--muted)}
  .index td.ax2.stale{color:var(--red);font-weight:600}
  .index td.ax2.stale::after{content:" ⚠";font-size:10px}
  .axes{padding:12px 16px;color:var(--dim);font-size:12px;line-height:1.6;border-bottom:1px solid var(--line);background:#fdfbf7}
  .axes b{color:var(--ink)}.axes em{font-style:normal;color:#6b6459;font-weight:500}
  .axes code{font-size:11px}
</style></head><body>
<header>
  <h1>CAPA · ${esc(meta.project)}</h1>
  <div class="sub">Tablero derivado de los manifests · DB regenerable · la verdad vive en el código</div>
  <div class="kpis">
    <div class="kpi"><b>${agg.n || 0}</b><span>CAPAs</span></div>
    <div class="kpi"><b class="bexist">${iMatAll}%</b><span>implementación</span></div>
    <div class="kpi"><b>${iAll.E2E || 0}/${agg.n || 0}</b><span>E2E-VERIFIED</span></div>
    <div class="kpi"><b>${visions.length}</b><span>visiones (ADR)</span></div>
    <div class="kpi"><b>${govPending}${govGates ? ' <span style="color:var(--red);font-size:14px">🔒' + govGates + '</span>' : ''}</b><span>firmas pendientes</span></div>
    <div class="kpi"><b>${bMat}%</b><span>madurez (barrido)</span></div>
    <div class="kpi"><b>${agg.done || 0}/${agg.n || 0}</b><span>lifecycle done</span></div>
  </div>
  <div class="barrido">
    <div class="bh"><b>Barrido · implementación vs código real</b><span>${bMat}% madurez ponderada (existe + ½·parcial) · ${bTot} objetivos evaluados${bSD ? ` · ${bSD} s/d` : ''}</span></div>
    ${bbar(bE, bP, bF, '100%')}
    <div class="bleg"><span class="bexist">■ ${bE} existe</span><span class="bpart">■ ${bP} parcial</span><span class="bmiss">■ ${bF} falta</span></div>
  </div>
</header>
<main>
  <div class="index">
    <div class="axes">Tres ejes, mismo manifest. Manda <b>implementación</b> — es lo que audita <code>capa doctor</code>.
      <em>barrido</em> es un sweep manual; <em>lifecycle</em> es un flag que declara el agente, sin prueba detrás.</div>
    <table><thead>${indexHead}</thead><tbody>${indexHtml}</tbody></table>
  </div>
  ${sections || '<section class="empty">sin CAPAs todavía</section>'}
</main>
<footer>generado por capa-cli · git ${esc(meta.git || '?')} · ${esc(meta.when)} · fuente: ${esc(meta.dbPath)}</footer>
</body></html>`;
}

function runDashboard({ root, config }) {
  const { db, dbPath, outDir } = buildDb(root, config);
  const htmlPath = path.join(outDir, 'dashboard.html');
  const meta = {
    project: config.project || path.basename(root), git: gitShort(root),
    when: new Date().toISOString().slice(0, 16).replace('T', ' '),
    dbPath: path.relative(root, dbPath), tiers: config.tiers || [],
  };
  fs.writeFileSync(htmlPath, renderHtml(db, meta));
  db.close();
  const agg = ['vision', 'capa'];
  console.log(c.green('✓ ') + `DB derivada: ${path.relative(root, dbPath)}`);
  console.log(c.green('✓ ') + `dashboard: ${path.relative(root, htmlPath)}`);
  console.log(c.dim('  (regenerable: se reconstruye desde los manifests en cada corrida)'));
}

module.exports = { runDashboard };
