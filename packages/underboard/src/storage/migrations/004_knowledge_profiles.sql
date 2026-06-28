-- Migration: 004_knowledge_profiles.sql
-- Creates tables for knowledge adaptation feature per specs/010-user-level-adaptation/data-model.md

PRAGMA foreign_keys = ON;

-- 1. knowledge_profiles
CREATE TABLE IF NOT EXISTS knowledge_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL UNIQUE,
  assessment_mode TEXT NOT NULL CHECK (assessment_mode IN ('self-declared','inferred','hybrid','quiz')),
  level_internal REAL NOT NULL CHECK (level_internal >= 0.0 AND level_internal <= 1.0),
  level_source TEXT NOT NULL CHECK (level_source IN ('self-declared','inferred','quiz-derived')),
  display_scale TEXT NOT NULL DEFAULT '3' CHECK (display_scale IN ('3','5','continuous')),
  retention_days INTEGER DEFAULT 30,
  inference_threshold_n INTEGER NOT NULL DEFAULT 10,
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  sync_transport TEXT,
  sync_encryption_salt TEXT,
  sync_pbkdf2_iterations INTEGER,
  proposed_level_internal REAL CHECK (proposed_level_internal IS NULL OR (proposed_level_internal >= 0.0 AND proposed_level_internal <= 1.0)),
  proposed_level_source TEXT,
  proposed_at TEXT,
  last_inference_at TEXT,
  signals_since_last_eval INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((sync_enabled = 0 AND sync_encryption_salt IS NULL AND sync_pbkdf2_iterations IS NULL AND sync_transport IS NULL) OR (sync_enabled = 1 AND sync_encryption_salt IS NOT NULL AND sync_pbkdf2_iterations IS NOT NULL))
);

-- 2. knowledge_sub_domains
CREATE TABLE IF NOT EXISTS knowledge_sub_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  domain_name TEXT NOT NULL,
  level_internal REAL NOT NULL CHECK (level_internal >= 0.0 AND level_internal <= 1.0),
  level_source TEXT NOT NULL CHECK (level_source IN ('self-declared','inferred','quiz-derived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES knowledge_profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, domain_name)
);

-- 3. knowledge_signals
CREATE TABLE IF NOT EXISTS knowledge_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value REAL NOT NULL CHECK (signal_value >= 0.0 AND signal_value <= 1.0),
  signal_metadata TEXT,
  captured_at TEXT NOT NULL,
  expires_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES knowledge_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_signals_retention ON knowledge_signals(profile_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_signals_inference ON knowledge_signals(profile_id, captured_at);

-- 4. knowledge_sync_metadata
CREATE TABLE IF NOT EXISTS knowledge_sync_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL UNIQUE,
  last_sync_at TEXT,
  last_export_hash TEXT,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  last_conflict_at TEXT,
  transport_config TEXT,
  FOREIGN KEY (profile_id) REFERENCES knowledge_profiles(id) ON DELETE CASCADE
);

-- 5. knowledge_exports
CREATE TABLE IF NOT EXISTS knowledge_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  export_hash TEXT NOT NULL,
  level_internal REAL NOT NULL CHECK (level_internal >= 0.0 AND level_internal <= 1.0),
  display_scale TEXT NOT NULL CHECK (display_scale IN ('3','5','continuous')),
  exported_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES knowledge_profiles(id) ON DELETE CASCADE
);
