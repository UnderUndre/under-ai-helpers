import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../fixtures/test-db.ts';
import type Database from 'better-sqlite3';
import { getProfile, setProfile, configureProfile } from '../../src/knowledge/profile-service.js';
import { upsertProject } from '../../src/storage/project-store.js';

describe('profile-service', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    upsertProject(db, { id: 'test-project', stableKey: 'test-project', displayName: 'Test Project', rootPath: '/tmp' });
  });

  afterEach(() => {
    closeTestDb(db);
  });

  it('getProfile returns not exists for missing', () => {
    const p = getProfile(db, 'missing');
    expect(p.exists).toBe(false);
    expect(p.project_id).toBe('missing');
  });

  it('setProfile creates and updates global profile', () => {
    const created = setProfile(db, 'test-project', 'beginner');
    expect(created.exists).toBe(true);
    expect(created.level_internal).toBeGreaterThanOrEqual(0);

    const updated = setProfile(db, 'test-project', 'expert');
    expect(updated.level).toBe('expert');
    expect(updated.is_domain_override).toBe(false);
  });

  it('setProfile with domain creates subdomain override', () => {
    setProfile(db, 'test-project', 'beginner');
    const res = setProfile(db, 'test-project', 'expert', 'frontend');
    expect(res.is_domain_override).toBe(true);
    expect(res.level).toBe('expert');

    const global = getProfile(db, 'test-project');
    expect(global.is_domain_override).toBe(false);
  });

  it('configureProfile can expand and collapse domains', () => {
    setProfile(db, 'test-project', 'intermediate');
    const before = getProfile(db, 'test-project');
    expect(before.exists).toBe(true);

    // expand domain
    const after = configureProfile(db, 'test-project', { expand_domain: 'frontend' });
    expect(after.is_domain_override).toBe(false);
    // now collapse
    const after2 = configureProfile(db, 'test-project', { collapse_domain: 'frontend' });
    expect(after2.is_domain_override).toBe(false);
  });

  it('configureProfile accepts and rejects proposed revisions', () => {
    setProfile(db, 'test-project', 'beginner');
    // propose a revision directly in DB
    const now = new Date().toISOString();
    db.prepare('UPDATE knowledge_profiles SET proposed_level_internal = ?, proposed_at = ? WHERE project_id = ?').run(0.9, now, 'test-project');

    const accepted = configureProfile(db, 'test-project', { accept_proposed_revision: true });
    expect(accepted.level).toBe('expert');

    // propose again
    db.prepare('UPDATE knowledge_profiles SET proposed_level_internal = ?, proposed_at = ? WHERE project_id = ?').run(0.1, now, 'test-project');
    const rejected = configureProfile(db, 'test-project', { reject_proposed_revision: true });
    expect(rejected.level).toBe('expert');
  });
});
