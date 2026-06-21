'use strict';
const fs = require('fs');
const path = require('path');

// graphify is a hard dependency: CAPA anchors every claim to a graph node so it
// cannot drift from the code, and threads a CAPA's dependencies along its route.

function resolveGraphPath(root, configGraph) {
  const candidates = [
    configGraph && path.resolve(root, configGraph),
    path.join(root, 'graphify-out', 'graph.json'),
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function loadGraph(graphPath) {
  const raw = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const nodes = raw.nodes || (raw.graph && raw.graph.nodes) || [];
  const links = raw.links || (raw.graph && raw.graph.links) || [];
  const byId = new Map();
  for (const n of nodes) byId.set(n.id, n);
  return {
    path: graphPath,
    builtAtCommit: raw.built_at_commit || null,
    nodeCount: nodes.length,
    linkCount: links.length,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    nodes: () => nodes,
    links: () => links,
  };
}

module.exports = { resolveGraphPath, loadGraph };
