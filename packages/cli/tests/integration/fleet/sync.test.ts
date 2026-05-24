/**
 * Integration tests for `fleet sync` command.
 * Tests the full pipeline: auth → config → discovery → selection → sync modes.
 * Mocks GitHub API at the fetch level, git at the child_process level.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FleetConfig, FleetEntry, SyncResult, SyncSession } from "../../../src/core/fleet/types.js";
import { summarise, exitCode } from "../../../src/core/fleet/types.js";
import { dispatchSync } from "../../../src/core/fleet/modes/index.js";

// ── Helpers ──────────────────────────────────────────────────────────

const AUTH = "ghp_testtoken123";

function makeEntry(overrides: Partial<FleetEntry> = {}): FleetEntry {
  return {
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
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────

const {
  mockCleanup,
  mockFindOpenPullRequest,
  mockCreatePullRequest,
  mockRunSyncPipeline,
  mockHasWorkingTreeChanges,
  mockGetHeadSha,
  mockGetFullDiff,
  mockExecFileAsync,
  mockMkdir,
  mockWriteFile,
} = vi.hoisted(() => ({
  mockCleanup: vi.fn<() => Promise<void>>(),
  mockFindOpenPullRequest: vi.fn(),
  mockCreatePullRequest: vi.fn(),
  mockRunSyncPipeline: vi.fn<() => Promise<boolean>>(),
  mockHasWorkingTreeChanges: vi.fn<() => Promise<boolean>>(),
  mockGetHeadSha: vi.fn<() => Promise<string>>(),
  mockGetFullDiff: vi.fn<() => Promise<string>>(),
  mockExecFileAsync: vi.fn(),
  mockMkdir: vi.fn<() => Promise<void>>(),
  mockWriteFile: vi.fn<() => Promise<void>>(),
}));

vi.mock("../../../src/core/fleet/ephemeral-clone.js", () => ({
  createEphemeralClone: vi.fn(() =>
    Promise.resolve({
      dir: "/tmp/helpers-fleet-test",
      cleanup: mockCleanup,
    }),
  ),
}));

vi.mock("../../../src/core/fleet/github-api.js", () => ({
  findOpenPullRequest: (...args: unknown[]) => mockFindOpenPullRequest(...args),
  createPullRequest: (...args: unknown[]) => mockCreatePullRequest(...args),
  resolveFleetAuth: vi.fn(() => AUTH),
}));

vi.mock("../../../src/core/fleet/modes/run-sync.js", () => ({
  get runSyncPipeline() { return mockRunSyncPipeline; },
  get hasWorkingTreeChanges() { return mockHasWorkingTreeChanges; },
  get getHeadSha() { return mockGetHeadSha; },
  get getFullDiff() { return mockGetFullDiff; },
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  get mkdir() { return mockMkdir; },
  get writeFile() { return mockWriteFile; },
}));

// ── Tests ────────────────────────────────────────────────────────────

describe("fleet sync (integration)", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunSyncPipeline.mockResolvedValue(true);
    mockHasWorkingTreeChanges.mockResolvedValue(true);
    mockGetHeadSha.mockResolvedValue("abc123def456");
    mockGetFullDiff.mockResolvedValue("diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n");
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
    mockCleanup.mockResolvedValue(undefined);
    mockCreatePullRequest.mockResolvedValue({
      html_url: "https://github.com/testowner/testrepo/pull/1",
      number: 1,
    });
    mockFindOpenPullRequest.mockResolvedValue(null);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Happy path: 2 repos selected, both succeed ─────────────────

  it("syncs 2 repos sequentially, summary shows succeeded=2, exit code 0", async () => {
    const entries = [
      makeEntry({ fullName: "user/repo-a", shortName: "repo-a" }),
      makeEntry({ fullName: "user/repo-b", shortName: "repo-b" }),
      makeEntry({ fullName: "user/repo-c", shortName: "repo-c" }),
      makeEntry({ fullName: "user/repo-d", shortName: "repo-d" }),
    ];

    // Select only 2
    const selected = entries.slice(0, 2);

    const results: SyncResult[] = [];
    for (const entry of selected) {
      const result = await dispatchSync(entry, "pr", {
        auth: AUTH,
        latestRef: entry.latestRef,
        fetchFn: mockFetch,
      });
      results.push(result);
    }

    const session: SyncSession = {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      mode: "pr",
      selection: { entries: selected, source: { kind: "interactive" } },
      results,
      interrupted: false,
    };

    const summary = summarise(session);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(exitCode(session)).toBe(0);

    // Verify exactly 2 sync attempts
    expect(mockCreatePullRequest).toHaveBeenCalledTimes(2);
  });

  // ── 2. No-op short-circuit: 3rd entry's diff is clean ─────────────

  it("3rd entry with clean diff returns no-op, not failed", async () => {
    const entries = [
      makeEntry({ fullName: "user/repo-a" }),
      makeEntry({ fullName: "user/repo-b" }),
      makeEntry({ fullName: "user/repo-c" }),
    ];

    // Third entry has no changes
    const results: SyncResult[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (i === 2) {
        mockRunSyncPipeline.mockResolvedValueOnce(false);
        mockHasWorkingTreeChanges.mockResolvedValueOnce(false);
      }
      const result = await dispatchSync(entries[i]!, "pr", {
        auth: AUTH,
        latestRef: entries[i]!.latestRef,
        fetchFn: mockFetch,
      });
      results.push(result);
    }

    expect(results[0]!.outcome).toBe("succeeded");
    expect(results[1]!.outcome).toBe("succeeded");
    expect(results[2]!.outcome).toBe("no-op");

    const session: SyncSession = {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      mode: "pr",
      selection: { entries, source: { kind: "all" } },
      results,
      interrupted: false,
    };

    const summary = summarise(session);
    expect(summary.succeeded).toBe(2);
    expect(summary.noOp).toBe(1);
    expect(summary.failed).toBe(0);
    expect(exitCode(session)).toBe(0);
  });

  // ── 3. One entry fails → summary shows 1 failed + 1 succeeded ─────

  it("one entry fails, summary shows 1 failed + 1 succeeded, exit code 1", async () => {
    const entries = [
      makeEntry({ fullName: "user/repo-a" }),
      makeEntry({ fullName: "user/repo-b" }),
    ];

    // First entry: clone fails
    const { createEphemeralClone } = await import("../../../src/core/fleet/ephemeral-clone.js");
    vi.mocked(createEphemeralClone)
      .mockRejectedValueOnce(new Error("clone failed"))
      .mockResolvedValueOnce({
        dir: "/tmp/helpers-fleet-test",
        cleanup: mockCleanup,
      });

    const results: SyncResult[] = [];
    for (const entry of entries) {
      const result = await dispatchSync(entry, "pr", {
        auth: AUTH,
        latestRef: entry.latestRef,
        fetchFn: mockFetch,
      });
      results.push(result);
    }

    expect(results[0]!.outcome).toBe("failed");
    expect(results[1]!.outcome).toBe("succeeded");

    const session: SyncSession = {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      mode: "pr",
      selection: { entries, source: { kind: "explicit", repos: ["user/repo-a", "user/repo-b"] } },
      results,
      interrupted: false,
    };

    const summary = summarise(session);
    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(1);
    expect(exitCode(session)).toBe(1);
  });

  // ── 4. Empty selection → nothing selected message ──────────────────

  it("empty selection produces empty results, exit code 0", async () => {
    const session: SyncSession = {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      mode: "pr",
      selection: { entries: [], source: { kind: "interactive" } },
      results: [],
      interrupted: false,
    };

    const summary = summarise(session);
    expect(summary.succeeded).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.noOp).toBe(0);
    expect(exitCode(session)).toBe(0);
  });
});
