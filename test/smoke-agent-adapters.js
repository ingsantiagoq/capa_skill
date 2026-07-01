'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const agents = read('AGENTS.md');
const claude = read('CLAUDE.md');
const codex = read('docs/agents/codex.md');
const claudeNotes = read('docs/agents/claude.md');

for (const content of [agents, claude, codex, claudeNotes]) {
  assert.match(content, /node bin\/capa\.js estado/);
  assert.match(content, /node bin\/capa\.js siguiente/);
  assert.match(content, /guard/);
  assert.match(content, /finding/);
}

assert.match(agents, /CAPA is the source of truth/);
assert.match(claude, /CAPA DB\/runtime is the source of truth/);
assert.match(codex, /CAPA runtime is authoritative/);
assert.match(claudeNotes, /Token discipline/);

console.log('Agent adapters smoke test OK');
