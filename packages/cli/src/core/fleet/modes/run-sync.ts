/**
 * Shared sync pipeline runner for fleet modes.
 * Runs the existing single-project sync pipeline against an ephemeral clone.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fetchSource } from "../../fetch.js";
import { readLock } from "../../lock.js";
import { computeSyncPlan, applySyncPlan } from "../../../cli/sync.js";
import { FleetError } from "../types.js";

const execFileAsync = promisify(execFile);

/**
 * Run the full sync pipeline against a cloned repo directory.
 *
 * Steps:
 * 1. Read helpers-lock.json from the clone
 * 2. Fetch the source template (via giget)
 * 3. Compute sync plan (diff source vs lock)
 * 4. Apply sync plan (write files to clone)
 *
 * Returns true if changes were applied, false if no-op.
 */
export async function runSyncPipeline(cloneDir: string): Promise<boolean> {
  // 1. Read lock from the clone
  const lock = await readLock(cloneDir);
  if (!lock) {
    throw new FleetError(
      "lockfile/malformed",
      `No helpers-lock.json found in clone at ${cloneDir}`,
    );
  }

  // 2. Fetch source template
  const { dir: sourceDir } = await fetchSource(
    lock.source.url,
    lock.source.ref,
    undefined,
    { offline: false },
  );

  // 3. Compute sync plan
  const plan = await computeSyncPlan(lock, sourceDir, lock.targets, {
    upgrade: false,
    ref: lock.source.ref,
  });

  const actionItems = plan.items.filter((i) => i.action !== "skip");
  if (actionItems.length === 0) {
    return false; // no-op
  }

  // 4. Apply sync plan against the clone directory
  await applySyncPlan(cloneDir, lock, plan, sourceDir);
  return true;
}

/**
 * Check if the working tree in `dir` has uncommitted changes.
 * Uses `git diff --exit-code` which exits 1 if there are changes, 0 if clean.
 */
export async function hasWorkingTreeChanges(dir: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["diff", "--exit-code"], { cwd: dir });
    return false; // exit 0 = clean
  } catch (error: unknown) {
    // git diff --exit-code exits with 1 if there are differences
    const err = error as { code?: string; status?: number };
    if (err.status === 1 || err.code === "1") {
      return true;
    }
    throw error;
  }
}

/**
 * Get the current HEAD SHA for a git repo.
 */
export async function getHeadSha(dir: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: dir });
  return stdout.trim();
}

/**
 * Get the full diff output for a git repo.
 */
export async function getFullDiff(dir: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["diff"], { cwd: dir });
  return stdout;
}
