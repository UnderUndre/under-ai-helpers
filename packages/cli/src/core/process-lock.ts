/**
 * Concurrency guard per FR-022.
 * Prevents two CLI processes from running mutating commands simultaneously.
 *
 * Uses atomic exclusive create (wx flag) to avoid TOCTOU race.
 * Returns a boolean indicating ownership for safe release.
 */

import { open, readFile, unlink, mkdir } from "node:fs/promises";
import { join, dirname } from "pathe";

const LOCK_PID_PATH = ".helpers/lock.pid";

/**
 * Attempt to acquire the process lock atomically.
 * Returns true if lock was acquired by this process.
 * Throws if another live process holds the lock.
 */
export async function acquireProcessLock(root: string): Promise<boolean> {
  const lockPath = join(root, LOCK_PID_PATH);
  await mkdir(dirname(lockPath), { recursive: true });

  // Attempt atomic exclusive create — fails with EEXIST if file exists
  try {
    const fd = await open(lockPath, "wx");
    await fd.writeFile(process.pid.toString(), "utf8");
    await fd.close();
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }

  // Lock file exists — check if the holder is alive
  let existingPid: number;
  try {
    const raw = await readFile(lockPath, "utf8");
    existingPid = parseInt(raw.trim(), 10);
  } catch {
    // File vanished between open("wx") and readFile — retry once
    return acquireProcessLock(root);
  }

  if (isProcessAlive(existingPid)) {
    throw new Error(
      `Another helpers process (PID ${existingPid}) is already running. ` +
      `If this is stale, delete ${lockPath} manually.`,
    );
  }

  // Stale lock — auto-clean with warning, then retry
  console.warn(`Cleaning stale process lock (PID ${existingPid} is no longer running).`);
  try {
    await unlink(lockPath);
  } catch {
    // Another process may have cleaned it
  }

  return acquireProcessLock(root);
}

/**
 * Release the process lock. Only call if acquireProcessLock returned true.
 */
export async function releaseProcessLock(root: string): Promise<void> {
  const lockPath = join(root, LOCK_PID_PATH);
  try {
    // Verify we own it before deleting
    const raw = await readFile(lockPath, "utf8");
    const pid = parseInt(raw.trim(), 10);
    if (pid === process.pid) {
      await unlink(lockPath);
    }
  } catch {
    // Already released or doesn't exist
  }
}

export async function isStaleProcessLock(root: string): Promise<boolean> {
  try {
    const raw = await readFile(join(root, LOCK_PID_PATH), "utf8");
    const pid = parseInt(raw.trim(), 10);
    return !isProcessAlive(pid);
  } catch {
    return false;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
