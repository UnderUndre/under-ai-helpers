/**
 * Cross-platform validation (SC-008).
 * Lock file path normalization, LF normalization, CRLF handling.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "pathe";
import { tmpdir } from "node:os";

import { canonicalHash } from "../../src/core/hash.js";
import { writeLock, readLock } from "../../src/core/lock.js";
import { FileKind, FileClass, FileStatus } from "../../src/types/common.js";
import type { LockFile, SourceEntry } from "../../src/types/lock.js";

describe("cross-platform", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "helpers-xplat-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lock file paths always use forward slashes", async () => {
    const lock: LockFile = {
      schema: 1,
      toolVersion: "0.1.0",
      source: { url: "github:test/repo", ref: "main", commit: "abc123" },
      installedAt: new Date().toISOString(),
      targets: ["claude"],
      trustedTransformers: [],
      files: [
        {
          path: ".claude\\commands\\commit.md", // Intentional backslash
          kind: FileKind.Source,
          class: FileClass.Core,
          status: FileStatus.Managed,
          sourceCanonicalHash: "sha256:aaa",
          localCanonicalHash: "sha256:aaa",
        } as SourceEntry,
      ],
    };

    await writeLock(tempDir, lock);
    const loaded = await readLock(tempDir);

    // writeLock normalizes to forward slashes
    expect(loaded!.files[0]!.path).toBe(".claude/commands/commit.md");
    expect(loaded!.files[0]!.path).not.toContain("\\");
  });

  it("LF normalization produces consistent hashes", () => {
    const lf = "line1\nline2\nline3\n";
    const crlf = "line1\r\nline2\r\nline3\r\n";
    const mixed = "line1\nline2\r\nline3\n";

    const hashLf = canonicalHash(lf);
    const hashCrlf = canonicalHash(crlf);
    const hashMixed = canonicalHash(mixed);

    expect(hashLf).toBe(hashCrlf);
    expect(hashLf).toBe(hashMixed);
  });

  it("hash is deterministic across runs", () => {
    const content = "# Title\n\nBody with special chars: áéíóú 中文 🎉\n";
    const hash1 = canonicalHash(content);
    const hash2 = canonicalHash(content);
    expect(hash1).toBe(hash2);
  });

  it("path normalization is idempotent", () => {
    const { normalize } = require("pathe") as typeof import("pathe");

    // Forward slashes stay forward
    expect(normalize(".claude/commands/commit.md")).toBe(".claude/commands/commit.md");

    // Backslashes get normalized
    expect(normalize(".claude\\commands\\commit.md")).toBe(".claude/commands/commit.md");

    // Mixed slashes get normalized
    expect(normalize(".claude/commands\\commit.md")).toBe(".claude/commands/commit.md");
  });
});
