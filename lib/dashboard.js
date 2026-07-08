'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { c, die, readJSON, hasScopeProof, loadGovernance } = require('./util');
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
  const pending = (m.decisions || []).filter((d) => d && d.state === 'pending');
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
    const pending = (m.decisions || []).filter((d) => d && d.state === 'pending').length;
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
  const color = lifecycle === 'done' ? '#16a34a' : pct === 100 ? '#ca8a04' : '#6366f1';
  return `<div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div><span>${pct}%</span></div>`;
}
const lifePill = (l) => `<span class="pill ${l}">${l}</span>`;

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
  const bagg = bcount(allCapas);
  const bE = bagg.EXISTE || 0, bP = bagg.PARCIAL || 0, bF = bagg.FALTA || 0, bSD = bagg.SD || 0;
  const bTot = bE + bP + bF;
  const bMat = bTot ? Math.round((bE + bP / 2) / bTot * 100) : 0;
  const bbar = (e, p, f, w) => {
    const t = e + p + f || 1; const pc = (x) => (x / t * 100).toFixed(1);
    return `<div class="bbar"${w ? ` style="width:${w}"` : ''}><i style="width:${pc(e)}%;background:#22c55e"></i><i style="width:${pc(p)}%;background:#eab308"></i><i style="width:${pc(f)}%;background:#4b5563"></i></div>`;
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
      <section>
        <h2>${esc(adr)} <small>${esc(title)}</small> <span class="hbar">${bsum}</span></h2>
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

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CAPA · ${esc(meta.project)}</title>
<style>
  :root{--bg:#0b0d12;--card:#151821;--ink:#e6e8ee;--dim:#8b93a7;--line:#262b38;--accent:#6366f1}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:32px}
  header{max-width:1100px;margin:0 auto 24px}h1{margin:0 0 4px;font-size:22px}.sub{color:var(--dim)}
  .kpis{display:flex;gap:16px;margin-top:16px;flex-wrap:wrap}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;min-width:120px}
  .kpi b{font-size:24px;display:block}.kpi span{color:var(--dim);font-size:12px}
  main{max-width:1100px;margin:0 auto}
  section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:16px}
  h2{font-size:16px;margin:0 0 12px;display:flex;align-items:center;gap:10px}h2 small{color:var(--dim);font-weight:400}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
  th{color:var(--dim);font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  code{background:#11131a;padding:1px 6px;border-radius:5px;color:#a5b4fc}small{color:var(--dim)}
  .bar{position:relative;height:16px;background:#11131a;border-radius:8px;overflow:hidden;display:inline-block;width:120px;vertical-align:middle}
  .bar .fill{height:100%}.bar span{position:absolute;inset:0;text-align:center;font-size:10px;line-height:16px;color:#fff;mix-blend-mode:difference}
  .pill{padding:2px 8px;border-radius:20px;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
  .pill.wip{background:#37314d;color:#c4b5fd}.pill.review{background:#3a3318;color:#fde047}.pill.done{background:#14351f;color:#86efac}
  .ax{color:var(--dim)}.impl-E2E-VERIFIED{color:#86efac}.impl-PARTIAL{color:#fde047}
  .ok{color:#86efac}.no{color:#fca5a5}.blk{color:#fca5a5;font-size:12px}.tag{background:#0e2a3a;color:#7dd3fc;padding:1px 6px;border-radius:5px;font-size:11px}
  .empty{color:var(--dim)}footer{max-width:1100px;margin:20px auto 0;color:var(--dim);font-size:12px}
  details.gov{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}details.gov summary{cursor:pointer;color:#fde047;font-size:13px;font-weight:500}details.gov table{margin-top:8px}
  .barrido{margin-top:16px;background:linear-gradient(180deg,#171a24,#12141c);border:1px solid var(--line);border-radius:12px;padding:14px 18px}
  .barrido .bh{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px}
  .barrido .bh b{font-size:14px}.barrido .bh span{color:var(--dim);font-size:12px}
  .bbar{display:inline-flex;height:12px;border-radius:5px;overflow:hidden;border:1px solid var(--line);vertical-align:middle}
  .bbar i{height:100%}
  .bleg{display:flex;gap:18px;margin-top:8px;font-size:12px;font-weight:600}
  .bexist{color:#22c55e}.bpart{color:#eab308}.bmiss{color:#94a3b8}
  .bnums{margin-left:8px;font-weight:600;color:var(--dim)}.bnums span{margin:0 2px}
  .hbar{display:inline-flex;align-items:center;gap:8px;margin-left:auto;font-weight:400}
  .bpill{padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:.02em;white-space:nowrap}
  .bpill.EXISTE{background:#0f2e1c;color:#4ade80}
  .bpill.PARCIAL{background:#332b12;color:#fbbf24}
  .bpill.FALTA{background:#23262f;color:#94a3b8}
  .bpill.SD{background:#1a1d26;color:#5b6472}
</style></head><body>
<header>
  <h1>CAPA · ${esc(meta.project)}</h1>
  <div class="sub">Tablero derivado de los manifests · DB regenerable · la verdad vive en el código</div>
  <div class="kpis">
    <div class="kpi"><b>${agg.n || 0}</b><span>CAPAs</span></div>
    <div class="kpi"><b>${agg.done || 0}/${agg.n || 0}</b><span>en done</span></div>
    <div class="kpi"><b>${agg.avgpct || 0}%</b><span>avance medio</span></div>
    <div class="kpi"><b>${visions.length}</b><span>visiones (ADR)</span></div>
    <div class="kpi"><b>${govPending}${govGates ? ' <span style="color:#fca5a5;font-size:14px">🔒' + govGates + '</span>' : ''}</b><span>firmas pendientes</span></div>
    <div class="kpi"><b class="bexist">${bMat}%</b><span>madurez (barrido)</span></div>
  </div>
  <div class="barrido">
    <div class="bh"><b>Barrido · implementación vs código real</b><span>${bMat}% madurez ponderada (existe + ½·parcial) · ${bTot} objetivos evaluados${bSD ? ` · ${bSD} s/d` : ''}</span></div>
    ${bbar(bE, bP, bF, '100%')}
    <div class="bleg"><span class="bexist">■ ${bE} existe</span><span class="bpart">■ ${bP} parcial</span><span class="bmiss">■ ${bF} falta</span></div>
  </div>
</header>
<main>${sections || '<section class="empty">sin CAPAs todavía</section>'}</main>
<footer>generado por capa-cli · git ${esc(meta.git || '?')} · ${esc(meta.when)} · fuente: ${esc(meta.dbPath)}</footer>
</body></html>`;
}

function runDashboard({ root, config }) {
  const { db, dbPath, outDir } = buildDb(root, config);
  const htmlPath = path.join(outDir, 'dashboard.html');
  const meta = { project: config.project || path.basename(root), git: gitShort(root), when: new Date().toISOString().slice(0, 16).replace('T', ' '), dbPath: path.relative(root, dbPath) };
  fs.writeFileSync(htmlPath, renderHtml(db, meta));
  db.close();
  const agg = ['vision', 'capa'];
  console.log(c.green('✓ ') + `DB derivada: ${path.relative(root, dbPath)}`);
  console.log(c.green('✓ ') + `dashboard: ${path.relative(root, htmlPath)}`);
  console.log(c.dim('  (regenerable: se reconstruye desde los manifests en cada corrida)'));
}

module.exports = { runDashboard };
