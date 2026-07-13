'use strict';

// Focus = the manifest objective the agent declared it is working on THIS
// session. It is the manifest-mode equivalent of the PBI-mode "active item":
// the thing that lets `guard --manifest` decide whether an edit is in-scope.
// Stored as working state under .capa/ (gitignored), never committed.

const fs = require('fs');
const path = require('path');
const { readJSON, writeFileSafe } = require('../util');

function focusPath(root) {
  return path.join(root, '.capa', 'focus.json');
}

function manifestPathOf(root, config, adr, objetivo) {
  const capaDir = path.resolve(root, (config && config.dossierDir) || 'capa');
  return path.join(capaDir, adr, objetivo, 'manifest.json');
}

function getFocus(root) {
  const p = focusPath(root);
  if (!fs.existsSync(p)) return null;
  try { return readJSON(p); } catch { return null; }
}

function setFocus({ root, config, adr, objetivo }) {
  if (!adr || !objetivo) return { ok: false, message: 'Faltan <ADR> y <objetivo>' };
  const manifest = manifestPathOf(root, config, adr, objetivo);
  if (!fs.existsSync(manifest)) {
    return { ok: false, message: `No existe el manifest: ${path.relative(root, manifest)}` };
  }
  writeFileSafe(focusPath(root), `${JSON.stringify({ adr, objetivo }, null, 2)}\n`);
  return { ok: true, adr, objetivo };
}

function clearFocus(root) {
  const p = focusPath(root);
  if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  return { ok: true };
}

module.exports = { getFocus, setFocus, clearFocus, focusPath, manifestPathOf };
