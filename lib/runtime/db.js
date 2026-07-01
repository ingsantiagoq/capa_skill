'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function paths(root) {
  return {
    dir: path.join(root, '.capa'),
    db: path.join(root, '.capa', 'capa.db'),
    schema: path.join(root, '.capa', 'schema.sql'),
  };
}

function open(root) {
  const p = paths(root);
  if (!fs.existsSync(p.dir)) fs.mkdirSync(p.dir, { recursive: true });
  if (!fs.existsSync(p.schema)) throw new Error('Missing .capa/schema.sql');
  const db = new Database(p.db);
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(p.schema, 'utf8'));
  return db;
}

function now() {
  return new Date().toISOString();
}

module.exports = { open, now };
