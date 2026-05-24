/**
 * Write-Ahead Journal for crash recovery per FR-020.
 * Stored at .helpers/journal.json during init/sync runs.
 */

import { readFile, unlink, mkdir, copyFile } from "node:fs/promises";
import { join, dirname } from "pathe";
import { randomUUID } from "node:crypto";
import type { Journal, JournalOperation } from "../types/journal.js";

const JOURNAL_PATH = ".helpers/journal.json";
const BACKUP_DIR = ".helpers/backup";

export function createJournal(
  _root: string,
  command: "init" | "sync" | "regen",
  operations: Omit<JournalOperation, "done">[],
  preLockHash: string,
): Journal {
  return {
    runId: randomUUID(),
    command,
    startedAt: new Date().toISOString(),
    preLockHash,
    postLockHash: "", // filled after lock is computed
    operations: operations.map((op) => ({ ...op, done: false })),
  };
}

export async function writeJournal(root: string, journal: Journal): Promise<void> {
  const path = join(root, JOURNAL_PATH);
  await mkdir(dirname(path), { recursive: true });
  const fd = await import("node:fs").then((fs) =>
    fs.promises.open(path, "w"),
  );
  try {
    await fd.writeFile(JSON.stringify(journal, null, 2), "utf8");
    await fd.datasync();
  } finally {
    await fd.close();
  }
}

export async function readJournal(root: string): Promise<Journal | null> {
  try {
    const raw = await readFile(join(root, JOURNAL_PATH), "utf8");
    return JSON.parse(raw) as Journal;
  } catch {
    return null;
  }
}

export async function markOperationDone(
  root: string,
  journal: Journal,
  opId: number,
): Promise<void> {
  const op = journal.operations.find((o) => o.id === opId);
  if (op) {
    op.done = true;
    await writeJournal(root, journal);
  }
}

export async function deleteJournal(root: string): Promise<void> {
  try {
    await unlink(join(root, JOURNAL_PATH));
  } catch {
    // Already deleted or doesn't exist
  }
}

export async function createBackup(
  root: string,
  runId: string,
  filePath: string,
): Promise<string> {
  const backupPath = join(root, BACKUP_DIR, runId, filePath);
  await mkdir(dirname(backupPath), { recursive: true });
  await copyFile(join(root, filePath), backupPath);
  return backupPath;
}
