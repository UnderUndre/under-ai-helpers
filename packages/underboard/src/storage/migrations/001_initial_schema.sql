CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  stable_key    TEXT UNIQUE,
  display_name  TEXT NOT NULL,
  root_path     TEXT NOT NULL,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL
);

INSERT OR IGNORE INTO projects (id, stable_key, display_name, root_path, first_seen, last_seen)
VALUES ('global', 'global', 'global', '', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'backlog'
                  CHECK (status IN ('backlog', 'in_progress', 'blocked', 'review', 'done')),
  assignee        TEXT,
  dependency_ids  TEXT,
  notes           TEXT,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee       ON tasks(assignee) WHERE assignee IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_archived       ON tasks(archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_updated        ON tasks(updated_at DESC);

CREATE TABLE IF NOT EXISTS memory_entries (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  content          TEXT NOT NULL,
  tags             TEXT,
  provenance       TEXT NOT NULL,
  embedding        BLOB,
  embedding_status TEXT NOT NULL DEFAULT 'pending'
                   CHECK (embedding_status IN ('pending', 'ready', 'failed')),
  content_hash     TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (project_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_memory_project_created ON memory_entries(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embedding_status ON memory_entries(embedding_status) WHERE embedding_status = 'pending';

CREATE TABLE IF NOT EXISTS activity_log (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL,
  agent_name   TEXT NOT NULL,
  action_type  TEXT NOT NULL,
  detail       TEXT,
  timestamp    TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_activity_task_time ON activity_log(task_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  timestamp  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);

CREATE TABLE IF NOT EXISTS _config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO _config (key, value) VALUES ('archive_mode', 'manual');
INSERT OR IGNORE INTO _config (key, value) VALUES ('archive_after_days', '30');
INSERT OR IGNORE INTO _config (key, value) VALUES ('stalled_mode', 'off');
INSERT OR IGNORE INTO _config (key, value) VALUES ('stalled_after_hours', '24');
INSERT OR IGNORE INTO _config (key, value) VALUES ('lexical_weight', '0.4');
INSERT OR IGNORE INTO _config (key, value) VALUES ('semantic_weight', '0.6');

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content,
  content='memory_entries',
  content_rowid='rowid',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_entries BEGIN
  INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_entries BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

-- memory_vectors (sqlite-vec) is loaded at runtime via db.loadExtension()
-- See: src/embedding/embedding-service.ts and src/tools/memory/write.ts
