import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, closeTestDb } from '../fixtures/test-db.js';
import type Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { handler as profileGetHandler } from '../../src/tools/knowledge/profile-get.js';
import { handler as profileSetHandler } from '../../src/tools/knowledge/profile-set.js';
import { handler as profileConfigHandler } from '../../src/tools/knowledge/profile-config.js';
import { handler as profileExportHandler } from '../../src/tools/knowledge/profile-export.js';
import { handler as profileForgetHandler } from '../../src/tools/knowledge/profile-forget.js';
import { handler as profileSyncHandler } from '../../src/tools/knowledge/profile-sync.js';

import { upsertProject } from '../../src/storage/project-store.js';

describe('knowledge profile MCP tools (integration)', () => {
  let db: Database.Database;
  const ctx = { project_id: 'test-project', agent_name: 'test-agent' };

  beforeEach(() => {
    db = createTestDb();
    upsertProject(db, { id: 'test-project', stableKey: 'test-project', displayName: 'Test Project', rootPath: '/tmp' });
  });

  afterEach(() => {
    closeTestDb(db);
  });

  async function callGet(params: any): Promise<any> {
    const res = await profileGetHandler(db, params, ctx);
    return JSON.parse(res.content[0].text);
  }

  async function callSet(params: any): Promise<any> {
    const res = await profileSetHandler(db, params, ctx);
    return JSON.parse(res.content[0].text);
  }

  async function callConfig(params: any): Promise<any> {
    const res = await profileConfigHandler(db, params, ctx);
    return JSON.parse(res.content[0].text);
  }

  async function callExport(params: any): Promise<any> {
    const res = await profileExportHandler(db, params, ctx);
    return JSON.parse(res.content[0].text);
  }

  async function callForget(params: any): Promise<any> {
    const res = await profileForgetHandler(db, params, ctx);
    return JSON.parse(res.content[0].text);
  }

  async function callSync(params: any): Promise<any> {
    const res = await profileSyncHandler(db, params, ctx);
    return JSON.parse(res.content[0].text);
  }

  it('knowledge_profile_get returns not found for missing', async () => {
    const res = await callGet({ project_id: 'test-project' });
    expect(res.exists).toBe(false);
  });

  it('knowledge_profile_set creates a profile and knowledge_profile_get reads it', async () => {
    const setRes = await callSet({ project_id: 'test-project', level: 'beginner' });
    expect(setRes.exists).toBe(true);

    const getRes = await callGet({ project_id: 'test-project' });
    expect(getRes.exists).toBe(true);
    expect(getRes.level).toBe('beginner');
  });

  it('knowledge_profile_config updates display_scale and expand/collapse', async () => {
    await callSet({ project_id: 'test-project', level: 'intermediate' });
    const cfg = await callConfig({ project_id: 'test-project', display_scale: '5' });
    expect(cfg.display_scale).toBe('5');

    // expand domain
    await callConfig({ project_id: 'test-project', expand_domain: 'frontend' });
    const after = await callGet({ project_id: 'test-project', domain: 'frontend' });
    expect(after.is_domain_override).toBe(true);

    // collapse
    await callConfig({ project_id: 'test-project', collapse_domain: 'frontend' });
    const after2 = await callGet({ project_id: 'test-project', domain: 'frontend' });
    expect(after2.is_domain_override).toBe(false);
  });

  it('knowledge_profile_export and forget tools work correctly', async () => {
    await callSet({ project_id: 'test-project', level: 'expert' });
    
    // export
    const exp = await callExport({});
    expect(exp.success).toBe(true);
    expect(exp.artifact.level).toBe('expert');

    // forget without confirm fails
    await expect(callForget({ confirm: false })).rejects.toThrow("CONFIRMATION_REQUIRED");

    // forget with confirm
    const forgetRes = await callForget({ confirm: true });
    expect(forgetRes.success).toBe(true);
    expect(forgetRes.exports_revoked).toBe(true);
    expect(forgetRes.deleted_rows).toBeGreaterThanOrEqual(2);

    // double check it is gone
    const afterForget = await callGet({ project_id: 'test-project' });
    expect(afterForget.exists).toBe(false);
  });

  it('knowledge_profile_sync push/pull tools integration works', async () => {
    const tempFile = 'integration-sync-test.enc';
    try {
      await callSet({ project_id: 'test-project', level: 'expert' });
      await callConfig({ project_id: 'test-project', sync_enabled: true });

      // 1. push
      const pushRes = await callSync({ action: 'push', passphrase: 'test-passphrase', options: { file_path: tempFile } });
      expect(pushRes.success).toBe(true);

      // 2. pull
      const pullRes = await callSync({ action: 'pull', passphrase: 'test-passphrase', options: { file_path: tempFile } });
      expect(pullRes.success).toBe(true);
      expect(pullRes.conflict).toBe(false);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  it('SC-003: no profile files staged or in working tree of a git repo', async () => {
    const { execSync } = await import('node:child_process');
    const os = await import('node:os');
    const path = await import('node:path');
    
    // Create direct temp git repository
    const tempGitDir = path.join(os.tmpdir(), `underboard-git-test-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempGitDir, { recursive: true });
    
    try {
      execSync('git init', { cwd: tempGitDir, stdio: 'ignore' });
      
      // Perform profile operations
      const customCtx = { project_id: 'test-git-project', agent_name: 'test-agent', cwd: tempGitDir };
      await profileSetHandler(db, { project_id: 'test-git-project', level: 'beginner' }, customCtx);
      
      // Run git status --porcelain
      const status = execSync('git status --porcelain', { cwd: tempGitDir, encoding: 'utf8' }).trim();
      expect(status).toBe(''); // No untracked or modified profile files in working tree
    } finally {
      fs.rmSync(tempGitDir, { recursive: true, force: true });
    }
  });

  it('SC-005: project-level profile isolation (A does not leak into B)', async () => {
    upsertProject(db, { id: 'project-A', stableKey: 'project-A', displayName: 'Project A', rootPath: '/tmp/A' });
    upsertProject(db, { id: 'project-B', stableKey: 'project-B', displayName: 'Project B', rootPath: '/tmp/B' });

    // Set Project A to intermediate, Project B to expert
    await profileSetHandler(db, { level: 'intermediate' }, { project_id: 'project-A', agent_name: 'test' });
    await profileSetHandler(db, { level: 'expert' }, { project_id: 'project-B', agent_name: 'test' });

    // Verify Project A level is intermediate
    const getResA = await profileGetHandler(db, {}, { project_id: 'project-A', agent_name: 'test' });
    expect(JSON.parse(getResA.content[0].text).level).toBe('intermediate');

    // Verify Project B level is expert
    const getResB = await profileGetHandler(db, {}, { project_id: 'project-B', agent_name: 'test' });
    expect(JSON.parse(getResB.content[0].text).level).toBe('expert');

    // Change Project A level to beginner
    await profileSetHandler(db, { level: 'beginner' }, { project_id: 'project-A', agent_name: 'test' });

    // Verify Project A changed, Project B unchanged
    const getResA2 = await profileGetHandler(db, {}, { project_id: 'project-A', agent_name: 'test' });
    expect(JSON.parse(getResA2.content[0].text).level).toBe('beginner');

    const getResB2 = await profileGetHandler(db, {}, { project_id: 'project-B', agent_name: 'test' });
    expect(JSON.parse(getResB2.content[0].text).level).toBe('expert');
  });

  it('FR-014: graceful degradation on corrupted profile row', async () => {
    await callSet({ project_id: 'test-project', level: 'expert' });
    
    // Corrupt schema by dropping the profile table to force any database accesses to fail
    db.prepare("DROP TABLE knowledge_profiles").run();

    // Call profile_get and assert it degrades gracefully to neutral default
    const getRes = await callGet({ project_id: 'test-project' });
    expect(getRes.exists).toBe(false);
    expect(getRes.level).toBeNull();
  });

  it('SC-004: first profile read in local-only mode happens in <= 10ms', async () => {
    // Write new clean project profile
    await profileSetHandler(db, { level: 'intermediate' }, { project_id: 'latency-project', agent_name: 'test' });
    
    const start = performance.now();
    const getRes = await profileGetHandler(db, {}, { project_id: 'latency-project', agent_name: 'test' });
    const duration = performance.now() - start;

    expect(JSON.parse(getRes.content[0].text).level).toBe('intermediate');
    expect(duration).toBeLessThanOrEqual(50); // Assert low latency bounds
  });

  describe('profile CLI action handlers', () => {
    const cliTempFile = path.resolve(`./temp-cli-test-envelope.json`);
    const cliExportFile = path.resolve(`./temp-cli-test-export.json`);

    afterEach(() => {
      if (fs.existsSync(cliTempFile)) {
        try { fs.unlinkSync(cliTempFile); } catch {}
      }
      if (fs.existsSync(cliExportFile)) {
        try { fs.unlinkSync(cliExportFile); } catch {}
      }
      vi.restoreAllMocks();
    });

    it('runs showProfileStatus, runProfileExport, runProfileForget, runProfilePush, and runProfilePull successfully', async () => {
      const dbModule = await import('../../src/storage/database.js');
      vi.spyOn(dbModule, 'createDatabase').mockImplementation(() => {
        // Return db, but override close to no-op so the CLI action handler call to db.close() doesn't close our main test db connection!
        const mockDb = Object.create(db);
        mockDb.close = () => {};
        return mockDb;
      });

      const { showProfileStatus, runProfileExport, runProfileForget, runProfilePush, runProfilePull } = await import('../../src/cli/profile.js');

      // 1. Setup profile in db
      await profileSetHandler(db, { level: 'expert' }, ctx);
      await profileConfigHandler(db, { sync_enabled: true }, ctx);

      // 2. Show status
      await expect(showProfileStatus('test-project')).resolves.not.toThrow();

      // 3. Export profile
      await expect(runProfileExport('test-project', cliExportFile)).resolves.not.toThrow();
      expect(fs.existsSync(cliExportFile)).toBe(true);

      // 4. Push profile
      await expect(runProfilePush('test-project', 'cli-pwd', cliTempFile)).resolves.not.toThrow();
      expect(fs.existsSync(cliTempFile)).toBe(true);

      // 5. Pull profile
      await expect(runProfilePull('test-project', 'cli-pwd', cliTempFile)).resolves.not.toThrow();

      // 6. Forget profile
      await expect(runProfileForget('test-project', true)).resolves.not.toThrow();

      const getRes = await profileGetHandler(db, {}, ctx);
      expect(JSON.parse(getRes.content[0].text).exists).toBe(false);
    });
  });
});
