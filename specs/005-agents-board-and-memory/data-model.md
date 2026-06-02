# Data Model: Agent Task Board + Shared Memory Service

**Feature**: 005-agents-board-and-memory | **Date**: 2026-05-28

## Overview

Single SQLite database file with six tables, one FTS5 virtual table, and one sqlite-vec virtual table. All timestamps are ISO 8601 strings in strict UTC form `YYYY-MM-DDTHH:mm:ss.sssZ` — exactly 3 fractional-second digits and a literal `Z` suffix. This fixed width guarantees that lexicographic string comparison (used by the `if_match` compare-and-swap check on `updated_at`) matches chronological order across every client library. All IDs are UUIDv7 (time-sortable, globally unique).

## Schema

### Table: `projects`

```sql
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,       -- SHA-256 of canonicalized root path (first 16 chars)
  stable_key    TEXT UNIQUE,            -- SHA-256 hash of git origin remote URL (if git available)
  display_name  TEXT NOT NULL,          -- Last path component or "global"
  root_path     TEXT NOT NULL,          -- Absolute canonical path (empty string for global)
  first_seen    TEXT NOT NULL,          -- ISO 8601 UTC
  last_seen     TEXT NOT NULL           -- ISO 8601 UTC, updated on every tool call
);
```

**Notes**:
- `id` = first 16 hex chars of SHA-256(canonical root path). Short enough for display, collision-resistant for dev-machine scale.
- `stable_key` = SHA-256 of the git remote origin URL (if git is present), used for cross-machine export/import portability.
- Reserved row for global/uncategorized: `id = 'global'`, `stable_key = 'global'`, `root_path = ''`, `display_name = 'global'`.
- Created on first tool call from a new project root. Never deleted.

### Table: `tasks`

```sql
CREATE TABLE tasks (
  id              TEXT PRIMARY KEY,       -- UUIDv7
  project_id      TEXT NOT NULL,          -- FK → projects.id
  title           TEXT NOT NULL,
  description     TEXT,                   -- Nullable, free-form
  status          TEXT NOT NULL DEFAULT 'backlog'
                  CHECK (status IN ('backlog', 'in_progress', 'blocked', 'review', 'done')),
  assignee        TEXT,                   -- Agent name string, nullable
  dependency_ids  TEXT,                   -- JSON array of task IDs, nullable
  notes           TEXT,                   -- Free-form, nullable
  archived        INTEGER NOT NULL DEFAULT 0,  -- 0 or 1
  created_at      TEXT NOT NULL,          -- ISO 8601 UTC
  updated_at      TEXT NOT NULL,          -- ISO 8601 UTC
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

**Indexes**:
```sql
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_assignee       ON tasks(assignee) WHERE assignee IS NOT NULL;
CREATE INDEX idx_tasks_archived       ON tasks(archived, updated_at DESC);
CREATE INDEX idx_tasks_updated        ON tasks(updated_at DESC);
```

### Table: `memory_entries`

```sql
CREATE TABLE memory_entries (
  id               TEXT PRIMARY KEY,       -- UUIDv7
  project_id       TEXT NOT NULL,          -- FK → projects.id
  content          TEXT NOT NULL,
  tags             TEXT,                   -- JSON array of strings, nullable
  provenance       TEXT NOT NULL,          -- JSON array of {agent: string, ts: string}
  embedding        BLOB,                   -- Float32 array (384 dims for MiniLM), nullable
  embedding_status TEXT NOT NULL DEFAULT 'pending'
                   CHECK (embedding_status IN ('pending', 'ready', 'failed')),
  content_hash     TEXT NOT NULL,          -- SHA-256 of content (for dedup)
  created_at       TEXT NOT NULL,          -- ISO 8601 UTC (= first provenance timestamp)
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (project_id, content_hash)        -- DB-level dedup guard (see Dedup constraint note)
);
```

**Indexes**:
```sql
-- (project_id, content_hash) lookups are served by the UNIQUE constraint's implicit index
CREATE INDEX idx_memory_project_created ON memory_entries(project_id, created_at DESC);
CREATE INDEX idx_memory_embedding_status ON memory_entries(embedding_status) WHERE embedding_status = 'pending';
```

**Dedup constraint** (DB-enforced via `UNIQUE (project_id, content_hash)`, with provenance merge on conflict):
- Write as an upsert: `INSERT ... ON CONFLICT (project_id, content_hash) DO UPDATE SET provenance = <append {agent, ts}>`, returning the row ID.
- The UNIQUE constraint makes concurrent writes from multiple agents safe — two racing `INSERT`s can never create duplicate rows; the conflict branch performs the provenance merge instead.
- `content_hash` = SHA-256 of `content` column, computed at write time.

### Table: `activity_log`

```sql
CREATE TABLE activity_log (
  id           TEXT PRIMARY KEY,       -- UUIDv7
  task_id      TEXT NOT NULL,          -- FK → tasks.id
  agent_name   TEXT NOT NULL,
  action_type  TEXT NOT NULL,          -- e.g., 'tool_call', 'decision', 'file_read'
  detail       TEXT,                   -- Free-form description
  timestamp    TEXT NOT NULL,          -- ISO 8601 UTC
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

**Indexes**:
```sql
CREATE INDEX idx_activity_task_time ON activity_log(task_id, timestamp DESC);
```

### Table: `events`

```sql
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,             -- 'task_created', 'task_updated', 'memory_added', etc.
  payload    TEXT NOT NULL,             -- JSON
  timestamp  TEXT NOT NULL              -- ISO 8601 UTC
);
```

**Indexes**:
```sql
CREATE INDEX idx_events_type_time ON events(type, timestamp DESC);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
```

**Purpose**: Persistent event log for dashboard reconnect delta. Client sends `last_event_id` on SSE reconnect → server returns all events with `id > last_event_id`. Pruned periodically (keep last 10k events) automatically in T006 via event-store.ts.

## Virtual Tables

### FTS5: `memory_fts`

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  content,
  content='memory_entries',
  content_rowid='rowid',
  tokenize='unicode61'
);
```

**Triggers** to keep FTS in sync:
```sql
CREATE TRIGGER memory_fts_insert AFTER INSERT ON memory_entries BEGIN
  INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER memory_fts_delete AFTER DELETE ON memory_entries BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
