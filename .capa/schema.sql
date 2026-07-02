PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS capa_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'task',
  status TEXT NOT NULL DEFAULT 'new',
  priority INTEGER NOT NULL DEFAULT 3,
  current_state TEXT NOT NULL DEFAULT 'NEW',
  next_state TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS capa_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  acceptance TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  owner_model TEXT NOT NULL DEFAULT 'sonnet',
  position INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (item_id) REFERENCES capa_items(id)
);

CREATE TABLE IF NOT EXISTS capa_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  state TEXT NOT NULL,
  status TEXT NOT NULL,
  command TEXT,
  summary TEXT,
  started_at TEXT,
  finished_at TEXT,
  elapsed_seconds INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES capa_items(id)
);

CREATE TABLE IF NOT EXISTS capa_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  state TEXT,
  claim TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'UNKNOWN',
  source_type TEXT,
  file_path TEXT,
  symbol TEXT,
  command TEXT,
  result_summary TEXT,
  confidence REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES capa_items(id)
);

CREATE TABLE IF NOT EXISTS capa_scope (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  allowed_path TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES capa_items(id)
);

CREATE TABLE IF NOT EXISTS capa_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  belongs_to_current_item INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT 'record',
  created_pbi_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES capa_items(id)
);

CREATE TABLE IF NOT EXISTS capa_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  impact TEXT,
  evidence_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES capa_items(id),
  FOREIGN KEY (evidence_id) REFERENCES capa_evidence(id)
);

CREATE TABLE IF NOT EXISTS capa_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  test_type TEXT,
  command TEXT,
  status TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES capa_items(id)
);

CREATE TABLE IF NOT EXISTS capa_code_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  diff_summary TEXT,
  findings TEXT,
  risk_level TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES capa_items(id)
);

CREATE TABLE IF NOT EXISTS capa_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER,
  closure_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_summary TEXT,
  test_summary TEXT,
  risks TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES capa_items(id)
);

CREATE INDEX IF NOT EXISTS idx_capa_items_status ON capa_items(status);
CREATE INDEX IF NOT EXISTS idx_capa_items_active ON capa_items(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_capa_tasks_item ON capa_tasks(item_id, position);
CREATE INDEX IF NOT EXISTS idx_capa_progress_item ON capa_progress(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_capa_evidence_item ON capa_evidence(item_id, created_at);
