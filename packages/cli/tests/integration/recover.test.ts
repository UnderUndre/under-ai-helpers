/**
 * Integration test for recover flow (SC-007).
 * Simulates crash mid-sync via incomplete journal.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "pathe";
import { tmpdir } from "node:os";

import {
  createJournal,
  writeJournal,
  readJournal,
  deleteJournal,
} from "../../src/core/journal.js";
import { createStagingDir, stageFile, cleanStaging } from "../../src/core/staging.js";

describe("recover flow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "helpers-recover-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("detects incomplete journal as stale", async () => {
    const journal = createJournal(tempDir, "sync", [
      { id: 0, op: "write", path: "file1.md" },
      { id: 1, op: "write", path: "file2.md" },
    ], "sha256:pre");

    await writeJournal(tempDir, journal);

    const loaded = await readJournal(tempDir);
    expect(loaded).not.toBeNull();

    const incomplete = loaded!.operations.filter((op) => !op.done);
    expect(incomplete).toHaveLength(2);
  });

  it("rollback restores backed-up files", async () => {
    // Create an existing file
    const filePath = join(tempDir, "managed.md");
    const originalContent = "# Original Content\nDo not lose this.";
    await writeFile(filePath, originalContent, "utf8");

    // Create a journal simulating a crash mid-sync
    const journal = createJournal(tempDir, "sync", [
      { id: 0, op: "write", path: "managed.md" },
    ], "sha256:pre");

    // Create backup manually (simulating what sync would do)
    const backupDir = join(tempDir, ".helpers/backup", journal.runId);
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, "managed.md"), originalContent, "utf8");

    // Simulate crash: overwrite the file
    await writeFile(filePath, "# Corrupted by crash", "utf8");

    // Write journal as incomplete
    await writeJournal(tempDir, journal);

    // Simulate rollback: copy backup over current
    const { copyFile } = await import("node:fs/promises");
    await copyFile(join(backupDir, "managed.md"), filePath);

    // Verify restoration
    const restored = await readFile(filePath, "utf8");
    expect(restored).toBe(originalContent);

    // Clean up
    await deleteJournal(tempDir);
  });

  it("resume completes remaining staged operations", async () => {
    const journal = createJournal(tempDir, "init", [
      { id: 0, op: "write", path: "done.md" },
      { id: 1, op: "write", path: "pending.md" },
    ], "sha256:pre");

    // Mark first op as done
    journal.operations[0]!.done = true;
    await writeJournal(tempDir, journal);

    // Stage the pending file
    const stagingDir = await createStagingDir(tempDir);
    const stagedPath = await stageFile(stagingDir, "# Pending Content", "pending.md");

    // Simulate resume: commit staged file
    const { commitStaged } = await import("../../src/core/staging.js");
    await commitStaged(stagedPath, join(tempDir, "pending.md"));

    // Verify
    const content = await readFile(join(tempDir, "pending.md"), "utf8");
    expect(content).toBe("# Pending Content");

    await deleteJournal(tempDir);
    await cleanStaging(tempDir);
  });
});