```

### sqlite-vec: `memory_vectors`

```sql
CREATE VIRTUAL TABLE memory_vectors USING vec0(
  rowid INTEGER PRIMARY KEY,
  embedding float[384]
);
```

**Sync**: Application-level. The integer `rowid` of the virtual table `memory_vectors` is mapped directly to the implicit integer `rowid` of the `memory_entries` table. On embedding computation, INSERT or UPDATE into `memory_vectors` using the matching `rowid`. On memory entry deletion, DELETE from `memory_vectors` using `rowid`.

**Query**:
```sql
SELECT e.id, v.distance
FROM memory_vectors v
JOIN memory_entries e ON e.rowid = v.rowid
WHERE v.embedding MATCH ?
ORDER BY v.distance
LIMIT ?;
```

## Migration Strategy

Migrations are numbered SQL files applied sequentially. Applied migrations tracked in a `_migrations` table:

```sql
CREATE TABLE _migrations (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
```

Migration files live in `src/storage/migrations/`:
- `001_initial_schema.sql` — all tables, indexes, virtual tables, triggers
- Future migrations numbered sequentially

On startup, `database.ts` checks `_migrations` and applies any unapplied migrations in order within a transaction.

## Data Size Estimates

| Entity | Estimated Volume | Row Size (avg) | Total |
|--------|-----------------|----------------|-------|
| projects | ~20 | ~200B | ~4KB |
| tasks | ~500 | ~500B | ~250KB |
| memory_entries | ~10,000 | ~1KB (content) + 1.5KB (embedding) | ~25MB |
| activity_log | ~5,000 | ~300B | ~1.5MB |
| events | ~10,000 (pruned) | ~500B | ~5MB |
| **Total** | | | **~32MB** |

Well within SQLite's practical limits (single-file DB up to 281TB). No WAL mode concerns at this scale — but WAL mode enabled for concurrent read performance.

## Configuration Table (optional)

```sql
CREATE TABLE IF NOT EXISTS _config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Stores: `archive_mode`, `archive_after_days`, `stalled_mode`, `stalled_after_hours`. Read at startup, cached in memory. Mutations via CLI or dashboard update this table.
