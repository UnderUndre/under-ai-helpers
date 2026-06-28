import Database from "better-sqlite3";
import * as crypto from "node:crypto";
import { internalToDisplay, displayToInternal, DisplayScale } from "./level-utils.js";

const CANONICAL_DOMAINS = new Set(["frontend","backend","database","devops","security","docs"]);

export interface KnowledgeProfile {
  exists: boolean;
  project_id: string;
  assessment_mode?: string;
  level_internal?: number;
  level?: string | number | null;
  level_source?: string;
  display_scale?: DisplayScale;
  is_domain_override?: boolean;
}

function stmtGetProfile(db: Database.Database) {
  return db.prepare("SELECT * FROM knowledge_profiles WHERE project_id = ?");
}

function stmtInsertProfile(db: Database.Database) {
  return db.prepare(`INSERT INTO knowledge_profiles (project_id, assessment_mode, level_internal, level_source, display_scale, retention_days, inference_threshold_n, sync_enabled, created_at, updated_at)
    VALUES (?, 'self-declared', ?, 'self-declared', '3', 30, 10, 0, ?, ?)
    `);
}

function stmtUpdateProfileLevel(db: Database.Database) {
  return db.prepare(`UPDATE knowledge_profiles SET level_internal = ?, level_source = ?, updated_at = ? WHERE project_id = ?`);
}

function stmtGetSubDomain(db: Database.Database) {
  return db.prepare("SELECT * FROM knowledge_sub_domains WHERE profile_id = ? AND domain_name = ?");
}

