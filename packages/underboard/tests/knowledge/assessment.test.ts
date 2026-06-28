import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../fixtures/test-db.js';
import type Database from 'better-sqlite3';
import { recordSignal, getSignalsSummary } from '../../src/knowledge/profile-service.js';

describe('knowledge signals and inference', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  it('recordSignal validates and stores signals and triggers inference', () => {
    // create profile with low threshold for quick trigger
    db.prepare(`INSERT INTO knowledge_profiles (project_id, assessment_mode, level_internal, level_source, display_scale, retention_days, inference_threshold_n, sync_enabled, created_at, updated_at) VALUES (?, 'inferred', ?, 'inferred', '3', 30, 2, 0, ?, ?)`)
      .run('p1', 0.2, new Date().toISOString(), new Date().toISOString());

    const r1 = recordSignal(db, 'p1', { signal_type: 'vocabulary_level', signal_value: 0.6 });
    expect(r1.success).toBe(true);
    expect(r1.triggered_evaluation).toBe(false);

    const r2 = recordSignal(db, 'p1', { signal_type: 'vocabulary_level', signal_value: 0.8 });
    expect(r2.success).toBe(true);
    expect(r2.triggered_evaluation).toBe(true);
    expect(typeof r2.new_level_internal).toBe('number');

    const summary = getSignalsSummary(db, 'p1');
    expect(summary.available).toBe(true);
    expect(summary.total).toBeGreaterThanOrEqual(1);
  });

  it('retention prunes expired signals', () => {
    db.prepare(`INSERT INTO knowledge_profiles (project_id, assessment_mode, level_internal, level_source, display_scale, retention_days, inference_threshold_n, sync_enabled, created_at, updated_at) VALUES (?, 'inferred', ?, 'inferred', '3', 0, 10, 0, ?, ?)`)
      .run('p2', 0.5, new Date().toISOString(), new Date().toISOString());

    const r = recordSignal(db, 'p2', { signal_type: 'vocabulary_level', signal_value: 0.4 });
    expect(r.success).toBe(true);
    // retention_days = 0 => expires immediately, pruned
    const s = getSignalsSummary(db, 'p2');
    expect(s.total).toBe(0);
  });

  it('invalid inputs throw', () => {
    db.prepare(`INSERT INTO knowledge_profiles (project_id, assessment_mode, level_internal, level_source, display_scale, retention_days, inference_threshold_n, sync_enabled, created_at, updated_at) VALUES (?, 'inferred', ?, 'inferred', '3', 30, 2, 0, ?, ?)`)
      .run('p3', 0.5, new Date().toISOString(), new Date().toISOString());

    expect(() => recordSignal(db, 'p3', { signal_type: 'unknown', signal_value: 0.5 })).toThrow();
    expect(() => recordSignal(db, 'p3', { signal_type: 'vocabulary_level', signal_value: -1 })).toThrow();
    expect(() => recordSignal(db, 'p3', { signal_type: 'vocabulary_level', signal_value: 0.5, metadata: { big: 'x'.repeat(100) } })).toThrow();
  });
});
