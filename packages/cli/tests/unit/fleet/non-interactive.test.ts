/**
 * Unit tests for non-interactive selection logic.
 * Tests selectByFlag, validateMutualExclusion, and add-org/remove-org config mutations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FleetEntry } from "../../../src/core/fleet/types.js";
import { FleetError } from "../../../src/core/fleet/types.js";

// ── Import selection logic ────────────────────────────────────────────

const { selectByFlag, validateMutualExclusion } = await import(
  "../../../src/cli/fleet/sync.js"
);

// ── Import config functions ───────────────────────────────────────────

const mockLoadConfig = vi.fn();
const mockExistsSync = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock("c12", () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

const originalAppData = process.env.APPDATA;
const originalXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APPDATA = "/test/appdata";
  delete process.env.XDG_CONFIG_HOME;
});

import { afterAll } from "vitest";
afterAll(() => {
  process.env.APPDATA = originalAppData;
  if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
});

const { addOrg, removeOrg } = await import(
  "../../../src/core/fleet/config.js"
);

// ── Test fixtures ─────────────────────────────────────────────────────

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

const SAMPLE_ENTRIES: FleetEntry[] = [
  makeEntry({ fullName: "myorg/repo-a", shortName: "repo-a" }),
  makeEntry({ fullName: "myorg/repo-b", shortName: "repo-b" }),
  makeEntry({ fullName: "myorg/repo-c", shortName: "repo-c" }),
  makeEntry({ fullName: "otherorg/repo-d", shortName: "repo-d", state: "archived" }),
  makeEntry({ fullName: "otherorg/repo-e", shortName: "repo-e", state: "disabled" }),
];

// ── Selection tests ──────────────────────────────────────────────────

describe("non-interactive selection", () => {
  // 1. --all selects only active entries
  it("--all selects only entries with state === 'active'", () => {
    const result = selectByFlag(SAMPLE_ENTRIES, { all: true });

    expect(result).not.toBeNull();
    expect(result!.source).toEqual({ kind: "all" });
    expect(result!.entries).toHaveLength(3);
    expect(result!.entries.every((e) => e.state === "active")).toBe(true);
    expect(result!.entries.map((e) => e.fullName)).toEqual([
      "myorg/repo-a",
      "myorg/repo-b",
      "myorg/repo-c",
    ]);
  });

  // 2. --filter matches subset
  it("--filter 'myorg/*' matches subset of repos", () => {
    const result = selectByFlag(SAMPLE_ENTRIES, { filter: "myorg/*" });

    expect(result).not.toBeNull();
    expect(result!.source).toEqual({ kind: "filter", pattern: "myorg/*" });
    expect(result!.entries).toHaveLength(3);
    expect(result!.entries.map((e) => e.fullName)).toEqual([
      "myorg/repo-a",
      "myorg/repo-b",
      "myorg/repo-c",
    ]);
  });

  // 3. --repo nonexistent → error
  it("--repo nonexistent/foo throws 'not found' error", () => {
    expect(() =>
      selectByFlag(SAMPLE_ENTRIES, { repo: ["nonexistent/foo"] })
    ).toThrow("Repo 'nonexistent/foo' not found in fleet.");
  });

  // 4. --all + --filter → mutual exclusion
  it("combining --all --filter → mutual exclusion error", () => {
    const err = validateMutualExclusion({ all: true, filter: "myorg/*" });
    expect(err).toContain("Cannot use --all with --filter");
  });

  // 5. --all + --repo → mutual exclusion
  it("combining --all --repo → mutual exclusion error", () => {
    const err = validateMutualExclusion({ all: true, repo: ["myorg/repo-a"] });
    expect(err).toContain("Cannot use --all with --repo");
  });

  // 6. --filter + --repo → mutual exclusion
  it("combining --filter --repo → mutual exclusion error", () => {
    const err = validateMutualExclusion({ filter: "myorg/*", repo: ["myorg/repo-a"] });
    expect(err).toContain("Cannot use --repo with --filter");
  });

  // 7. No flags → null (needs interactive picker)
  it("no flags returns null (needs interactive picker)", () => {
    const result = selectByFlag(SAMPLE_ENTRIES, {});
    expect(result).toBeNull();
  });

  // 8. --repo with valid repos
  it("--repo with valid repos selects exactly those repos", () => {
    const result = selectByFlag(SAMPLE_ENTRIES, {
      repo: ["myorg/repo-a", "myorg/repo-c"],
    });

    expect(result).not.toBeNull();
    expect(result!.source).toEqual({
      kind: "explicit",
      repos: ["myorg/repo-a", "myorg/repo-c"],
    });
    expect(result!.entries).toHaveLength(2);
    expect(result!.entries.map((e) => e.fullName)).toEqual([
      "myorg/repo-a",
      "myorg/repo-c",
    ]);
  });

  // 9. --repo with mix of valid and invalid → error on first missing
  it("--repo with one valid and one invalid throws on the invalid", () => {
    expect(() =>
      selectByFlag(SAMPLE_ENTRIES, { repo: ["myorg/repo-a", "bogus/repo"] })
    ).toThrow("Repo 'bogus/repo' not found in fleet.");
  });

  // 10. All three flags → mutual exclusion (first two reported)
  it("all three flags → mutual exclusion error", () => {
    const err = validateMutualExclusion({
      all: true,
      filter: "myorg/*",
      repo: ["myorg/repo-a"],
    });
    expect(err).toContain("Cannot use");
  });
});

// ── add-org / remove-org config mutation tests ───────────────────────

describe("add-org config mutation", () => {
  const BASE_CONFIG = {
    scope: { includeOwnRepos: true, orgs: ["existing-org"], filter: undefined },
    defaultSyncMode: "pr",
    patchOutputDir: "./.fleet-patches",
    discoveryConcurrency: 5,
  };

  // 7. add-org mutates JSON preserving other fields
  it("add-org mutates the JSON file in-place preserving other fields", async () => {
    mockExistsSync.mockReturnValue(false);
    mockLoadConfig.mockResolvedValue({ config: { ...BASE_CONFIG } });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await addOrg("new-org");

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const written = JSON.parse(
      (mockWriteFile.mock.calls[0] as unknown[])[1] as string
    );
    expect(written.scope.orgs).toContain("new-org");
    expect(written.scope.orgs).toContain("existing-org");
    expect(written.defaultSyncMode).toBe("pr");
    expect(written.discoveryConcurrency).toBe(5);
  });

  // 9. add-org idempotent: already present → no duplicate
  it("add-org idempotent: already present → success, no duplicate", async () => {
    mockExistsSync.mockReturnValue(false);
    mockLoadConfig.mockResolvedValue({
      config: { ...BASE_CONFIG, scope: { ...BASE_CONFIG.scope, orgs: ["alpha", "beta"] } },
    });

    await addOrg("alpha");

    // Should NOT write — already present
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

describe("remove-org config mutation", () => {
  const BASE_CONFIG = {
    scope: { includeOwnRepos: true, orgs: ["alpha", "beta", "gamma"], filter: undefined },
    defaultSyncMode: "pr",
    patchOutputDir: "./.fleet-patches",
    discoveryConcurrency: 5,
  };

  // 8. remove-org mutates JSON preserving other fields
  it("remove-org mutates the JSON file in-place preserving other fields", async () => {
    mockExistsSync.mockReturnValue(false);
    mockLoadConfig.mockResolvedValue({ config: { ...BASE_CONFIG } });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    await removeOrg("beta");

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const written = JSON.parse(
      (mockWriteFile.mock.calls[0] as unknown[])[1] as string
    );
    expect(written.scope.orgs).toEqual(["alpha", "gamma"]);
    expect(written.defaultSyncMode).toBe("pr");
    expect(written.discoveryConcurrency).toBe(5);
  });

  // 10. remove-org idempotent: not present → no error
  it("remove-org idempotent: not present → success message, no error", async () => {
    mockExistsSync.mockReturnValue(false);
    mockLoadConfig.mockResolvedValue({
      config: { ...BASE_CONFIG, scope: { ...BASE_CONFIG.scope, orgs: ["alpha"] } },
    });

    await removeOrg("nonexistent");

    // Should NOT write — not present
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  // 11. TS-config mutation rejected with exit 2
  it("TS-config mutation rejected with FleetError config/malformed", async () => {
    mockExistsSync.mockReturnValue(true); // TS config exists

    try {
      await addOrg("some-org");
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("config/malformed");
    }

    // Same for removeOrg
    try {
      await removeOrg("some-org");
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("config/malformed");
    }
  });
});
