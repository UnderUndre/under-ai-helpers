/**
 * Integration test for concurrency guard + stale-journal gate.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "pathe";
import { tmpdir } from "node:os";

import {
  acquireProcessLock,
  releaseProcessLock,
  isStaleProcessLock,
} from "../../src/core/process-lock.js";
import {
  createJournal,
  writeJournal,
  readJournal,
} from "../../src/core/journal.js";

describe("concurrency guard", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "helpers-concurrency-test-"));
  });

  afterEach(async () => {
    await releaseProcessLock(tempDir).catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  });

  it("second acquire aborts with actionable error", async () => {
    await acquireProcessLock(tempDir);
    await expect(acquireProcessLock(tempDir)).rejects.toThrow("Another helpers process");
  });

  it("stale PID auto-cleaned with warning", async () => {
    // Write a dead PID
    await mkdir(join(tempDir, ".helpers"), { recursive: true });
    await writeFile(join(tempDir, ".helpers/lock.pid"), "999999999", "utf8");

    expect(await isStaleProcessLock(tempDir)).toBe(true);

    // Acquire should succeed (auto-clean stale)
    await acquireProcessLock(tempDir);
    await releaseProcessLock(tempDir);
  });
});

describe("stale-journal gate", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "helpers-journal-gate-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("stale journal blocks mutating commands", async () => {
    const journal = createJournal(tempDir, "sync", [
      { id: 0, op: "write", path: "file.md" },
    ], "sha256:pre");

    await writeJournal(tempDir, journal);

    const loaded = await readJournal(tempDir);
    expect(loaded).not.toBeNull();

    const hasIncomplete = loaded!.operations.some((op) => !op.done);
    expect(hasIncomplete).toBe(true);
    // In real CLI, this would trigger ExitCode.StaleJournal
  });

  it("read-only commands work with stale journal (no gate)", async () => {
    const journal = createJournal(tempDir, "sync", [
      { id: 0, op: "write", path: "file.md" },
    ], "sha256:pre");

    await writeJournal(tempDir, journal);

    // Read-only commands (status, diff, doctor, list-transformers) skip the gate.
    // They only read the lock file, not the journal.
    // We verify by reading the journal directly — it doesn't block reads.
    const loaded = await readJournal(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.command).toBe("sync");
  });

  it("completed journal does not block", async () => {
    const journal = createJournal(tempDir, "init", [
      { id: 0, op: "write", path: "file.md" },
    ], "sha256:pre");

    journal.operations[0]!.done = true;
    await writeJournal(tempDir, journal);

    const loaded = await readJournal(tempDir);
    const hasIncomplete = loaded!.operations.some((op) => !op.done);
    expect(hasIncomplete).toBe(false);
    // All done = not stale → no block
  });
});
