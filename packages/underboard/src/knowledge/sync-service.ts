import Database from 'better-sqlite3';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export function deriveKey(passphrase: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(passphrase, salt, iterations, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function encryptData(data: string, passphrase: string, salt: Buffer, iterations: number) {
  const key = await deriveKey(passphrase, salt, iterations);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(data, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');
  
  // Zero key from memory
  key.fill(0);
  
  return {
    ciphertext,
    iv: iv.toString('base64'),
    tag: tag,
  };
}

export async function decryptData(ciphertext: string, ivBase64: string, tagBase64: string, passphrase: string, salt: Buffer, iterations: number): Promise<string> {
  const key = await deriveKey(passphrase, salt, iterations);
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  
  try {
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error('WRONG_PASSPHRASE');
  } finally {
    key.fill(0);
  }
}

export async function pushProfile(db: Database.Database, projectId: string, passphrase?: string, options?: { file_path?: string }) {
  if (!passphrase) throw new Error('PASSPHRASE_REQUIRED');
  
  const profileRow = db.prepare('SELECT * FROM knowledge_profiles WHERE project_id = ?').get(projectId) as any;
  if (!profileRow) throw new Error('PROFILE_NOT_FOUND');
  if (profileRow.sync_enabled === 0) throw new Error('SYNC_NOT_CONFIGURED');

  const now = new Date().toISOString();
  let saltBase64 = profileRow.sync_encryption_salt;
  let iterations = profileRow.sync_pbkdf2_iterations;

  if (!saltBase64) {
    const salt = crypto.randomBytes(16);
    saltBase64 = salt.toString('base64');
    iterations = 600000;
    db.prepare('UPDATE knowledge_profiles SET sync_encryption_salt = ?, sync_pbkdf2_iterations = ? WHERE project_id = ?').run(saltBase64, iterations, projectId);
  }

  // Get subdomains mapping
  const subRows = db.prepare('SELECT * FROM knowledge_sub_domains WHERE profile_id = ?').all(profileRow.id) as any[];
  const subDomainsMap: Record<string, number> = {};
  for (const s of subRows) {
    subDomainsMap[s.domain_name] = s.level_internal;
  }

  const syncData = {
    level_internal: profileRow.level_internal,
    display_scale: profileRow.display_scale,
    assessment_mode: profileRow.assessment_mode,
    level_source: profileRow.level_source,
    sub_domains: subDomainsMap,
    updated_at: profileRow.updated_at,
  };

  const saltBu = Buffer.from(saltBase64, 'base64');
  const enc = await encryptData(JSON.stringify(syncData), passphrase, saltBu, iterations);

  const envelope = {
    salt: saltBase64,
    iterations,
    iv: enc.iv,
    tag: enc.tag,
    ciphertext: enc.ciphertext,
  };

  const defaultPath = path.join(os.homedir(), '.underboard', 'sync', `${projectId}.enc`);
  const finalPath = options?.file_path || defaultPath;

  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write using temp file and fs.renameSync
  const tempPath = `${finalPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(envelope), 'utf8');
  fs.renameSync(tempPath, finalPath);

  const hash = crypto.createHash('sha256').update(enc.ciphertext).digest('hex');
  
  // Upsert sync metadata
  const meta = db.prepare('SELECT * FROM knowledge_sync_metadata WHERE profile_id = ?').get(profileRow.id) as any;
  if (!meta) {
    db.prepare('INSERT INTO knowledge_sync_metadata (profile_id, last_sync_at, last_export_hash, conflict_count) VALUES (?, ?, ?, 0)')
      .run(profileRow.id, now, hash);
  } else {
    db.prepare('UPDATE knowledge_sync_metadata SET last_sync_at = ?, last_export_hash = ?, conflict_count = 0 WHERE profile_id = ?')
      .run(now, hash, profileRow.id);
  }

  return {
    success: true,
    exported: true,
    file_path: finalPath,
    snapshot_at: now,
  };
}

export async function pullProfile(db: Database.Database, projectId: string, passphrase?: string, options?: { file_path?: string }) {
  if (!passphrase) throw new Error('PASSPHRASE_REQUIRED');

  let profileRow = db.prepare('SELECT * FROM knowledge_profiles WHERE project_id = ?').get(projectId) as any;
  if (profileRow && profileRow.sync_enabled === 0) throw new Error('SYNC_NOT_CONFIGURED');

  const defaultPath = path.join(os.homedir(), '.underboard', 'sync', `${projectId}.enc`);
  const finalPath = options?.file_path || defaultPath;

  if (!fs.existsSync(finalPath)) {
    throw new Error('TRANSPORT_UNAVAILABLE');
  }

  let envelope: any;
  try {
    const raw = fs.readFileSync(finalPath, 'utf8');
    envelope = JSON.parse(raw);
  } catch (err) {
    throw new Error('CORRUPT_SYNC_FILE');
  }

  if (!envelope.salt || !envelope.iterations || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new Error('CORRUPT_SYNC_FILE');
  }

  const saltBu = Buffer.from(envelope.salt, 'base64');
  let decryptedRaw: string;
  try {
    decryptedRaw = await decryptData(envelope.ciphertext, envelope.iv, envelope.tag, passphrase, saltBu, envelope.iterations);
  } catch (err: any) {
    if (err.message === 'WRONG_PASSPHRASE') throw err;
    throw new Error('CORRUPT_SYNC_FILE');
  }

  let remote: any;
  try {
    remote = JSON.parse(decryptedRaw);
  } catch (err) {
    throw new Error('CORRUPT_SYNC_FILE');
  }

  if (remote.level_internal === undefined || !remote.display_scale || !remote.assessment_mode) {
    throw new Error('CORRUPT_SYNC_FILE');
  }

  const now = new Date().toISOString();

  // Check conflicts
  if (profileRow) {
    const localUpdatedAt = new Date(profileRow.updated_at).getTime();
    const remoteUpdatedAt = new Date(remote.updated_at).getTime();
    
    // Values difference check
    const levelDiff = profileRow.level_internal !== remote.level_internal;
    
    if (localUpdatedAt > remoteUpdatedAt && levelDiff) {
      // Conflict! We has newer local edits
      db.prepare('INSERT OR REPLACE INTO knowledge_sync_metadata (profile_id, conflict_count, last_conflict_at, transport_config) VALUES (?, ?, ?, ?)')
        .run(profileRow.id, 1, now, JSON.stringify({ remoteVersion: remote, filePath: finalPath }));
        
      return {
        success: true,
        conflict: true,
        remote_version: {
          level_internal: remote.level_internal,
          display_scale: remote.display_scale,
          updated_at: remote.updated_at,
        },
        local_version: {
          level_internal: profileRow.level_internal,
          display_scale: profileRow.display_scale,
          updated_at: profileRow.updated_at,
        }
      };
    }
  }

  // Apply sync data
  const hash = crypto.createHash('sha256').update(envelope.ciphertext).digest('hex');
  
  if (!profileRow) {
    // Create new profile locally
    db.prepare(`INSERT INTO knowledge_profiles (project_id, assessment_mode, level_internal, level_source, display_scale, sync_enabled, sync_encryption_salt, sync_pbkdf2_iterations, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(projectId, remote.assessment_mode, remote.level_internal, remote.level_source, remote.display_scale, envelope.salt, envelope.iterations, now, remote.updated_at);
    profileRow = db.prepare('SELECT * FROM knowledge_profiles WHERE project_id = ?').get(projectId) as any;
  } else {
    // Update local profile
    db.prepare('UPDATE knowledge_profiles SET level_internal = ?, display_scale = ?, assessment_mode = ?, level_source = ?, sync_enabled = 1, sync_encryption_salt = ?, sync_pbkdf2_iterations = ?, updated_at = ? WHERE id = ?')
      .run(remote.level_internal, remote.display_scale, remote.assessment_mode, remote.level_source, envelope.salt, envelope.iterations, remote.updated_at, profileRow.id);
  }

  // Clear subdomains and recreate them
  db.prepare('DELETE FROM knowledge_sub_domains WHERE profile_id = ?').run(profileRow.id);
  if (remote.sub_domains) {
    const insertSub = db.prepare('INSERT INTO knowledge_sub_domains (profile_id, domain_name, level_internal, level_source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const key of Object.keys(remote.sub_domains)) {
      insertSub.run(profileRow.id, key, remote.sub_domains[key], remote.level_source, now, now);
    }
  }

  // Update sync metadata
  db.prepare('INSERT OR REPLACE INTO knowledge_sync_metadata (profile_id, last_sync_at, last_export_hash, conflict_count) VALUES (?, ?, ?, 0)')
    .run(profileRow.id, now, hash);

  return {
    success: true,
    imported: true,
    conflict: false,
  };
}

export function getSyncStatus(db: Database.Database, projectId: string) {
  const profileRow = db.prepare('SELECT * FROM knowledge_profiles WHERE project_id = ?').get(projectId) as any;
  if (!profileRow) {
    return {
      sync_enabled: false,
      transport: null,
      last_sync_at: null,
      conflict_count: 0,
      has_pending_conflict: false,
    };
  }

  const meta = db.prepare('SELECT * FROM knowledge_sync_metadata WHERE profile_id = ?').get(profileRow.id) as any;
  return {
    sync_enabled: profileRow.sync_enabled === 1,
    transport: profileRow.sync_transport,
    last_sync_at: meta ? meta.last_sync_at : null,
    conflict_count: meta ? meta.conflict_count : 0,
    has_pending_conflict: meta ? meta.conflict_count > 0 : false,
  };
}

export function resolveConflict(db: Database.Database, projectId: string, resolution: 'local' | 'remote' | 'keep-both') {
  const profileRow = db.prepare('SELECT * FROM knowledge_profiles WHERE project_id = ?').get(projectId) as any;
  if (!profileRow) throw new Error('PROFILE_NOT_FOUND');

  const meta = db.prepare('SELECT * FROM knowledge_sync_metadata WHERE profile_id = ?').get(profileRow.id) as any;
  if (!meta || meta.conflict_count === 0) {
    throw new Error('NO_CONFLICT');
  }

  const now = new Date().toISOString();
  let resultingLevel = profileRow.level_internal;

  if (resolution === 'local') {
    // Simply clear the conflict
    db.prepare('UPDATE knowledge_sync_metadata SET conflict_count = 0, last_conflict_at = ? WHERE profile_id = ?').run(now, profileRow.id);
  } else if (resolution === 'remote') {
    // Read remote version from config
    const conf = JSON.parse(meta.transport_config);
    const remote = conf.remoteVersion;

    db.prepare('UPDATE knowledge_profiles SET level_internal = ?, display_scale = ?, assessment_mode = ?, level_source = ?, updated_at = ? WHERE id = ?')
      .run(remote.level_internal, remote.display_scale, remote.assessment_mode, remote.level_source, remote.updated_at, profileRow.id);

    db.prepare('DELETE FROM knowledge_sub_domains WHERE profile_id = ?').run(profileRow.id);
    if (remote.sub_domains) {
      const insertSub = db.prepare('INSERT INTO knowledge_sub_domains (profile_id, domain_name, level_internal, level_source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const key of Object.keys(remote.sub_domains)) {
        insertSub.run(profileRow.id, key, remote.sub_domains[key], remote.level_source, now, now);
      }
    }

    db.prepare('UPDATE knowledge_sync_metadata SET conflict_count = 0, last_sync_at = ? WHERE profile_id = ?').run(now, profileRow.id);
    resultingLevel = remote.level_internal;
  }

  return {
    success: true,
    resolution,
    resulting_level: resultingLevel,
  };
}
