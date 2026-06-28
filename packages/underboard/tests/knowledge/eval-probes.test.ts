import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../fixtures/test-db.js';
import type Database from 'better-sqlite3';
import { recordSignal, getProfile, configureProfile } from '../../src/knowledge/profile-service.js';

describe('Evaluation Probes Regression Suite (15 Scenarios)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  const setupProfile = (projectId: string, mode: string, initialValue: number, threshold = 3) => {
    db.prepare(`
      INSERT INTO knowledge_profiles (project_id, assessment_mode, level_internal, level_source, display_scale, retention_days, inference_threshold_n, sync_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 'self-declared', '3', 30, ?, 0, ?, ?)
    `).run(projectId, mode, initialValue, threshold, new Date().toISOString(), new Date().toISOString());
  };

  it('Scenario 1: Inferred - Beginner stays Beginner with low signals', () => {
    setupProfile('p1', 'inferred', 0.15, 3);
    recordSignal(db, 'p1', { signal_type: 'vocabulary_level', signal_value: 0.1 });
    recordSignal(db, 'p1', { signal_type: 'vocabulary_level', signal_value: 0.2 });
    const res = recordSignal(db, 'p1', { signal_type: 'vocabulary_level', signal_value: 0.15 });

    expect(res.triggered_evaluation).toBe(true);
    expect(res.new_level_internal).toBeLessThan(0.2);
    const prof = getProfile(db, 'p1');
    expect(prof.level).toBe('beginner');
  });

  it('Scenario 2: Inferred - Beginner shifts to Intermediate with high signals', () => {
    setupProfile('p2', 'inferred', 0.15, 3);
    recordSignal(db, 'p2', { signal_type: 'vocabulary_level', signal_value: 0.8 });
    recordSignal(db, 'p2', { signal_type: 'vocabulary_level', signal_value: 0.85 });
    const res = recordSignal(db, 'p2', { signal_type: 'concept_familiarity', signal_value: 0.75 });

    expect(res.triggered_evaluation).toBe(true);
    expect(res.new_level_internal).toBeGreaterThanOrEqual(0.7);
    const prof = getProfile(db, 'p2');
    expect(prof.level).toBe('expert'); // 0.8 is expert in 3-point scale
  });

  it('Scenario 3: Inferred - Expert shifts to Intermediate/Beginner with low signals', () => {
    setupProfile('p3', 'inferred', 0.9, 3);
    recordSignal(db, 'p3', { signal_type: 'vocabulary_level', signal_value: 0.25 });
    recordSignal(db, 'p3', { signal_type: 'vocabulary_level', signal_value: 0.2 });
    const res = recordSignal(db, 'p3', { signal_type: 'vocabulary_level', signal_value: 0.15 });

    expect(res.triggered_evaluation).toBe(true);
    expect(res.new_level_internal).toBeLessThan(0.3);
    const prof = getProfile(db, 'p3');
    expect(prof.level).toBe('beginner');
  });

  it('Scenario 4: Inferred - Intermediate stays Intermediate with mid-range signals', () => {
    setupProfile('p4', 'inferred', 0.5, 3);
    recordSignal(db, 'p4', { signal_type: 'vocabulary_level', signal_value: 0.5 });
    recordSignal(db, 'p4', { signal_type: 'vocabulary_level', signal_value: 0.55 });
    const res = recordSignal(db, 'p4', { signal_type: 'vocabulary_level', signal_value: 0.45 });

    expect(res.triggered_evaluation).toBe(true);
    expect(res.new_level_internal).toBeCloseTo(0.5);
    const prof = getProfile(db, 'p4');
    expect(prof.level).toBe('intermediate');
  });

  it('Scenario 5: Hybrid - Intermediate gets high signals and proposes Expert', () => {
    setupProfile('p5', 'hybrid', 0.5, 3);
    recordSignal(db, 'p5', { signal_type: 'vocabulary_level', signal_value: 0.9 });
    recordSignal(db, 'p5', { signal_type: 'vocabulary_level', signal_value: 0.95 });
    const res = recordSignal(db, 'p5', { signal_type: 'vocabulary_level', signal_value: 0.91 });

    expect(res.triggered_evaluation).toBe(true);
    expect(res.proposal_pending).toBe(true);

    const prof = getProfile(db, 'p5');
    expect(prof.level).toBe('intermediate'); // Undecided level stays intermediate

    const row = db.prepare('SELECT proposed_level_internal FROM knowledge_profiles WHERE project_id = ?').get('p5') as any;
    expect(row.proposed_level_internal).toBeGreaterThanOrEqual(0.9);
  });

  it('Scenario 6: Inferred - Expert stays Expert with expert signals', () => {
    setupProfile('p6', 'inferred', 0.85, 3);
    recordSignal(db, 'p6', { signal_type: 'vocabulary_level', signal_value: 0.9 });
    recordSignal(db, 'p6', { signal_type: 'vocabulary_level', signal_value: 0.95 });
    const res = recordSignal(db, 'p6', { signal_type: 'vocabulary_level', signal_value: 0.88 });

    expect(res.triggered_evaluation).toBe(true);
    const prof = getProfile(db, 'p6');
    expect(prof.level).toBe('expert');
  });

  it('Scenario 7: Hybrid - Intermediate gets low signals and proposes Beginner', () => {
    setupProfile('p7', 'hybrid', 0.55, 3);
    recordSignal(db, 'p7', { signal_type: 'vocabulary_level', signal_value: 0.1 });
    recordSignal(db, 'p7', { signal_type: 'vocabulary_level', signal_value: 0.15 });
    const res = recordSignal(db, 'p7', { signal_type: 'vocabulary_level', signal_value: 0.08 });

    expect(res.triggered_evaluation).toBe(true);
    const row = db.prepare('SELECT proposed_level_internal FROM knowledge_profiles WHERE project_id = ?').get('p7') as any;
    expect(row.proposed_level_internal).toBeLessThan(0.25);
  });

  it('Scenario 8: Inferred - shifts to absolute lowest bounds', () => {
    setupProfile('p8', 'inferred', 0.5, 3);
    recordSignal(db, 'p8', { signal_type: 'vocabulary_level', signal_value: 0.0 });
    recordSignal(db, 'p8', { signal_type: 'vocabulary_level', signal_value: 0.0 });
    const res = recordSignal(db, 'p8', { signal_type: 'vocabulary_level', signal_value: 0.0 });

    expect(res.new_level_internal).toBe(0.0);
  });

  it('Scenario 9: Inferred - shifts to absolute highest bounds', () => {
    setupProfile('p9', 'inferred', 0.5, 3);
    recordSignal(db, 'p9', { signal_type: 'vocabulary_level', signal_value: 1.0 });
    recordSignal(db, 'p9', { signal_type: 'vocabulary_level', signal_value: 1.0 });
    const res = recordSignal(db, 'p9', { signal_type: 'vocabulary_level', signal_value: 1.0 });

    expect(res.new_level_internal).toBe(1.0);
  });

  it('Scenario 10: Hybrid - Accept proposed revision updates level', () => {
    setupProfile('p10', 'hybrid', 0.5, 3);
    recordSignal(db, 'p10', { signal_type: 'vocabulary_level', signal_value: 0.85 });
    recordSignal(db, 'p10', { signal_type: 'vocabulary_level', signal_value: 0.9 });
    recordSignal(db, 'p10', { signal_type: 'vocabulary_level', signal_value: 0.95 });

    // Accept proposal
    const updated = configureProfile(db, 'p10', { accept_proposed_revision: true });
    expect(updated.level).toBe('expert');

    const row = db.prepare('SELECT proposed_level_internal FROM knowledge_profiles WHERE project_id = ?').get('p10') as any;
    expect(row.proposed_level_internal).toBeNull();
  });

  it('Scenario 11: Hybrid - Reject proposed revision discards proposal', () => {
    setupProfile('p11', 'hybrid', 0.55, 3);
    recordSignal(db, 'p11', { signal_type: 'vocabulary_level', signal_value: 0.9 });
    recordSignal(db, 'p11', { signal_type: 'vocabulary_level', signal_value: 0.92 });
    recordSignal(db, 'p11', { signal_type: 'vocabulary_level', signal_value: 0.95 });

    // Reject proposal
    const updated = configureProfile(db, 'p11', { reject_proposed_revision: true });
    expect(updated.level).toBe('intermediate');

    const row = db.prepare('SELECT proposed_level_internal FROM knowledge_profiles WHERE project_id = ?').get('p11') as any;
    expect(row.proposed_level_internal).toBeNull();
  });

  it('Scenario 12: vocabulary_level increases level', () => {
    setupProfile('p12', 'inferred', 0.5, 3);
    recordSignal(db, 'p12', { signal_type: 'vocabulary_level', signal_value: 0.8 });
    recordSignal(db, 'p12', { signal_type: 'vocabulary_level', signal_value: 0.85 });
    const res = recordSignal(db, 'p12', { signal_type: 'vocabulary_level', signal_value: 0.9 });

    expect(res.new_level_internal).toBeGreaterThan(0.8);
  });

  it('Scenario 13: concept_familiarity decreases level', () => {
    setupProfile('p13', 'inferred', 0.7, 3);
    recordSignal(db, 'p13', { signal_type: 'concept_familiarity', signal_value: 0.3 });
    recordSignal(db, 'p13', { signal_type: 'concept_familiarity', signal_value: 0.25 });
    const res = recordSignal(db, 'p13', { signal_type: 'concept_familiarity', signal_value: 0.2 });

    expect(res.new_level_internal).toBeLessThan(0.3);
  });

  it('Scenario 14: invalid signal throws error', () => {
    setupProfile('p14', 'inferred', 0.5);
    expect(() => recordSignal(db, 'p14', { signal_type: 'vocabulary_level', signal_value: NaN })).toThrow();
  });

  it('Scenario 15: domain-specific inference signal successfully processed', () => {
    setupProfile('p15', 'inferred', 0.25, 3);
    recordSignal(db, 'p15', { signal_type: 'vocabulary_level', signal_value: 0.9, domain: 'frontend' });
    recordSignal(db, 'p15', { signal_type: 'vocabulary_level', signal_value: 0.95, domain: 'frontend' });
    const res = recordSignal(db, 'p15', { signal_type: 'vocabulary_level', signal_value: 0.85, domain: 'frontend' });

    expect(res.success).toBe(true);
    expect(res.triggered_evaluation).toBe(true);
  });
});