#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

function findRepoRoot(payload) {
  return payload.cwd || payload.project_dir || process.cwd();
}

function getToolName(payload) {
  return payload.tool_name || payload.tool || payload.name || '';
}

function getToolInput(payload) {
  return payload.tool_input || payload.input || payload.arguments || {};
}

function extractFilePath(payload) {
  const input = getToolInput(payload);
  return input.file_path || input.path || input.notebook_path || input.filename || null;
}

function mapAction(toolName) {
  switch (toolName) {
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'edit';
    case 'Write':
      return 'write';
    default:
      return null;
  }
}

function isAutoFix(payload) {
  const input = getToolInput(payload);
  const text = [
    payload.prompt,
    payload.reason,
    input.prompt,
    input.description,
    input.old_string,
    input.new_string,
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes('auto-fix') || text.includes('autofix') || text.includes('fix automatically');
}

(async function main() {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    console.error(`CAPA BLOCK: invalid hook payload JSON: ${error.message}`);
    process.exit(2);
  }

  const toolName = getToolName(payload);
  const action = mapAction(toolName);

  if (!action) {
    process.exit(0);
  }

  const root = findRepoRoot(payload);
  const file = extractFilePath(payload);
  const args = ['bin/capa.js', 'guard', action];
  if (file) args.push('--file', file);
  if (isAutoFix(payload)) args.push('--auto-fix');

  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  process.exit(result.status || 0);
})();
