-- Migration 003: Dialog spool tables (feature 007 US4)
-- quarantine: records waiting out their delay window before Honcho ingestion
-- outage: graduated records waiting for Honcho recovery
-- tombstones: content_hash blocks for re-ingestion prevention

CREATE TABLE IF NOT EXISTS dialog_quarantine_spool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uuid TEXT NOT NULL,
  normalized_file TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  graduates_at TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'graduated', 'purged')),
  purged_at TEXT,
  purge_reason TEXT,
  UNIQUE (content_hash, project_id)
);

CREATE INDEX IF NOT EXISTS idx_dialog_quarantine_graduates
  ON dialog_quarantine_spool (graduates_at, status);

CREATE TABLE IF NOT EXISTS dialog_outage_spool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uuid TEXT NOT NULL,
  normalized_file TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  graduated_at TEXT NOT NULL,
  project_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ingested', 'tombstoned')),
  honcho_session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_dialog_outage_pending
  ON dialog_outage_spool (status, next_retry_at);

CREATE TABLE IF NOT EXISTS dialog_tombstones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_hash TEXT NOT NULL UNIQUE,
  session_uuid TEXT NOT NULL,
  honcho_session_id TEXT,
  tombstoned_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_dialog_tombstones_hash
  ON dialog_tombstones (content_hash);
