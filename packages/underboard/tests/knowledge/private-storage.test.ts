import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../fixtures/test-db.js';
import type Database from 'better-sqlite3';
import { setProfile, getProfile } from '../../src/knowledge/profile-service.js';
import { exportProfile, forgetProfile } from '../../src/knowledge/profile-service.js';
import { upsertProject } from '../../src/storage/project-store.js';

describe('private-storage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    upsertProject(db, { id: 'test-project', stableKey: 'test-project', displayName: 'Test Project', rootPath: '/tmp' });
  });

  afterEach(() => {
    closeTestDb(db);
  });

  it('exportProfile anonymizes and records export', () => {
    setProfile(db, 'test-project', 'expert');
    setProfile(db, 'test-project', 'beginner', 'frontend');

    const res = exportProfile(db, 'test-project');
    expect(res.success).toBe(true);
    expect(res.artifact.version).toBe(1);
    expect(res.artifact.level).toBe('expert');
    expect(res.artifact.sub_domains).toBeDefined();
    expect(res.artifact.sub_domains!.frontend).toBe('beginner');
    expect(res.hash).toBeDefined();

    // Check row in DB
    const exports = db.prepare("SELECT * FROM knowledge_exports WHERE profile_id = ?").all(res.profile_id) as any[];
    expect(exports).toHaveLength(1);
    expect(exports[0].export_hash).toBe(res.hash);
  });

  it('exportProfile throws NO_PROFILE for missing', () => {
    expect(() => exportProfile(db, 'missing')).toThrow("NO_PROFILE");
  });

  it('forgetProfile CASCADE deletes all records and revokes exports', () => {
    setProfile(db, 'test-project', 'expert');
    const exp = exportProfile(db, 'test-project');
    
    // Check exports rows exist
    const countCheckPrior = db.prepare("SELECT COUNT(*) as count FROM knowledge_exports WHERE profile_id = ?").get(exp.profile_id) as any;
    expect(countCheckPrior.count).toBe(1);

    // Call forget without confirmation should fail
    expect(() => forgetProfile(db, 'test-project', false)).toThrow("CONFIRMATION_REQUIRED");

    // Call forget with confirmation
    const res = forgetProfile(db, 'test-project', true);
    expect(res.success).toBe(true);
    expect(res.exports_revoked).toBe(true);
    expect(res.deleted_rows).toBeGreaterThanOrEqual(2); // profile + export

    // Verify deleted
    const profile = getProfile(db, 'test-project');
    expect(profile.exists).toBe(false);

    // Verify cascade deleted exports
    const countCheckPost = db.prepare("SELECT COUNT(*) as count FROM knowledge_exports WHERE profile_id = ?").get(exp.profile_id) as any;
    expect(countCheckPost.count).toBe(0);
  });
});
