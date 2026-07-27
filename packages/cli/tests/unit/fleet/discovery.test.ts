import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverFleet } from "../../../src/core/fleet/discovery.js";
import type { FleetConfig } from "../../../src/core/fleet/types.js";
import { FleetError } from "../../../src/core/fleet/types.js";

// ── Helpers ─────────────────────────────────────────────────────────

const AUTH = "ghp_testtoken123";

const DEFAULT_CONFIG: FleetConfig = {
  scope: {
    includeOwnRepos: true,
    orgs: [],
    filter: undefined,
  },
  defaultSyncMode: "pr",
  patchOutputDir: "./.fleet-patches",
  discoveryConcurrency: 5,
};

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function base64Encode(obj: object): string {
  const json = JSON.stringify(obj);
  return btoa(json);
}

interface RequestLog {
  url: string;
  method: string;
}

function createFetchMock(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const log: RequestLog[] = [];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const urlStr = url.toString();
    log.push({ url: urlStr, method: init?.method ?? "GET" });
    return handler(urlStr, init);
  });
  return { fn, log };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("discoverFleet", () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let requestLog: RequestLog[];

  beforeEach(() => {
    requestLog = [];
  });

  // ── 1. Scope expansion: own user + 2 orgs ────────────────────────

  it("enumerates user repos + org repos when configured", async () => {
    const { fn, log } = createFetchMock(async (url) => {
      // Latest release
      if (url.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      // User repos
      if (url.includes("/user/repos")) {
        return mockResponse([
          { full_name: "user/repo1", name: "repo1", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      // Org1 repos
      if (url.includes("/orgs/org1/repos")) {
        return mockResponse([
          { full_name: "org1/repo2", name: "repo2", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      // Org2 repos
      if (url.includes("/orgs/org2/repos")) {
        return mockResponse([
          { full_name: "org2/repo3", name: "repo3", default_branch: "develop", archived: false, disabled: false },
        ]);
      }
      // Lockfile reads — all 404 (no lockfile)
      if (url.includes("/contents/helpers-lock.json")) {
        return mockResponse({ message: "Not Found" }, 404);
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    const config: FleetConfig = {
      ...DEFAULT_CONFIG,
      scope: { includeOwnRepos: true, orgs: ["org1", "org2"], filter: undefined },
    };

    const result = await discoverFleet(config, AUTH, fetchFn);

    // All repos enumerated
    expect(log.some((r) => r.url.includes("/user/repos"))).toBe(true);
    expect(log.some((r) => r.url.includes("/orgs/org1/repos"))).toBe(true);
    expect(log.some((r) => r.url.includes("/orgs/org2/repos"))).toBe(true);

    // No repos have lockfile → empty result
    expect(result).toEqual([]);
  });

  // ── 2. helpers-lock.json filter: 404 → repo dropped ──────────────

  it("drops repos without lockfile (404) from results", async () => {
    const { fn } = createFetchMock(async (url) => {
      if (url.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (url.includes("/user/repos")) {
        return mockResponse([
          { full_name: "user/with-lock", name: "with-lock", default_branch: "main", archived: false, disabled: false },
          { full_name: "user/no-lock", name: "no-lock", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      if (url.includes("/user/with-lock/contents/helpers-lock.json")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.3.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      if (url.includes("/user/no-lock/contents/helpers-lock.json")) {
        return mockResponse({ message: "Not Found" }, 404);
      }
      if (url.includes("/commits?")) {
        return mockResponse([{ commit: { author: { date: "2026-01-01T00:00:00Z" } } }]);
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    const result = await discoverFleet(DEFAULT_CONFIG, AUTH, fetchFn);

    expect(result).toHaveLength(1);
    expect(result[0]!.fullName).toBe("user/with-lock");
  });

  // ── 3. Archived state surfaced ────────────────────────────────────

  it("surfaces archived repos with state: 'archived'", async () => {
    const { fn } = createFetchMock(async (url) => {
      if (url.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (url.includes("/user/repos")) {
        return mockResponse([
          { full_name: "user/archived-repo", name: "archived-repo", default_branch: "main", archived: true, disabled: false },
        ]);
      }
      if (url.includes("/contents/helpers-lock.json")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.3.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      if (url.includes("/commits?")) {
        return mockResponse([]);
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    const result = await discoverFleet(DEFAULT_CONFIG, AUTH, fetchFn);

    expect(result).toHaveLength(1);
    expect(result[0]!.state).toBe("archived");
  });

  // ── 4. Unreadable lockfile populates unreadableReason ─────────────

  it("marks entry as unreadable when lockfile is malformed", async () => {
    const { fn } = createFetchMock(async (url) => {
      if (url.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (url.includes("/user/repos")) {
        return mockResponse([
          { full_name: "user/bad-lock", name: "bad-lock", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      if (url.includes("/contents/helpers-lock.json")) {
        // Return valid base64 but invalid JSON content
        return mockResponse({
          content: btoa("not valid json"),
          encoding: "base64",
        });
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    const result = await discoverFleet(DEFAULT_CONFIG, AUTH, fetchFn);

    expect(result).toHaveLength(1);
    expect(result[0]!.state).toBe("unreadable");
    expect(result[0]!.unreadableReason).toBeTruthy();
  });

  // ── 5. Rate-limit during enumeration → throws ────────────────────

  it("throws on rate-limit during repo enumeration", async () => {
    // Use retry-after=0 so the retry happens immediately but still
    // exhausts retries quickly (3 retries × 0s = fast)
    let callCount = 0;
    const { fn } = createFetchMock(async (url) => {
      if (url.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (url.includes("/user/repos")) {
        callCount++;
        // Return rate-limited with retry-after=0 to exhaust retries fast
        return mockResponse({ message: "rate limited" }, 403, {
          "x-ratelimit-remaining": "0",
          "retry-after": "0",
        });
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    await expect(discoverFleet(DEFAULT_CONFIG, AUTH, fetchFn)).rejects.toThrow(FleetError);

    try {
      await discoverFleet(DEFAULT_CONFIG, AUTH, fetchFn);
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("github/rate-limited");
    }
  });

  // ── 6. Latest release resolved exactly once ───────────────────────

  it("resolves latest release exactly once across N entries", async () => {
    let releaseCallCount = 0;
    const { fn, log } = createFetchMock(async (url) => {
      if (url.includes("/releases/latest")) {
        releaseCallCount++;
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (url.includes("/user/repos")) {
        return mockResponse([
          { full_name: "user/repo1", name: "repo1", default_branch: "main", archived: false, disabled: false },
          { full_name: "user/repo2", name: "repo2", default_branch: "main", archived: false, disabled: false },
          { full_name: "user/repo3", name: "repo3", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      if (url.includes("/contents/helpers-lock.json")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.3.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      if (url.includes("/commits?")) {
        return mockResponse([{ commit: { author: { date: "2026-01-01T00:00:00Z" } } }]);
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    const result = await discoverFleet(DEFAULT_CONFIG, AUTH, fetchFn);

    expect(result).toHaveLength(3);
    // Latest release called exactly once
    const releaseCalls = log.filter((r) => r.url.includes("/releases/latest"));
    expect(releaseCalls).toHaveLength(1);
  });

  // ── 7. Filter glob applied correctly ──────────────────────────────

  it("applies filter glob to limit repos", async () => {
    const { fn } = createFetchMock(async (url) => {
      if (url.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (url.includes("/user/repos")) {
        return mockResponse([
          { full_name: "user/repo1", name: "repo1", default_branch: "main", archived: false, disabled: false },
          { full_name: "user/repo2", name: "repo2", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      if (url.includes("/orgs/myorg/repos")) {
        return mockResponse([
          { full_name: "myorg/repo3", name: "repo3", default_branch: "main", archived: false, disabled: false },
          { full_name: "myorg/repo4", name: "repo4", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      if (url.includes("/contents/helpers-lock.json")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.3.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      if (url.includes("/commits?")) {
        return mockResponse([{ commit: { author: { date: "2026-01-01T00:00:00Z" } } }]);
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    const config: FleetConfig = {
      ...DEFAULT_CONFIG,
      scope: { includeOwnRepos: true, orgs: ["myorg"], filter: "myorg/*" },
    };

    const result = await discoverFleet(config, AUTH, fetchFn);

    // Only myorg repos should be in results
    expect(result.every((e) => e.fullName.startsWith("myorg/"))).toBe(true);
    expect(result).toHaveLength(2);
  });

  // ── 8. Empty scope → returns empty array ──────────────────────────

  it("returns empty array when no repos found", async () => {
    const { fn } = createFetchMock(async (url) => {
      if (url.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (url.includes("/user/repos")) {
        return mockResponse([]);
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    const config: FleetConfig = {
      ...DEFAULT_CONFIG,
      scope: { includeOwnRepos: true, orgs: [], filter: undefined },
    };

    const result = await discoverFleet(config, AUTH, fetchFn);

    expect(result).toEqual([]);
  });

  // ── 9. hasDrift computed correctly ────────────────────────────────

  it("computes hasDrift=true when pinned !== latest", async () => {
    const { fn } = createFetchMock(async (url) => {
      if (url.includes("/releases/latest")) {
        return mockResponse({ tag_name: "v0.4.0" });
      }
      if (url.includes("/user/repos")) {
        return mockResponse([
          { full_name: "user/old", name: "old", default_branch: "main", archived: false, disabled: false },
          { full_name: "user/current", name: "current", default_branch: "main", archived: false, disabled: false },
        ]);
      }
      if (url.includes("/user/old/contents/helpers-lock.json")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.3.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      if (url.includes("/user/current/contents/helpers-lock.json")) {
        return mockResponse({
          content: base64Encode({ ref: "v0.4.0", source: "github:UnderUndre/under-ai-helpers" }),
          encoding: "base64",
        });
      }
      if (url.includes("/commits?")) {
        return mockResponse([{ commit: { author: { date: "2026-01-01T00:00:00Z" } } }]);
      }
      return mockResponse([], 200);
    });
    fetchFn = fn;

    const result = await discoverFleet(DEFAULT_CONFIG, AUTH, fetchFn);

    expect(result).toHaveLength(2);
    const oldEntry = result.find((e) => e.shortName === "old");
    const currentEntry = result.find((e) => e.shortName === "current");

    expect(oldEntry!.hasDrift).toBe(true);
    expect(oldEntry!.pinnedRef).toBe("v0.3.0");
    expect(oldEntry!.latestRef).toBe("v0.4.0");

    expect(currentEntry!.hasDrift).toBe(false);
    expect(currentEntry!.pinnedRef).toBe("v0.4.0");
    expect(currentEntry!.latestRef).toBe("v0.4.0");
  });
});
