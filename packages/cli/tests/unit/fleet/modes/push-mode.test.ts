/**
 * Unit tests for push-mode.ts.
 * Mocks: node:child_process, node:util, ephemeral-clone, run-sync.
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
  pinnedSource: "github:UnderUndre/ai",
  latestRef: "v0.4.0",
  hasDrift: true,
  lastSyncAt: "2026-01-15T10:30:00Z",
  state: "active",
  unreadableReason: null,
};

const AUTH = "ghp_testtoken123";

// ── Mocks ────────────────────────────────────────────────────────────

const {
  mockCleanup,
  mockRunSyncPipeline,
  mockHasWorkingTreeChanges,
  mockGetHeadSha,
  mockExecFileAsync,
} = vi.hoisted(() => ({
  mockCleanup: vi.fn<() => Promise<void>>(),
  mockRunSyncPipeline: vi.fn<() => Promise<boolean>>(),
  mockHasWorkingTreeChanges: vi.fn<() => Promise<boolean>>(),
  mockGetHeadSha: vi.fn<() => Promise<string>>(),
  mockExecFileAsync: vi.fn(),
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
  get getHeadSha() { return mockGetHeadSha; },
  getFullDiff: vi.fn(() => Promise.resolve("diff content")),
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// ── Import after mocks ───────────────────────────────────────────────

import { syncPush } from "../../../../src/core/fleet/modes/push-mode.js";

// ── Tests ────────────────────────────────────────────────────────────

describe("syncPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunSyncPipeline.mockResolvedValue(true);
    mockHasWorkingTreeChanges.mockResolvedValue(true);
    mockGetHeadSha.mockResolvedValue("abc123def456");
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
    mockCleanup.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Happy path → succeeded with pushedSha ──────────────────────

  it("returns succeeded with pushedSha on happy path", async () => {
    const result = await syncPush(TEST_ENTRY, AUTH, "v0.4.0");

    expect(result.outcome).toBe("succeeded");
    expect(result.mode).toBe("push");
    expect(result.pushedSha).toBe("abc123def456");
    expect(result.refBefore).toBe("v0.3.0");
    expect(result.refAfter).toBe("v0.4.0");
    expect(result.fullName).toBe("testowner/testrepo");
  });

  // ── 2. No-op short-circuit → outcome: "no-op" ─────────────────────

  it("returns no-op when sync pipeline reports no changes", async () => {
    mockRunSyncPipeline.mockResolvedValue(false);
    mockHasWorkingTreeChanges.mockResolvedValue(false);

    const result = await syncPush(TEST_ENTRY, AUTH, "v0.4.0");

    expect(result.outcome).toBe("no-op");
    expect(result.refBefore).toBe("v0.3.0");
    expect(result.refAfter).toBe("v0.3.0");
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  // ── 3. Branch protected → outcome: "skipped" ──────────────────────

  it("returns skipped with reason git/branch-protected on protected branch error", async () => {
    const pushError: Error & { stderr: string } = Object.assign(
      new Error("push failed"),
      { stderr: "error: failed to push some refs to https://github.com/testowner/testrepo.git\nremote: error: GH006: Protected branch update failed for main. Changes must be made via a pull request.\nTo https://github.com/testowner/testrepo.git\n! [remote rejected] main -> main (protected branch hook declined)" },
    );

    // Make push fail, other git commands succeed
    mockExecFileAsync.mockImplementation((cmd: string, args: string[]) => {
      if (args.includes("push")) return Promise.reject(pushError);
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await syncPush(TEST_ENTRY, AUTH, "v0.4.0");

    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toBe("git/branch-protected");
    }
  });

  // ── 4. Non-fast-forward → outcome: "skipped" ──────────────────────

  it("returns skipped with reason git/push-rejected on non-fast-forward error", async () => {
    const pushError: Error & { stderr: string } = Object.assign(
      new Error("push failed"),
      { stderr: "To https://github.com/testowner/testrepo.git\n ! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs to 'https://github.com/testowner/testrepo.git'\nhint: Updates were rejected because the tip of your current branch is behind" },
    );

    mockExecFileAsync.mockImplementation((cmd: string, args: string[]) => {
      if (args.includes("push")) return Promise.reject(pushError);
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const result = await syncPush(TEST_ENTRY, AUTH, "v0.4.0");

    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toBe("git/push-rejected");
    }
  });

  // ── 5. Verify error codes come from respective stderr fixtures ────

  it("distinguishes protected branch from non-fast-forward by stderr content", async () => {
    // Protected branch contains "protected branch"
    const protectedError: Error & { stderr: string } = Object.assign(
      new Error("push failed"),
      { stderr: "remote: error: GH006: protected branch update failed" },
    );

    // Non-fast-forward contains "non-fast-forward" but NOT "protected branch"
    const rejectedError: Error & { stderr: string } = Object.assign(
      new Error("push failed"),
      { stderr: "non-fast-forward\nfailed to push some refs" },
    );

    // Test protected
    mockExecFileAsync.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes("push")) return Promise.reject(protectedError);
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const protectedResult = await syncPush(TEST_ENTRY, AUTH, "v0.4.0");
    expect(protectedResult.outcome).toBe("skipped");
    if (protectedResult.outcome === "skipped") {
      expect(protectedResult.reason).toBe("git/branch-protected");
    }

    // Reset for non-fast-forward test
    vi.clearAllMocks();
    mockRunSyncPipeline.mockResolvedValue(true);
    mockHasWorkingTreeChanges.mockResolvedValue(true);
    mockGetHeadSha.mockResolvedValue("abc123");
    mockCleanup.mockResolvedValue(undefined);

    mockExecFileAsync.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes("push")) return Promise.reject(rejectedError);
      return Promise.resolve({ stdout: "", stderr: "" });
    });

    const rejectedResult = await syncPush(TEST_ENTRY, AUTH, "v0.4.0");
    expect(rejectedResult.outcome).toBe("skipped");
    if (rejectedResult.outcome === "skipped") {
      expect(rejectedResult.reason).toBe("git/push-rejected");
    }
  });
});
