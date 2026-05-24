import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "pathe";
import { tmpdir } from "node:os";
import {
  createJournal,
  writeJournal,
  readJournal,
  markOperationDone,
  deleteJournal,
} from "../../src/core/journal.js";

describe("journal", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "helpers-journal-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates a journal with UUID and timestamp", () => {
    const journal = createJournal(tempDir, "init", [
      { id: 0, op: "write", path: ".claude/CLAUDE.md" },
    ], "sha256:abc");

    expect(journal.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(journal.command).toBe("init");
    expect(journal.operations).toHaveLength(1);
    expect(journal.operations[0]!.done).toBe(false);
  });

  it("write/read round-trip", async () => {
    const journal = createJournal(tempDir, "sync", [
      { id: 0, op: "write", path: "file.md" },
      { id: 1, op: "delete", path: "old.md" },
    ], "sha256:pre");

    await writeJournal(tempDir, journal);
    const loaded = await readJournal(tempDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe(journal.runId);
    expect(loaded!.operations).toHaveLength(2);
  });

  it("returns null when no journal exists", async () => {
    const result = await readJournal(tempDir);
    expect(result).toBeNull();
  });

  it("marks operation as done", async () => {
    const journal = createJournal(tempDir, "init", [
      { id: 0, op: "write", path: "a.md" },
      { id: 1, op: "write", path: "b.md" },
    ], "sha256:x");

    await writeJournal(tempDir, journal);
    await markOperationDone(tempDir, journal, 0);

    const loaded = await readJournal(tempDir);
    expect(loaded!.operations[0]!.done).toBe(true);
    expect(loaded!.operations[1]!.done).toBe(false);
  });

  it("deletes journal", async () => {
    const journal = createJournal(tempDir, "init", [], "sha256:y");
    await writeJournal(tempDir, journal);

    await deleteJournal(tempDir);
    const loaded = await readJournal(tempDir);
    expect(loaded).toBeNull();
  });

  it("detects stale journal (has incomplete operations)", async () => {
    const journal = createJournal(tempDir, "sync", [
      { id: 0, op: "write", path: "file.md" },
    ], "sha256:z");

    await writeJournal(tempDir, journal);
    const loaded = await readJournal(tempDir);

    const isStale = loaded!.operations.some((op) => !op.done);
    expect(isStale).toBe(true);
  });
});
