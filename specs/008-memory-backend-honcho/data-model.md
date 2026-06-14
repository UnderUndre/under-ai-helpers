# Data Model: Memory Backend — Honcho Integration

**Feature**: 008-memory-backend-honcho | **Date**: 2026-06-13

## Overview

Migration 002 adds two new tables (`sync_queue`, `tombstones`), retires embedding columns in `memory_entries` (not dropped — migration note only, to avoid breaking existing data), and removes sqlite-vec references. The local SQLite store remains the authoritative source for lexical data, sync queue state, and tombstones. Honcho (Postgres) is the authoritative source for semantic vectors and search ranking.

## New Tables

### Table: `sync_queue`

```sql
CREATE TABLE IF NOT EXISTS sync_queue (
  memory_id   TEXT PRIMARY KEY,       -- FK → memory_entries.id
  project_id  TEXT NOT NULL,          -- FK → projects.id
  content_hash TEXT NOT NULL,         -- SHA-256 of content (for idempotent dedup on Honcho)
  created_at  TEXT NOT NULL,          -- ISO 8601 UTC (when the write was accepted locally)
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,                   -- Last sync error message, nullable
  synced_at   TEXT                    -- ISO 8601 UTC, set when sync succeeds (then row eligible for pruning)
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_unsynced ON sync_queue(synced_at) WHERE synced_at IS NULL;
```

**Lifecycle**:
1. Row inserted when `memory_write` is accepted locally but Honcho push fails (or is deferred).
2. `reconciler.ts` picks up rows where `synced_at IS NULL`, ordered by `created_at ASC`.
3. On successful Honcho push: set `synced_at`.
4. Pruned periodically (delete rows where `synced_at IS NOT NULL AND synced_at < NOW - 24h`).

### Table: `tombstones`

```sql
CREATE TABLE IF NOT EXISTS tombstones (
  memory_id    TEXT PRIMARY KEY,       -- ID of the deleted memory entry
  project_id   TEXT NOT NULL,          -- FK → projects.id
  deleted_at   TEXT NOT NULL,          -- ISO 8601 UTC
  deleted_by   TEXT NOT NULL,          -- Agent name that requested deletion
  honcho_purged INTEGER NOT NULL DEFAULT 0  -- 1 if Honcho conclusion was hard-deleted
);

CREATE INDEX IF NOT EXISTS idx_tombstones_project ON tombstones(project_id);
```

**Lifecycle**:
1. `memory_delete` → insert tombstone, then attempt Honcho hard-delete if backend is Honcho.
2. All recall paths exclude entries whose `id` appears in `tombstones`.
3. `memory_get` returns `ENTRY_NOT_FOUND` for tombstoned entries.
4. Tombstones are permanent (no auto-purge) — export/import preserves them.

## Modified Tables

### `memory_entries` — Column Retirement

Migration 002 does NOT drop columns (SQLite ALTER TABLE limitations; also preserves existing data). Instead:

```sql
-- Migration 002: Retire embedding columns (application-level ignore)
-- embedding, embedding_status columns are no longer read or written by runtime code.
-- A future migration may drop them after a grace period.

-- Add sync_status column for backend-aware write tracking
ALTER TABLE memory_entries ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced'
  CHECK (sync_status IN ('pending', 'synced', 'failed'));
```

**Note**: SQLite `ALTER TABLE ADD COLUMN` works. The `embedding` and `embedding_status` columns remain in the table but are ignored by all runtime code. New writes set `embedding = NULL`, `embedding_status = 'failed'` (or leave default). The `sync_status` column tracks the Honcho sync lifecycle (analogous to `embedding_status` from 005).

### `_config` — New Entries

```sql
INSERT OR IGNORE INTO _config (key, value) VALUES ('memory_backend', 'honcho');
INSERT OR IGNORE INTO _config (key, value) VALUES ('honcho_endpoint', 'http://127.0.0.1:8083');
INSERT OR IGNORE INTO _config (key, value) VALUES ('honcho_token_env', 'HONCHO_API_KEY');
INSERT OR IGNORE INTO _config (key, value) VALUES ('honcho_pinned_version', '3.0.9');
INSERT OR IGNORE INTO _config (key, value) VALUES ('sync_interval_ms', '10000');
INSERT OR IGNORE INTO _config (key, value) VALUES ('deep_recall_enabled', 'false');
```

**Config loading**: Read at startup, cached. `honcho_token_env` names an environment variable containing the actual token (never stored in the DB or config file as plaintext — though for single-user localhost, the env var value IS the secret).

## Removed Schema Elements

- `memory_vectors` virtual table (sqlite-vec) — was never created in migration 001, only a comment. No DDL change needed.
- `embedding` column in `memory_entries` — retired, not dropped.
- `embedding_status` column — retired, not dropped.
- `_config` entries `lexical_weight` and `semantic_weight` — no longer relevant (fusion is backend-internal). Left in place (harmless).

## Data Size Impact

| Entity | Added Volume | Notes |
|--------|-------------|-------|
| sync_queue | Transient (pruned) | Peak during outage: same as memory_entries written during outage |
| tombstones | ~0.1% of memory_entries | Deletion is rare |
| memory_entries.sync_status | 1 column, ~10 bytes/row | Negligible |
| **Net change** | ~0 | Sync queue is temporary; tombstones are tiny |

## Migration File

`src/storage/migrations/002_backend_seam.sql` — all DDL above, idempotent (`IF NOT EXISTS` guards).

## Export/Import Compatibility

Export format (005 FR-031/FR-032) extended:
- Include `sync_status` field per memory entry (default `"synced"` on import).
- Include `tombstones` array.
- On import: skip entries present in imported `tombstones`; set `sync_status = "pending"` for all imported entries if backend is Honcho (reconciliation will push them).
