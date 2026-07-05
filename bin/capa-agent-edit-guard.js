#!/usr/bin/env node
'use strict';

const guard = require('../lib/runtime/guard');

function parseArgs(argv) {
  const files = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file' || arg === '-f') {
      const next = argv[i + 1];
      if (next) {
        files.push(next);
        i += 1;
      }
    } else if (arg.startsWith('--file=')) {
      files.push(arg.slice('--file='.length));
    } else if (!arg.startsWith('--')) {
      files.push(arg);
    }
  }
  return files;
}

function main() {
  const files = parseArgs(process.argv.slice(2));
  if (!files.length) {
    console.log('CAPA BLOCK');
    console.log('Motivo: missing file path for agent edit guard');
    console.log('Uso: node bin/capa-agent-edit-guard.js --file <path>');
    process.exit(2);
  }

  let blocked = false;
  for (const file of files) {
    const result = guard.evaluate({ root: process.cwd(), action: 'edit', file });
    guard.print(result);
    if (!result.allowed) blocked = true;
  }

  if (blocked) process.exit(2);
}

main();
