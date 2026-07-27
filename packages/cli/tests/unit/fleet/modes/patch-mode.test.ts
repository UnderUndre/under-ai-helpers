/**
 * Unit tests for patch-mode.ts.
 * Mocks: node:fs/promises, node:child_process, node:util,
 *         ephemeral-clone, run-sync.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FleetEntry } from "../../../../src/core/fleet/types.js";
import { FleetError } from "../../../../src/core/fleet/types.js";

// ── Test fixtures ────────────────────────────────────────────────────

const TEST_ENTRY: FleetEntry = {
  fullName: "testowner/testrepo",
  shortName: "testrepo",
  defaultBranch: "main",
  pinnedRef: "v0.3.0",
  pinnedSource: "github:UnderUndre/under-ai-helpers",
  latestRef: "v0.4.0",
  hasDrift: true,
  lastSyncAt: "2026-01-15T10:30:00Z",
  state: "active",
  unreadableReason: null,
};

const AUTH = "ghp_testtoken123";
const PATCH_DIR = "/tmp/test-patches";

// ── Mocks ────────────────────────────────────────────────────────────

const {
  mockCleanup,
  mockRunSyncPipeline,
  mockHasWorkingTreeChanges,
  mockGetFullDiff,
  mockMkdir,
  mockWriteFile,
} = vi.hoisted(() => ({
  mockCleanup: vi.fn<() => Promise<void>>(),
  mockRunSyncPipeline: vi.fn<() => Promise<boolean>>(),
  mockHasWorkingTreeChanges: vi.fn<() => Promise<boolean>>(),
  mockGetFullDiff: vi.fn<() => Promise<string>>(),
  mockMkdir: vi.fn<() => Promise<void>>(),
  mockWriteFile: vi.fn<() => Promise<void>>(),
}));

vi.mock("../../../../src/core/fleet/ephemeral-clone.js", () => ({
  createEphemeralClone: vi.fn(() =>
    Promise.resolve({
      dir: "/tmp/helpers-fleet-test",
      cleanup: mockCleanup,
    }),
  ),
}));

vi.mock("../../../../src/core/fleet/modes/run-sync.js", () => ({
  get runSyncPipeline() { return mockRunSyncPipeline; },
  get hasWorkingTreeChanges() { return mockHasWorkingTreeChanges; },
  getHeadSha: vi.fn(() => Promise.resolve("abc123")),
  get getFullDiff() { return mockGetFullDiff; },
}));

vi.mock("node:fs/promises", () => ({
  get mkdir() { return mockMkdir; },
  get writeFile() { return mockWriteFile; },
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: () => vi.fn(),
}));

// ── Import after mocks ───────────────────────────────────────────────

import { syncPatch } from "../../../../src/core/fleet/modes/patch-mode.js";

// ── Tests ────────────────────────────────────────────────────────────

describe("syncPatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunSyncPipeline.mockResolvedValue(true);
    mockHasWorkingTreeChanges.mockResolvedValue(true);
    mockGetFullDiff.mockResolvedValue("diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new\n");
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockCleanup.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Happy path → succeeded with patchPath ──────────────────────

  it("returns succeeded with patchPath and writes file with correct content", async () => {
    const result = await syncPatch(TEST_ENTRY, AUTH, "v0.4.0", PATCH_DIR);

    expect(result.outcome).toBe("succeeded");
    expect(result.mode).toBe("patch");
    expect(result.patchPath).toContain("testowner__testrepo.patch");
    expect(result.refBefore).toBe("v0.3.0");
    expect(result.refAfter).toBe("v0.4.0");

    // Verify file was written with diff content
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("testowner__testrepo.patch"),
      expect.stringContaining("diff --git"),
      "utf8",
    );
  });

  // ── 2. No-op short-circuit → outcome: "no-op" ─────────────────────

  it("returns no-op when sync pipeline reports no changes", async () => {
    mockRunSyncPipeline.mockResolvedValue(false);
    mockHasWorkingTreeChanges.mockResolvedValue(false);

    const result = await syncPatch(TEST_ENTRY, AUTH, "v0.4.0", PATCH_DIR);

    expect(result.outcome).toBe("no-op");
    expect(result.refBefore).toBe("v0.3.0");
    expect(result.refAfter).toBe("v0.3.0");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  // ── 3. Output dir created if missing ──────────────────────────────

  it("creates output directory with recursive: true", async () => {
    await syncPatch(TEST_ENTRY, AUTH, "v0.4.0", PATCH_DIR);

    expect(mockMkdir).toHaveBeenCalledWith(PATCH_DIR, { recursive: true });
  });

  // ── 4. Patch filename format: <owner>__<repo>.patch ───────────────

  it("uses correct filename format with double underscore separator", async () => {
    await syncPatch(TEST_ENTRY, AUTH, "v0.4.0", PATCH_DIR);

    expect(mockWriteFile).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = mockWriteFile.mock.calls as any;
    const writtenPath: string = calls[0][0];
    expect(writtenPath).toMatch(/testowner__testrepo\.patch$/);
  });
});
