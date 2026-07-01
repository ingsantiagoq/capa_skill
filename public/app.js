'use strict';

const statusEl = document.getElementById('status');

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || (data.blockers ? data.blockers.join(', ') : 'CAPA API error'));
  return data;
}

function esc(value) {
  return String(value || '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]));
}

function itemHtml(item) {
  if (!item) return '<p class="muted">No hay PBI activo.</p>';
  return `<div class="item"><h3>#${item.id} ${esc(item.title)}</h3><p><span class="pill">${esc(item.status)}</span> <span class="pill">${esc(item.current_state)} → ${esc(item.next_state || '—')}</span> <span class="pill">P${esc(item.priority)}</span></p></div>`;
}

function rows(title, values, render) {
  if (!values || values.length === 0) return `<h3>${title}</h3><p class="muted">Sin registros.</p>`;
  return `<h3>${title}</h3>${values.map(render).join('')}`;
}

function formData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(data)) if (typeof data[key] === 'string') data[key] = data[key].trim();
  data.outside = form.querySelector('[name="outside"]')?.checked || false;
  return data;
}

async function postForm(formId, path) {
  const form = document.getElementById(formId);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(formData(form)) });
      form.reset();
      statusEl.textContent = 'Guardado.';
      await render();
    } catch (error) {
      statusEl.textContent = error.message;
    }
  });
}

async function render() {
  const dashboard = await api('/dashboard');
  document.getElementById('active').innerHTML = itemHtml(dashboard.active);
  document.getElementById('backlog-count').textContent = dashboard.backlog.length;
  document.getElementById('backlog').innerHTML = dashboard.backlog.map(itemHtml).join('') || '<p class="muted">Backlog vacío.</p>';
  document.getElementById('raw').textContent = JSON.stringify(dashboard, null, 2);

  if (dashboard.active) {
    const detail = await api(`/items/${dashboard.active.id}/progress`);
    document.getElementById('detail').innerHTML = [
      rows('Progreso', detail.progress, (r) => `<div class="item"><span class="pill">${esc(r.state)}</span> ${esc(r.status)} — ${esc(r.summary || '')}</div>`),
      rows('Evidencia', detail.evidence, (r) => `<div class="item"><span class="pill">${esc(r.classification)}</span> ${esc(r.claim)}</div>`),
      rows('Tests', detail.tests, (r) => `<div class="item"><span class="pill">${esc(r.status)}</span> ${esc(r.command || r.summary || r.test_type || '')}</div>`),
      rows('Reviews', detail.reviews, (r) => `<div class="item"><span class="pill">${esc(r.status)}</span> risk=${esc(r.risk_level || '—')} ${esc(r.diff_summary || '')}</div>`),
      rows('Findings', detail.findings, (r) => `<div class="item"><span class="pill">${r.belongs_to_current_item ? 'IN' : 'OUT'}</span> ${esc(r.title)} — ${esc(r.action)}</div>`),
    ].join('');
  } else {
    document.getElementById('detail').innerHTML = '<p class="muted">Sin PBI activo.</p>';
  }
}

document.getElementById('refresh').addEventListener('click', render);
document.getElementById('next').addEventListener('click', async () => {
  try { await api('/next', { method: 'POST' }); statusEl.textContent = 'Avanzado.'; await render(); }
  catch (error) { statusEl.textContent = error.message; }
});
document.getElementById('close-pbi').addEventListener('click', async () => {
  try { await api('/close/pbi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary: 'PBI cerrado desde dashboard' }) }); statusEl.textContent = 'PBI cerrado.'; await render(); }
  catch (error) { statusEl.textContent = error.message; }
});
document.getElementById('close-sprint').addEventListener('click', async () => {
  try { await api('/close/sprint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary: 'Sprint cerrado desde dashboard' }) }); statusEl.textContent = 'Sprint cerrado.'; await render(); }
  catch (error) { statusEl.textContent = error.message; }
});

postForm('evidence-form', '/evidence');
postForm('test-form', '/tests');
postForm('review-form', '/reviews');
postForm('finding-form', '/findings');
render().catch((error) => { document.getElementById('raw').textContent = error.stack || error.message; });
