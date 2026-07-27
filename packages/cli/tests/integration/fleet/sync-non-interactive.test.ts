/**
 * Integration tests for non-interactive `fleet sync` command.
 * Tests the full pipeline with --all, --repo, --filter flags.
 * Mocks GitHub API at the fetch level, git at the child_process level.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FleetConfig, FleetEntry, SyncResult, SyncSession } from "../../../src/core/fleet/types.js";
import { summarise, exitCode } from "../../../src/core/fleet/types.js";
import { dispatchSync } from "../../../src/core/fleet/modes/index.js";
import { selectByFlag, validateMutualExclusion } from "../../../src/cli/fleet/sync.js";

// ── Helpers ──────────────────────────────────────────────────────────

const AUTH = "ghp_testtoken123";

function makeEntry(overrides: Partial<FleetEntry> = {}): FleetEntry {
  return {
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

describe("fleet sync non-interactive (integration)", () => {
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

  // ── 1. --all --mode patch --yes: 5 entries, 3 succeed, 2 fail ──────

  it("fleet sync --all --mode patch: 3 succeed, 2 fail → exit 1", async () => {
    const entries: FleetEntry[] = [
      makeEntry({ fullName: "org/repo-a", shortName: "repo-a" }),
      makeEntry({ fullName: "org/repo-b", shortName: "repo-b" }),
      makeEntry({ fullName: "org/repo-c", shortName: "repo-c" }),
      makeEntry({ fullName: "org/repo-d", shortName: "repo-d", state: "archived" }),
      makeEntry({ fullName: "org/repo-e", shortName: "repo-e", state: "disabled" }),
    ];

    // --all selects only active (3 entries)
    const selection = selectByFlag(entries, { all: true });
    expect(selection).not.toBeNull();
    expect(selection!.entries).toHaveLength(3);

    // First 2 succeed, 3rd fails (clone failure)
    const { createEphemeralClone } = await import("../../../src/core/fleet/ephemeral-clone.js");
    vi.mocked(createEphemeralClone)
      .mockResolvedValueOnce({ dir: "/tmp/test-a", cleanup: mockCleanup })
      .mockResolvedValueOnce({ dir: "/tmp/test-b", cleanup: mockCleanup })
      .mockRejectedValueOnce(new Error("clone failed"));

    const results: SyncResult[] = [];
    for (const entry of selection!.entries) {
      const result = await dispatchSync(entry, "patch", {
        auth: AUTH,
        latestRef: entry.latestRef,
        patchOutputDir: "./.fleet-patches",
        fetchFn: mockFetch,
      });
      results.push(result);
    }

    const session: SyncSession = {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      mode: "patch",
      selection: selection!,
      results,
      interrupted: false,
    };

    const summary = summarise(session);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    expect(exitCode(session)).toBe(1);

    // Verify 3 sync attempts (2 succeed via runSyncPipeline, 1 fails at clone)
    expect(mockRunSyncPipeline).toHaveBeenCalledTimes(2);
    expect(mockCleanup).toHaveBeenCalledTimes(2);
  });

  // ── 2. --repo owner/repo1 --repo owner/repo2 --mode pr ────────────

  it("fleet sync --repo owner/repo1 --repo owner/repo2: exactly 2 syncs, exit 0", async () => {
    const entries: FleetEntry[] = [
      makeEntry({ fullName: "owner/repo1", shortName: "repo1" }),
      makeEntry({ fullName: "owner/repo2", shortName: "repo2" }),
      makeEntry({ fullName: "owner/repo3", shortName: "repo3" }),
    ];

    const selection = selectByFlag(entries, { repo: ["owner/repo1", "owner/repo2"] });
    expect(selection).not.toBeNull();
    expect(selection!.entries).toHaveLength(2);
    expect(selection!.source).toEqual({
      kind: "explicit",
      repos: ["owner/repo1", "owner/repo2"],
    });

    const results: SyncResult[] = [];
    for (const entry of selection!.entries) {
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
      selection: selection!,
      results,
      interrupted: false,
    };

    const summary = summarise(session);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(exitCode(session)).toBe(0);

    // Exactly 2 sync attempts
    expect(mockCreatePullRequest).toHaveBeenCalledTimes(2);
  });

  // ── 3. --filter "myorg/*" --mode patch ─────────────────────────────

  it("fleet sync --filter 'myorg/*': only matching repos synced", async () => {
    const entries: FleetEntry[] = [
      makeEntry({ fullName: "myorg/repo-a", shortName: "repo-a" }),
      makeEntry({ fullName: "myorg/repo-b", shortName: "repo-b" }),
      makeEntry({ fullName: "otherorg/repo-c", shortName: "repo-c" }),
      makeEntry({ fullName: "myorg/repo-d", shortName: "repo-d" }),
    ];

    const selection = selectByFlag(entries, { filter: "myorg/*" });
    expect(selection).not.toBeNull();
    expect(selection!.entries).toHaveLength(3);
    expect(selection!.source).toEqual({ kind: "filter", pattern: "myorg/*" });

    // Only myorg repos selected
    const names = selection!.entries.map((e: FleetEntry) => e.fullName);
    expect(names).toEqual(["myorg/repo-a", "myorg/repo-b", "myorg/repo-d"]);
    expect(names).not.toContain("otherorg/repo-c");

    const results: SyncResult[] = [];
    for (const entry of selection!.entries) {
      const result = await dispatchSync(entry, "patch", {
        auth: AUTH,
        latestRef: entry.latestRef,
        patchOutputDir: "./.fleet-patches",
        fetchFn: mockFetch,
      });
      results.push(result);
    }

    const session: SyncSession = {
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      mode: "patch",
      selection: selection!,
      results,
      interrupted: false,
    };

    const summary = summarise(session);
    expect(summary.succeeded).toBe(3);
    expect(exitCode(session)).toBe(0);

    // Exactly 3 sync attempts (only myorg/*)
    expect(mockRunSyncPipeline).toHaveBeenCalledTimes(3);
  });

  // ── 4. Mutual exclusion validation ─────────────────────────────────

  it("mutual exclusion: --all + --filter returns error", () => {
    const err = validateMutualExclusion({ all: true, filter: "myorg/*" });
    expect(err).toContain("Cannot use --all with --filter");
  });

  it("mutual exclusion: --all + --repo returns error", () => {
    const err = validateMutualExclusion({ all: true, repo: ["org/repo"] });
    expect(err).toContain("Cannot use --all with --repo");
  });

  it("mutual exclusion: --filter + --repo returns error", () => {
    const err = validateMutualExclusion({ filter: "myorg/*", repo: ["org/repo"] });
    expect(err).toContain("Cannot use --repo with --filter");
  });
});
