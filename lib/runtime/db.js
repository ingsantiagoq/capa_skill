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

function packageSchemaPath() {
  return path.resolve(__dirname, '..', '..', '.capa', 'schema.sql');
}

function ensureSchema(root) {
  const p = paths(root);
  if (!fs.existsSync(p.dir)) fs.mkdirSync(p.dir, { recursive: true });
  if (fs.existsSync(p.schema)) return p.schema;

  const source = packageSchemaPath();
  if (!fs.existsSync(source)) throw new Error('Missing packaged CAPA schema');
  fs.copyFileSync(source, p.schema);
  return p.schema;
}

function open(root) {
  const p = paths(root);
  ensureSchema(root);
  const db = new Database(p.db);
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(p.schema, 'utf8'));
  return db;
}

function now() {
  return new Date().toISOString();
}

module.exports = { open, now, paths, ensureSchema, packageSchemaPath };
