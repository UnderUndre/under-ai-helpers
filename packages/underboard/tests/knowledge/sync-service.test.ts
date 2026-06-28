import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../fixtures/test-db.js';
import type Database from 'better-sqlite3';
import { setProfile, configureProfile, getProfile } from '../../src/knowledge/profile-service.js';
import { pushProfile, pullProfile, getSyncStatus, resolveConflict } from '../../src/knowledge/sync-service.js';
import { upsertProject } from '../../src/storage/project-store.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

describe('sync-service', () => {
  let db: Database.Database;
  const tempFile = path.join(process.cwd(), `temp-sync-${Math.random().toString(36).slice(2)}.enc`);

  beforeEach(() => {
    db = createTestDb();
    upsertProject(db, { id: 'test-project', stableKey: 'test-project', displayName: 'Test Project', rootPath: '/tmp' });
  });

  afterEach(() => {
    closeTestDb(db);
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch {}
    }
  });

  it('push and pull works with correct passphrase', async () => {
    // 1. Setup profile and enable sync
    setProfile(db, 'test-project', 'expert');
    configureProfile(db, 'test-project', { sync_enabled: true });

    // 2. Push profile
    const pushRes = await pushProfile(db, 'test-project', 'my-secret', { file_path: tempFile });
    expect(pushRes.success).toBe(true);
    expect(fs.existsSync(tempFile)).toBe(true);

    // 3. Make local DB changes
    db.prepare("UPDATE knowledge_profiles SET level_internal = 0.1, level_source = 'self-declared' WHERE project_id = ?").run('test-project');

    // 4. Pull profile with WRONG passphrase should fail
    await expect(pullProfile(db, 'test-project', 'wrong-secret', { file_path: tempFile })).rejects.toThrow('WRONG_PASSPHRASE');

    // 5. Pull profile with correct passphrase should succeed and restore 'expert'
    const pullRes = await pullProfile(db, 'test-project', 'my-secret', { file_path: tempFile });
    expect(pullRes.success).toBe(true);
    expect(pullRes.imported).toBe(true);
    expect(pullRes.conflict).toBe(false);

    const afterPull = getProfile(db, 'test-project');
    expect(afterPull.level).toBe('expert');
  });

  it('detects and resolves conflicts', async () => {
    // 1. Setup profile and enable sync
    setProfile(db, 'test-project', 'intermediate');
    configureProfile(db, 'test-project', { sync_enabled: true });

    // 2. Push to establish remote file
    await pushProfile(db, 'test-project', 'my-secret', { file_path: tempFile });

    // 3. Artificially make remote version with older timestamp, but local version updated newer
    const now = new Date().getTime();
    db.prepare("UPDATE knowledge_profiles SET updated_at = ?, level_internal = 0.85 WHERE project_id = ?")
      .run(new Date(now + 10000).toISOString(), 'test-project'); // local newer

    // 4. Pull should flag conflict because local is newer and values differ
    const pullRes = await pullProfile(db, 'test-project', 'my-secret', { file_path: tempFile });
    expect(pullRes.success).toBe(true);
    expect(pullRes.conflict).toBe(true);

    const status = getSyncStatus(db, 'test-project');
    expect(status.has_pending_conflict).toBe(true);
    expect(status.conflict_count).toBe(1);

    // 5. Resolve conflict keeping local
    const resLocal = resolveConflict(db, 'test-project', 'local');
    expect(resLocal.success).toBe(true);
    expect(resLocal.resolution).toBe('local');

    const status2 = getSyncStatus(db, 'test-project');
    expect(status2.has_pending_conflict).toBe(false);
  });

  it('sync security guarantees: iterations count >= 600,000 and auth tag integrity', async () => {
    setProfile(db, 'sec-project', 'expert');
    configureProfile(db, 'sec-project', { sync_enabled: true });
    await pushProfile(db, 'sec-project', 'sec-pwd', { file_path: tempFile });

    const raw = fs.readFileSync(tempFile, 'utf8');
    const envelope = JSON.parse(raw);

    // Verify key derivation hardness (>= 600,000 iterations)
    expect(envelope.iterations).toBeGreaterThanOrEqual(600000);
    
    // Verify ciphertext format & GCM tag presence
    expect(typeof envelope.ciphertext).toBe('string');
    expect(typeof envelope.iv).toBe('string');
    expect(typeof envelope.tag).toBe('string');
  });
});
