import { describe, it, expect } from "vitest";
import { checkTrust, recordTrust, revokeTrust, warnLocalImports } from "../../src/core/trust.js";
import type { LockFile } from "../../src/types/lock.js";

function makeLock(trusted: LockFile["trustedTransformers"] = []): LockFile {
  return {
    schema: 1,
    toolVersion: "0.1.0",
    source: { url: "github:test/repo", ref: "main", commit: "abc123" },
    installedAt: new Date().toISOString(),
    targets: ["claude"],
    trustedTransformers: trusted,
    files: [],
  };
}

describe("checkTrust", () => {
  it("returns untrusted for first-time transformer", () => {
    const lock = makeLock();
    expect(checkTrust(lock, "transformers/custom.ts", "sha256:abc")).toBe("untrusted");
  });

  it("returns trusted when hash matches", () => {
    const lock = makeLock([
      { path: "transformers/custom.ts", hash: "sha256:abc", trustedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(checkTrust(lock, "transformers/custom.ts", "sha256:abc")).toBe("trusted");
  });

  it("returns revoked when hash changed", () => {
    const lock = makeLock([
      { path: "transformers/custom.ts", hash: "sha256:abc", trustedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(checkTrust(lock, "transformers/custom.ts", "sha256:different")).toBe("revoked");
  });
});

describe("recordTrust", () => {
  it("adds new trust record", () => {
    const lock = makeLock();
    const updated = recordTrust(lock, "custom.ts", "sha256:hash1");
    expect(updated.trustedTransformers).toHaveLength(1);
    expect(updated.trustedTransformers[0]!.path).toBe("custom.ts");
  });

  it("updates existing trust record", () => {
    const lock = makeLock([
      { path: "custom.ts", hash: "sha256:old", trustedAt: "2025-01-01T00:00:00Z" },
    ]);
    const updated = recordTrust(lock, "custom.ts", "sha256:new");
    expect(updated.trustedTransformers).toHaveLength(1);
    expect(updated.trustedTransformers[0]!.hash).toBe("sha256:new");
  });
});

describe("revokeTrust", () => {
  it("removes trust record", () => {
    const lock = makeLock([
      { path: "custom.ts", hash: "sha256:abc", trustedAt: "2026-01-01T00:00:00Z" },
    ]);
    const updated = revokeTrust(lock, "custom.ts");
    expect(updated.trustedTransformers).toHaveLength(0);
  });
});

describe("warnLocalImports", () => {
  it("warns on fs import", () => {
    const warnings = warnLocalImports('import fs from "node:fs";');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("fs");
  });

  it("warns on http import", () => {
    const warnings = warnLocalImports('import http from "http";');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("network");
  });

  it("warns on child_process import", () => {
    const warnings = warnLocalImports('import { exec } from "child_process";');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("child_process");
  });

  it("returns empty for clean transformer", () => {
    const warnings = warnLocalImports('export default function transform(source) { return source; }');
    expect(warnings).toHaveLength(0);
  });
});
