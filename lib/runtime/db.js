'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function paths(root) {
  // Opt-in override: point the DB anywhere (used by smoke tests to isolate each
  // run in a throwaway temp dir so they never touch the real repo .capa/capa.db
  // and never clobber each other). Schema lives next to the DB file.
  const override = process.env.CAPA_DB_PATH;
  if (override) {
    const db = path.resolve(override);
    const dir = path.dirname(db);
    return { dir, db, schema: path.join(dir, 'schema.sql') };
  }
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

  // El esquema EMPAQUETADO se aplica siempre, no sólo la primera vez.
  //
  // ensureSchema() copia el esquema del paquete únicamente si el repo todavía no tiene el suyo, y
  // después nunca lo vuelve a mirar. Medido 2026-09-16: los cuatro repos CAPA (BTW UBP,
  // btw-ubp-backend, ubp-app y los worktrees) ya tienen su copia congelada. Sin esto, una tabla
  // nueva del paquete llega SOLO a una instalación nueva: en los repos reales la función falla al
  // insertar, o peor, no hace nada y nadie se entera.
  //
  // Es seguro y aditivo: todo el esquema es CREATE ... IF NOT EXISTS, así que aplicar el del
  // paquete primero crea lo que falta y no pisa nada; la copia local se aplica después y sigue
  // mandando sobre lo que el repo haya ajustado.
  const packaged = packageSchemaPath();
  if (fs.existsSync(packaged) && path.resolve(packaged) !== path.resolve(p.schema)) {
    db.exec(fs.readFileSync(packaged, 'utf8'));
  }
  db.exec(fs.readFileSync(p.schema, 'utf8'));
  return db;
}

function now() {
  return new Date().toISOString();
}

module.exports = { open, now, paths, ensureSchema, packageSchemaPath };