function stmtInsertSubDomain(db: Database.Database) {
  return db.prepare(`INSERT INTO knowledge_sub_domains (profile_id, domain_name, level_internal, level_source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
}

function stmtUpdateSubDomainLevel(db: Database.Database) {
  return db.prepare(`UPDATE knowledge_sub_domains SET level_internal = ?, level_source = ?, updated_at = ? WHERE profile_id = ? AND domain_name = ?`);
}

function stmtDeleteSubDomain(db: Database.Database) {
  return db.prepare(`DELETE FROM knowledge_sub_domains WHERE profile_id = ? AND domain_name = ?`);
}

export function getProfile(db: Database.Database, projectId: string, domain?: string): KnowledgeProfile {
  try {
    const row = stmtGetProfile(db).get(projectId) as any;
    if (!row) return { exists: false, project_id: projectId, level: null };

    let level_internal = row.level_internal as number;
    let is_domain_override = false;
    if (domain) {
      const domainName = String(domain).toLowerCase();
      if (!CANONICAL_DOMAINS.has(domainName)) {
        throw new Error(`UNKNOWN_DOMAIN: ${domain}`);
      }
      // find sub-domain
      const sub = stmtGetSubDomain(db).get(row.id, domainName) as any;
      if (sub) {
        level_internal = sub.level_internal;
        is_domain_override = true;
      }
    }

    const display_scale = row.display_scale as DisplayScale;
    const level = internalToDisplay(level_internal, display_scale);

    return {
      exists: true,
      project_id: projectId,
      assessment_mode: row.assessment_mode,
      level_internal,
      level,
      level_source: row.level_source,
      display_scale,
      is_domain_override,
    };
  } catch (err) {
    return { exists: false, project_id: projectId, level: null };
  }
}

export function setProfile(db: Database.Database, projectId: string, levelLabel: string | number, domain?: string): KnowledgeProfile {
  // ensure profile exists
  let row = stmtGetProfile(db).get(projectId) as any;
  const now = new Date().toISOString();
  if (!row) {
    const internal = displayToInternal(levelLabel, '3');
    if (internal === null) throw new Error('INVALID_LEVEL');
    stmtInsertProfile(db).run(projectId, internal, now, now);
    row = stmtGetProfile(db).get(projectId) as any;
  }

  // determine scale for write
  const display_scale = row.display_scale as DisplayScale;
  const internal = displayToInternal(levelLabel, display_scale);
  if (internal === null) throw new Error('INVALID_LEVEL');

  if (domain) {
    const domainName = String(domain).toLowerCase();
    if (!CANONICAL_DOMAINS.has(domainName)) throw new Error(`UNKNOWN_DOMAIN: ${domain}`);
    const profileRow = stmtGetProfile(db).get(projectId) as any;
    const sub = stmtGetSubDomain(db).get(profileRow.id, domainName) as any;
    if (sub) {
      stmtUpdateSubDomainLevel(db).run(internal, 'self-declared', now, profileRow.id, domainName);
    } else {
      stmtInsertSubDomain(db).run(profileRow.id, domainName, internal, 'self-declared', now, now);
    }
    return {
      exists: true,
      project_id: projectId,
      assessment_mode: profileRow.assessment_mode,
      level_internal: internal,
      level: internalToDisplay(internal, display_scale),
      level_source: 'self-declared',
      display_scale,
      is_domain_override: true,
    };
  }

  // update global
  stmtUpdateProfileLevel(db).run(internal, 'self-declared', now, projectId);
  const updated = stmtGetProfile(db).get(projectId) as any;
  return {
    exists: true,
    project_id: projectId,
    assessment_mode: updated.assessment_mode,
    level_internal: updated.level_internal,
    level: internalToDisplay(updated.level_internal, updated.display_scale),
    level_source: updated.level_source,
    display_scale: updated.display_scale,
    is_domain_override: false,
  };
}

export function configureProfile(db: Database.Database, projectId: string, opts: Record<string, any>) {
  const row = stmtGetProfile(db).get(projectId) as any;
  if (!row) throw new Error('PROFILE_NOT_FOUND');
  const now = new Date().toISOString();

  const updates: string[] = [];
  const params: any[] = [];

  if (opts.display_scale) {
    if (!['3','5','continuous'].includes(opts.display_scale)) throw new Error('INVALID_DISPLAY_SCALE');
    updates.push('display_scale = ?');
    params.push(opts.display_scale);
  }

  if (opts.sync_enabled !== undefined) {
    updates.push('sync_enabled = ?');
    params.push(opts.sync_enabled ? 1 : 0);
    if (opts.sync_enabled) {
      // If salt doesn't exist, we must generate it here to satisfy database CHECK constraint
      if (!row.sync_encryption_salt) {
        const salt = crypto.randomBytes(16).toString('base64');
        const iterations = 600000;
        updates.push('sync_encryption_salt = ?');
        params.push(salt);
        updates.push('sync_pbkdf2_iterations = ?');
        params.push(iterations);
      }
    } else {
      // Clear salt and iterations when disabling sync
      updates.push('sync_encryption_salt = NULL');
      updates.push('sync_pbkdf2_iterations = NULL');
      updates.push('sync_transport = NULL');
    }
  }

  if (opts.sync_transport !== undefined) {
    updates.push('sync_transport = ?');
    params.push(opts.sync_transport);
  }

  if (opts.retention_days !== undefined) {
    updates.push('retention_days = ?');
    params.push(opts.retention_days);
  }

  if (opts.inference_threshold_n !== undefined) {
    updates.push('inference_threshold_n = ?');
    params.push(opts.inference_threshold_n);
  }

  if (opts.collapse_domain) {
    const domainName = String(opts.collapse_domain).toLowerCase();
    if (!CANONICAL_DOMAINS.has(domainName)) throw new Error(`UNKNOWN_DOMAIN: ${opts.collapse_domain}`);
    const prof = stmtGetProfile(db).get(projectId) as any;
    stmtDeleteSubDomain(db).run(prof.id, domainName);
  }

  if (opts.expand_domain) {
    const domainName = String(opts.expand_domain).toLowerCase();
    if (!CANONICAL_DOMAINS.has(domainName)) throw new Error(`UNKNOWN_DOMAIN: ${opts.expand_domain}`);
    const prof = stmtGetProfile(db).get(projectId) as any;
    // insert with current global level
    const globalLevel = prof.level_internal as number;
    const sub = stmtGetSubDomain(db).get(prof.id, domainName) as any;
    if (sub) {
      // already exists, no-op
    } else {
      stmtInsertSubDomain(db).run(prof.id, domainName, globalLevel, prof.level_source, now, now);
    }
  }

  if (opts.accept_proposed_revision) {
    // accept proposed_level_internal into level_internal
    if (row.proposed_level_internal === null || row.proposed_level_internal === undefined) throw new Error('NO_PROPOSAL');
    const accepted = row.proposed_level_internal as number;
    db.prepare('UPDATE knowledge_profiles SET level_internal = ?, level_source = ?, proposed_level_internal = NULL, proposed_at = NULL, updated_at = ? WHERE project_id = ?').run(accepted, 'inferred', now, projectId);
  }

  if (opts.reject_proposed_revision) {
    if (row.proposed_level_internal === null || row.proposed_level_internal === undefined) throw new Error('NO_PROPOSAL');
    db.prepare('UPDATE knowledge_profiles SET proposed_level_internal = NULL, proposed_at = NULL, updated_at = ? WHERE project_id = ?').run(now, projectId);
  }

  if (updates.length > 0) {
    const sql = `UPDATE knowledge_profiles SET ${updates.join(', ')}, updated_at = ? WHERE project_id = ?`;
    params.push(now, projectId);
    db.prepare(sql).run(...params);
  }

  return getProfile(db, projectId);
}

export function exportProfile(db: Database.Database, projectId: string, domains?: string[]) {
  const profile = getProfile(db, projectId);
  if (!profile.exists) {
    throw new Error("NO_PROFILE");
  }

  const now = new Date().toISOString();
  
  // Extract sub-domains mapping
  let subDomainsRecords: Record<string, string | number> | undefined = undefined;
  if (profile.display_scale) {
    const profileRow = db.prepare("SELECT * FROM knowledge_profiles WHERE project_id = ?").get(projectId) as any;
    const subRows = db.prepare("SELECT * FROM knowledge_sub_domains WHERE profile_id = ?").all(profileRow.id) as any[];
    
    if (subRows.length > 0) {
      subDomainsRecords = {};
      for (const sub of subRows) {
        // If domains is provided, filter by it
        if (domains && !domains.includes(sub.domain_name)) continue;
        subDomainsRecords[sub.domain_name] = internalToDisplay(sub.level_internal, profile.display_scale as any) as any;
      }
      if (domains && Object.keys(subDomainsRecords).length === 0) {
        throw new Error("EMPTY_DOMAINS");
      }
    }
  }

  const dataToHash = `${projectId}:${profile.level_internal}:${profile.display_scale}:${now}`;
  const hash = crypto.createHash("sha256").update(dataToHash).digest("hex");

  // Record export
  const profileRow = db.prepare("SELECT * FROM knowledge_profiles WHERE project_id = ?").get(projectId) as any;
  db.prepare(`INSERT INTO knowledge_exports (profile_id, export_hash, level_internal, display_scale, exported_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(profileRow.id, hash, profile.level_internal, profile.display_scale, now);

  const artifact = {
    version: 1,
    level: profile.level!,
    display_scale: profile.display_scale!,
    ...(subDomainsRecords ? { sub_domains: subDomainsRecords } : {}),
    exported_at: now,
    hash,
  };

  return {
    success: true,
    profile_id: profileRow.id,
    artifact,
    hash,
  };
}

export function forgetProfile(db: Database.Database, projectId: string, confirm: boolean) {
  if (!confirm) {
    throw new Error("CONFIRMATION_REQUIRED");
  }

  const profileRow = db.prepare("SELECT * FROM knowledge_profiles WHERE project_id = ?").get(projectId) as any;
  if (!profileRow) {
    return { success: false, deleted_rows: 0, exports_revoked: false };
  }

  const profileId = profileRow.id;
  const now = new Date().toISOString();

  // Compute total deleted rows before doing it
  const countSubDomains = db.prepare("SELECT COUNT(*) as count FROM knowledge_sub_domains WHERE profile_id = ?").get(profileId) as any;
  const countSignals = db.prepare("SELECT COUNT(*) as count FROM knowledge_signals WHERE profile_id = ?").get(profileId) as any;
  const countSync = db.prepare("SELECT COUNT(*) as count FROM knowledge_sync_metadata WHERE profile_id = ?").get(profileId) as any;
  const countExports = db.prepare("SELECT COUNT(*) as count FROM knowledge_exports WHERE profile_id = ?").get(profileId) as any;

  const exports_revoked = countExports.count > 0;
  const deleted_rows = 1 + countSubDomains.count + countSignals.count + countSync.count + countExports.count;

  // Revoke exports
  if (exports_revoked) {
    db.prepare("UPDATE knowledge_exports SET revoked_at = ? WHERE profile_id = ?").run(now, profileId);
  }

  // Delete profile (causes CASCADE delete)
  db.prepare("DELETE FROM knowledge_profiles WHERE id = ?").run(profileId);

  return {
    success: true,
    deleted_rows,
    exports_revoked,
  };
}

// ----------------------
// Signal recording & retrieval
// ----------------------

const ALLOWED_SIGNAL_TYPES = new Set([
  "vocabulary_level",
  "question_depth",
  "concept_familiarity",
  "correction_frequency",
  "code_complexity",
]);

function pruneExpiredSignals(db: Database.Database) {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM knowledge_signals WHERE expires_at IS NOT NULL AND expires_at <= ?").run(now);
}

export function recordSignal(db: Database.Database, projectId: string, payload: { signal_type: string; signal_value: number; domain?: string; metadata?: Record<string, any> }) {
  // Prune expired signals first
  pruneExpiredSignals(db);

  const { signal_type, signal_value, domain, metadata } = payload;

  if (!ALLOWED_SIGNAL_TYPES.has(signal_type)) throw new Error("INVALID_SIGNAL_TYPE");
  if (typeof signal_value !== 'number' || Number.isNaN(signal_value) || signal_value < 0.0 || signal_value > 1.0) throw new Error("INVALID_SIGNAL_VALUE");

  if (domain !== undefined && domain !== null) {
    const d = String(domain).toLowerCase();
    if (!CANONICAL_DOMAINS.has(d)) throw new Error(`UNKNOWN_DOMAIN: ${domain}`);
  }

  if (metadata) {
    for (const k of Object.keys(metadata)) {
      const v = metadata[k];
      if (typeof v === 'string' && v.length > 64) throw new Error('INVALID_METADATA');
    }
  }

  // Ensure profile exists; if not, create an inferred profile by default
  let profileRow = db.prepare("SELECT * FROM knowledge_profiles WHERE project_id = ?").get(projectId) as any;
  const now = new Date().toISOString();
  if (!profileRow) {
    // create default inferred profile
    db.prepare(`INSERT INTO knowledge_profiles (project_id, assessment_mode, level_internal, level_source, display_scale, retention_days, inference_threshold_n, sync_enabled, created_at, updated_at)
      VALUES (?, 'inferred', ?, 'inferred', '3', 30, 10, 0, ?, ?)
    `).run(projectId, 0.5, now, now);
    profileRow = db.prepare("SELECT * FROM knowledge_profiles WHERE project_id = ?").get(projectId) as any;
  }

  if (profileRow.assessment_mode === 'self-declared' || profileRow.assessment_mode === 'quiz') {
    throw new Error('MODE_DOES_NOT_CAPTURE_SIGNALS');
  }

  // Insert signal
  const retention = profileRow.retention_days as number | null;
  let expiresAt: string | null = null;
  if (retention !== null && retention !== undefined) {
    if (retention === 0) {
      expiresAt = now;
    } else {
      const exp = new Date(Date.now() + retention * 24 * 60 * 60 * 1000);
      expiresAt = exp.toISOString();
    }
  }

  const metaObj = {
    ...(metadata || {}),
    ...(domain ? { domain: domain.toLowerCase() } : {})
  };
  const signalMetadata = Object.keys(metaObj).length > 0 ? JSON.stringify(metaObj) : null;
  const info = db.prepare(`INSERT INTO knowledge_signals (profile_id, signal_type, signal_value, signal_metadata, captured_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(profileRow.id, signal_type, signal_value, signalMetadata, now, expiresAt);

  // Increment signals_since_last_eval
  db.prepare('UPDATE knowledge_profiles SET signals_since_last_eval = signals_since_last_eval + 1 WHERE id = ?').run(profileRow.id);

  // Check if we should trigger inference
  const refreshed = db.prepare('SELECT * FROM knowledge_profiles WHERE id = ?').get(profileRow.id) as any;
  const triggered = refreshed.signals_since_last_eval >= (refreshed.inference_threshold_n || 10);
  let triggered_evaluation = false;
  let new_level_internal: number | null = null;

  if (triggered) {
    // compute average of active signals
    const avgRow = db.prepare(`SELECT AVG(signal_value) as avg FROM knowledge_signals WHERE profile_id = ? AND (expires_at IS NULL OR expires_at > ?)`).get(profileRow.id, now) as any;
    const avg = avgRow ? avgRow.avg as number : null;
    if (avg !== null && !Number.isNaN(avg)) {
      triggered_evaluation = true;
      if (refreshed.assessment_mode === 'inferred') {
        db.prepare('UPDATE knowledge_profiles SET level_internal = ?, level_source = ?, signals_since_last_eval = 0, last_inference_at = ?, updated_at = ? WHERE id = ?').run(avg, 'inferred', now, now, profileRow.id);
        new_level_internal = avg;
      } else if (refreshed.assessment_mode === 'hybrid') {
        db.prepare('UPDATE knowledge_profiles SET proposed_level_internal = ?, proposed_level_source = ?, proposed_at = ?, signals_since_last_eval = 0, last_inference_at = ?, updated_at = ? WHERE id = ?').run(avg, 'inferred', now, now, now, profileRow.id);
      }
    } else {
      // nothing to average, just reset counter
      db.prepare('UPDATE knowledge_profiles SET signals_since_last_eval = 0, last_inference_at = ?, updated_at = ? WHERE id = ?').run(now, now, profileRow.id);
    }
  }

  // Prune expired signals again (e.g. if retention in p2 is 0, this prunes the newly inserted signal immediately)
  pruneExpiredSignals(db);

  // Count retained signals
  const countRow = db.prepare('SELECT COUNT(*) as count FROM knowledge_signals WHERE profile_id = ? AND (expires_at IS NULL OR expires_at > ?)').get(profileRow.id, now) as any;
  const retained_signal_count = countRow ? countRow.count as number : 0;

  return {
    success: true,
    signal_id: info.lastInsertRowid,
    triggered_evaluation,
    new_level_internal,
    proposal_pending: refreshed.assessment_mode === 'hybrid',
    retained_signal_count,
  };
}

export function getSignalsSummary(db: Database.Database, projectId: string, limit = 20, domain?: string) {
  pruneExpiredSignals(db);
  const profileRow = db.prepare('SELECT * FROM knowledge_profiles WHERE project_id = ?').get(projectId) as any;
  if (!profileRow) throw new Error('NO_PROFILE');
  if (profileRow.assessment_mode === 'self-declared' || profileRow.assessment_mode === 'quiz') throw new Error('SIGNALS_UNAVAILABLE');

  const now = new Date().toISOString();
  const whereClauses: string[] = ['profile_id = ?'];
  const params: any[] = [profileRow.id];
  if (domain) {
    const d = String(domain).toLowerCase();
    if (!CANONICAL_DOMAINS.has(d)) throw new Error(`UNKNOWN_DOMAIN: ${domain}`);
    whereClauses.push('signal_metadata LIKE ?');
    params.push(`%"domain":"${d}"%`);
  }
  whereClauses.push('(expires_at IS NULL OR expires_at > ?)');
  params.push(now);

  const whereSql = whereClauses.join(' AND ');

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM knowledge_signals WHERE ${whereSql}`).get(...params) as any;
  const typesRows = db.prepare(`SELECT signal_type, COUNT(*) as count FROM knowledge_signals WHERE ${whereSql} GROUP BY signal_type`).all(...params) as any[];
  const newest = db.prepare(`SELECT * FROM knowledge_signals WHERE ${whereSql} ORDER BY captured_at DESC LIMIT 1`).get(...params) as any;
  const oldest = db.prepare(`SELECT * FROM knowledge_signals WHERE ${whereSql} ORDER BY captured_at ASC LIMIT 1`).get(...params) as any;
  const recent = db.prepare(`SELECT * FROM knowledge_signals WHERE ${whereSql} ORDER BY captured_at DESC LIMIT ?`).all(...params, limit) as any[];

  return {
    available: true,
    total: countRow.count,
    by_type: typesRows.reduce((acc: Record<string, number>, r: any) => { acc[r.signal_type] = r.count; return acc; }, {}),
    newest: newest || null,
    oldest: oldest || null,
    recent,
  };
}
