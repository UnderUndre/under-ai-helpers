/**
 * Custom transformer trust model per FR-007.
 * Hash-pinned in lock file. Revoked on hash change.
 */

import type { LockFile, TrustedTransformer } from "../types/lock.js";

export type TrustResult = "trusted" | "untrusted" | "revoked";

/**
 * Check if a custom transformer is trusted.
 */
export function checkTrust(
  lock: LockFile,
  transformerPath: string,
  fileHash: string,
): TrustResult {
  const record = lock.trustedTransformers.find((t) => t.path === transformerPath);

  if (!record) return "untrusted";
  if (record.hash !== fileHash) return "revoked";
  return "trusted";
}

/**
 * Record a custom transformer as trusted with its current hash.
 */
export function recordTrust(
  lock: LockFile,
  transformerPath: string,
  fileHash: string,
): LockFile {
  const existing = lock.trustedTransformers.findIndex((t) => t.path === transformerPath);
  const entry: TrustedTransformer = {
    path: transformerPath,
    hash: fileHash,
    trustedAt: new Date().toISOString(),
  };

  if (existing >= 0) {
    lock.trustedTransformers[existing] = entry;
  } else {
    lock.trustedTransformers.push(entry);
  }

  return lock;
}

/**
 * Revoke trust for a custom transformer.
 */
export function revokeTrust(
  lock: LockFile,
  transformerPath: string,
): LockFile {
  lock.trustedTransformers = lock.trustedTransformers.filter(
    (t) => t.path !== transformerPath,
  );
  return lock;
}

/**
 * Warn about local imports in custom transformer source code.
 * Custom transformers should be pure — no local fs/network access.
 */
export function warnLocalImports(content: string): string[] {
  const warnings: string[] = [];

  const fsImports = content.match(/(?:require\s*\(\s*['"]|from\s+['"])(?:node:)?fs['"]/g);
  if (fsImports) warnings.push("Transformer imports 'fs' module — may have filesystem side effects.");

  const netImports = content.match(/(?:require\s*\(\s*['"]|from\s+['"])(?:node:)?(?:http|https|net)['"]/g);
  if (netImports) warnings.push("Transformer imports network module — may have network side effects.");

  const childProcess = content.match(/(?:require\s*\(\s*['"]|from\s+['"])(?:node:)?child_process['"]/g);
  if (childProcess) warnings.push("Transformer imports 'child_process' — may execute arbitrary commands.");

  return warnings;
}
