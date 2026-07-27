/**
 * Integration tests for `fleet list` command.
 * Tests the full pipeline: auth → config → discovery → render.
 * Mocks GitHub API at the fetch level.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FleetError } from "../../../src/core/fleet/types.js";
import type { FleetConfig, FleetEntry } from "../../../src/core/fleet/types.js";
import { discoverFleet } from "../../../src/core/fleet/discovery.js";
import { renderFleetTable, renderFleetJson } from "../../../src/core/fleet/table.js";
import { resolveFleetAuth } from "../../../src/core/fleet/github-api.js";

// ── Helpers ─────────────────────────────────────────────────────────

const AUTH = "ghp_testtoken123";
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function base64Encode(obj: object): string {
  return btoa(JSON.stringify(obj));
}

const TEST_CONFIG: FleetConfig = {
  scope: { includeOwnRepos: true, orgs: ["myorg"], filter: undefined },
  defaultSyncMode: "pr",
  patchOutputDir: "./.fleet-patches",
  discoveryConcurrency: 5,
};

/**
 * Creates a fetch mock that handles the full fleet discovery flow.
 * Returns 3 repos across user + 1 org.
 */
function createHappyPathMock() {
  return vi.fn(async (url: string | URL) => {
    const u = url.toString();

    if (u.includes("/releases/latest")) {
      return mockResponse({ tag_name: "v0.4.0" });
    }
    if (u.includes("/user/repos")) {
      return mockResponse([
        { full_name: "testuser/project-a", name: "project-a", default_branch: "main", archived: false, disabled: false },
        { full_name: "testuser/project-b", name: "project-b", default_branch: "develop", archived: false, disabled: false },
      ]);
    }
    if (u.includes("/orgs/myorg/repos")) {
      return mockResponse([
        { full_name: "myorg/shared-lib", name: "shared-lib", default_branch: "main", archived: false, disabled: false },
      ]);
    }
    if (u.includes("/contents/helpers-lock.json")) {
      if (u.includes("project-a")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.3.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      if (u.includes("project-b")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.4.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      if (u.includes("shared-lib")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.3.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      return mockResponse({ message: "Not Found" }, 404);
    }
    if (u.includes("/commits?")) {
      return mockResponse([{ commit: { author: { date: "2026-01-15T10:30:00Z" } } }]);
    }
    return mockResponse([], 200);
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("fleet list (integration)", () => {
  beforeEach(() => {
    process.env.GH_TOKEN = AUTH;
  });

  afterEach(() => {
    delete process.env.GH_TOKEN;
    vi.restoreAllMocks();
  });

  // ── 1. --json with 3 repos across user + 1 org ────────────────────

  it("produces JSON array of 3 FleetEntry objects", async () => {
    const fetchMock = createHappyPathMock();

    const entries = await discoverFleet(TEST_CONFIG, AUTH, fetchMock as typeof globalThis.fetch);
    const json = renderFleetJson(entries);
    const parsed = JSON.parse(json) as FleetEntry[];

    expect(parsed).toHaveLength(3);

    const names = parsed.map((e) => e.fullName).sort();
    expect(names).toEqual(["myorg/shared-lib", "testuser/project-a", "testuser/project-b"]);

    // Verify required keys
    const requiredKeys: (keyof FleetEntry)[] = [
      "fullName", "shortName", "defaultBranch", "pinnedRef",
      "pinnedSource", "latestRef", "hasDrift", "lastSyncAt",
      "state", "unreadableReason",
    ];
    for (const key of requiredKeys) {
      expect(key in parsed[0]!).toBe(true);
    }

    // Verify drift
    const projectA = parsed.find((e) => e.fullName === "testuser/project-a");
    expect(projectA!.hasDrift).toBe(true);
    const projectB = parsed.find((e) => e.fullName === "testuser/project-b");
    expect(projectB!.hasDrift).toBe(false);
  });

  // ── 2. --no-color → ANSI-free table output ────────────────────────

  it("produces ANSI-free table output with noColor", async () => {
    const fetchMock = createHappyPathMock();

    const entries = await discoverFleet(TEST_CONFIG, AUTH, fetchMock as typeof globalThis.fetch);
    const output = renderFleetTable(entries, { noColor: true });

    expect(ANSI_RE.test(output)).toBe(false);
    expect(output).toContain("project-a");
    expect(output).toContain("project-b");
    expect(output).toContain("shared-lib");
  });

  // ── 3. Missing auth → FleetError auth/missing ─────────────────────

  it("throws FleetError auth/missing when no token", async () => {
    // Clear all auth env vars
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GIGET_AUTH;

    // Mock resolveAuth to return undefined (no gh CLI available either)
    const fetchModule = await import("../../../src/core/fetch.js");
    const authSpy = vi.spyOn(fetchModule, "resolveAuth").mockReturnValue(undefined);

    expect(() => resolveFleetAuth()).toThrow(FleetError);
    try {
      resolveFleetAuth();
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("auth/missing");
      expect((e as FleetError).message).toContain("auth");
    }

    authSpy.mockRestore();
  });

  // ── 4. Rate-limited → FleetError github/rate-limited ──────────────

  it("throws FleetError github/rate-limited when rate limited", async () => {
    // Use retry-after=0 so retries exhaust instantly
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (u.includes("/user/repos")) {
        return mockResponse({ message: "rate limited" }, 403, {
          "x-ratelimit-remaining": "0",
          "retry-after": "0",
        });
      }
      return mockResponse([], 200);
    });

    const noOrgsConfig: FleetConfig = {
      ...TEST_CONFIG,
      scope: { includeOwnRepos: true, orgs: [], filter: undefined },
    };

    await expect(
      discoverFleet(noOrgsConfig, AUTH, fetchMock as typeof globalThis.fetch),
    ).rejects.toThrow(FleetError);

    try {
      await discoverFleet(noOrgsConfig, AUTH, fetchMock as typeof globalThis.fetch);
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("github/rate-limited");
      expect((e as FleetError).message).toMatch(/rate/i);
    }
  });

  // ── 5. Empty fleet → "no projects found" message ──────────────────

  it("shows 'no projects found' when no repos have lockfile", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (u.includes("/user/repos")) {
        return mockResponse([
          { full_name: "testuser/no-lock", name: "no-lock", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      if (u.includes("/contents/helpers-lock.json")) {
        return mockResponse({ message: "Not Found" }, 404);
      }
      return mockResponse([], 200);
    });

    const emptyConfig: FleetConfig = {
      ...TEST_CONFIG,
      scope: { includeOwnRepos: true, orgs: [], filter: undefined },
    };

    const entries = await discoverFleet(emptyConfig, AUTH, fetchMock as typeof globalThis.fetch);
    const output = renderFleetTable(entries, { scopeInfo: "user" });

    expect(entries).toHaveLength(0);
    expect(output).toContain("No clai-helpers projects found");
  });
});
