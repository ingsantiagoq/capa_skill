'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Give each smoke test its own throwaway CAPA DB via CAPA_DB_PATH so tests
// never touch the real repo .capa/capa.db and never clobber each other (safe
// under chained or parallel runs). Returns the temp DB path; the caller keeps
// using it for cleanup/assertions exactly as before.
function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capa-smoke-'));
  const dbPath = path.join(dir, 'capa.db');
  process.env.CAPA_DB_PATH = dbPath;
  return dbPath;
}

module.exports = { makeTempDb };
