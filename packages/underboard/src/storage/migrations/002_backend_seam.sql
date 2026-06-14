-- Migration 002: Backend seam tables (feature 008)
-- sync_queue: writes pending Honcho push
-- tombstones: deleted entries (prevent re-resurrection)
-- sync_status column on memory_entries

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  enqueued_at TEXT NOT NULL DEFAULT (datetime('now')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'synced', 'failed')),
  UNIQUE (memory_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
  ON sync_queue (status, enqueued_at);

CREATE TABLE IF NOT EXISTS tombstones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tombstoned_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT NOT NULL DEFAULT 'manual',
  UNIQUE (memory_id)
);

CREATE INDEX IF NOT EXISTS idx_tombstones_hash
  ON tombstones (content_hash);

-- Add sync_status column to memory_entries (idempotent)
-- SQLite doesn't have IF NOT EXISTS for ADD COLUMN — check pragma first
-- The application layer handles the "column already exists" case gracefully.
