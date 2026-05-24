/**
 * Benchmark test for `fleet list`.
 * Enforces SC-001: 20 repos must complete discovery + render within 5s.
 * With mocked fetch the overhead should be <100ms — this catches N+1 patterns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discoverFleet } from "../../../src/core/fleet/discovery.js";
import { renderFleetTable, renderFleetJson } from "../../../src/core/fleet/table.js";
import type { FleetConfig } from "../../../src/core/fleet/types.js";

// ── Helpers ─────────────────────────────────────────────────────────

const AUTH = "ghp_benchtoken";
const REPO_COUNT = 20;

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function base64Encode(obj: object): string {
  return btoa(JSON.stringify(obj));
}

function generateRepos(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    full_name: `bench-org/repo-${String(i + 1).padStart(2, "0")}`,
    name: `repo-${String(i + 1).padStart(2, "0")}`,
    default_branch: "main",
    archived: false,
    disabled: false,
  }));
}

const BENCH_CONFIG: FleetConfig = {
  scope: { includeOwnRepos: false, orgs: ["bench-org"], filter: undefined },
  defaultSyncMode: "pr",
  patchOutputDir: "./.fleet-patches",
  discoveryConcurrency: 5,
};

/**
 * Creates a fetch mock that returns REPO_COUNT repos, all with lockfiles.
 * Every repo has a valid lockfile and a commit date.
 */
function createBenchMock() {
  const repos = generateRepos(REPO_COUNT);

  return vi.fn(async (url: string | URL) => {
    const u = url.toString();

    // Latest release
    if (u.includes("/releases/latest")) {
      return mockResponse({ tag_name: "v0.4.0" });
    }

    // User repos — empty (includeOwnRepos is false)
    if (u.includes("/user/repos")) {
      return mockResponse([]);
    }

    // Org repos — return 20 repos
    if (u.includes("/orgs/bench-org/repos")) {
      return mockResponse(repos);
    }

    // Lockfile contents — return valid lockfile for every repo
    if (u.includes("/contents/helpers-lock.json")) {
      return mockResponse({
        content: base64Encode({ ref: "v0.3.0", source: "github:UnderUndre/ai" }),
        encoding: "base64",
      });
    }

    // Commits for lockfile
    if (u.includes("/commits?")) {
      return mockResponse([
        { commit: { author: { date: "2026-05-01T12:00:00Z" } } },
      ]);
    }

    return mockResponse([], 200);
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("fleet list benchmark", () => {
  beforeEach(() => {
    process.env.GH_TOKEN = AUTH;
  });

  afterEach(() => {
    delete process.env.GH_TOKEN;
    vi.restoreAllMocks();
  });

  it("lists 20 repos within 5 seconds", async () => {
    const fetchMock = createBenchMock();

    const start = Date.now();

    // Discovery pipeline
    const entries = await discoverFleet(BENCH_CONFIG, AUTH, fetchMock as typeof fetch);

    // Table render
    const table = renderFleetTable(entries, { noColor: true, scopeInfo: "bench-org" });
    expect(table.length).toBeGreaterThan(0);

    // JSON render
    const json = renderFleetJson(entries);
    expect(json.length).toBeGreaterThan(0);

    const elapsed = Date.now() - start;

    // Must discover all 20 repos
    expect(entries).toHaveLength(REPO_COUNT);

    // Must complete within 5 seconds (SC-001)
    expect(elapsed).toBeLessThan(5000);

    // Sanity: no N+1 — fetch should be called a bounded number of times
    // 1 (release) + 1 (org repos) + 20 (lockfiles) + 20 (commits) = 42 max
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(50);
  });
});
