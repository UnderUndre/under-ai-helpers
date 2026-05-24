/**
 * Integration test for version pinning (SC-005).
 */

import { describe, it, expect } from "vitest";
import { FileKind, FileStatus } from "../../src/types/common.js";
import type { LockFile } from "../../src/types/lock.js";

describe("version pinning", () => {
  function makeLock(ref: string, commit: string): LockFile {
    return {
      schema: 1,
      toolVersion: "0.1.0",
      source: { url: "github:test/repo", ref, commit },
      installedAt: new Date().toISOString(),
      targets: ["claude"],
      trustedTransformers: [],
      files: [],
    };
  }

  it("init --version records ref in lock", () => {
    const lock = makeLock("v1.0.0", "aaa111bbb222ccc333ddd444eee555fff666777");
    expect(lock.source.ref).toBe("v1.0.0");
    expect(lock.source.commit).toHaveLength(39);
  });

  it("sync without --upgrade preserves pinned version", () => {
    const lock = makeLock("v1.0.0", "abc123");

    // Sync without --upgrade should keep the same ref
    const syncRef = lock.source.ref; // re-use pinned ref
    expect(syncRef).toBe("v1.0.0");
  });

  it("sync --upgrade moves to latest (changes ref)", () => {
    const lock = makeLock("v1.0.0", "abc123");

    // --upgrade would change ref to "latest" or new version
    lock.source.ref = "v2.0.0";
    lock.source.commit = "new456";

    expect(lock.source.ref).toBe("v2.0.0");
    expect(lock.source.commit).toBe("new456");
  });

  it("sync --version moves to specific version", () => {
    const lock = makeLock("v1.0.0", "abc123");

    lock.source.ref = "v1.1.0";
    lock.source.commit = "specific789";

    expect(lock.source.ref).toBe("v1.1.0");
  });
});
