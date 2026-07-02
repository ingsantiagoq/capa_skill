'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { install, uninstall, platformConfig } = require('../lib/install');

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
  assert.match(content, /node bin\/capa-agent-edit-guard\.js --file <path>/);
  assert.match(content, /If .*blocks?, stop|If blocked, do not continue editing|If CAPA blocks, stop/);
}

assert.match(agents, /CAPA is the source of truth/);
assert.match(claude, /CAPA DB\/runtime is the source of truth/);
assert.match(codex, /CAPA runtime is authoritative/);
assert.match(claudeNotes, /Token discipline/);
assert.match(codex, /across LLM-operated workflows/);
assert.match(claudeNotes, /across LLM surfaces/);
assert.match(claude, /broader CAPA contract/);
assert.match(agents, /Mandatory edit guard/);
assert.match(claude, /mandatory edit guard/);
assert.match(codex, /Mandatory edit guard/);
assert.match(claudeNotes, /Mandatory edit guard/);
assert.match(agents, /Product Owner behavior/);
assert.match(claude, /Product Owner behavior/);
assert.match(agents, /map user intent to CAPA options/);
assert.match(claude, /Translate natural language into the available CAPA options/);
assert.match(agents, /Should this be implemented now, or added to backlog\?/);
assert.match(claude, /implemented now or added to backlog/);

assert.equal(platformConfig({ platform: 'claude' }).contractFile, 'CLAUDE.md');
assert.equal(platformConfig({ platform: 'codex' }).contractFile, 'AGENTS.md');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-install-'));
install({ root: tempRoot, platform: 'codex' });
assert.ok(fs.existsSync(path.join(tempRoot, '.codex', 'skills', 'capa', 'SKILL.md')));
assert.ok(fs.existsSync(path.join(tempRoot, 'AGENTS.md')));
const installedAgents = fs.readFileSync(path.join(tempRoot, 'AGENTS.md'), 'utf8');
assert.match(installedAgents, /BEGIN CAPA/);
uninstall({ root: tempRoot, platform: 'codex' });
assert.ok(!fs.existsSync(path.join(tempRoot, '.codex', 'skills', 'capa')));
assert.doesNotMatch(fs.readFileSync(path.join(tempRoot, 'AGENTS.md'), 'utf8'), /BEGIN CAPA/);

console.log('Agent adapters smoke test OK');
