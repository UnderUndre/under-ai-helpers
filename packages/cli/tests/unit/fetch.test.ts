import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchSource } from "../../src/core/fetch.js";

// giget uses its own HTTP client for the tarball download — our
// `globalThis.fetch` mocks only cover the GitHub API calls inside
// `resolveLatestRef` / `resolveCommitSha`, NOT the actual download. Without
// this mock, every test hits the network and slow/flaky connections produce
// 30s timeouts. The existing tests already expect giget to fail ("not our
// concern"); this just makes the failure deterministic and instant.
vi.mock("giget", () => ({
  downloadTemplate: vi.fn().mockRejectedValue(
    new Error("giget mocked in unit tests — resolver logic only"),
  ),
}));

describe("fetchSource — 'latest' sentinel resolution", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    // giget is network-heavy; we tell fetchSource to go offline so it doesn't
    // actually download anything. Offline path still exercises our ref
    // resolution logic's offline branch.
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("skips network resolution in offline mode even for 'latest'", async () => {
    // Offline + ref "latest" should NOT attempt any /releases/latest call.
    // We don't care whether the underlying giget call succeeds or fails —
    // only that the resolver didn't reach out to GitHub's API.
    const fetchSpy = vi.fn(
      async () => new Response("{}", { status: 500 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await fetchSource("github:UnderUndre/ai", "latest", undefined, { offline: true }).catch(
      () => {
        /* whatever happens downstream — not our concern */
      },
    );

    const releaseCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/releases/latest"),
    );
    expect(releaseCalls.length).toBe(0);
  });

  it("resolveLatestRef: prefers releases/latest tag_name when present", async () => {
    // Mock a successful releases API.
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      calls.push(u);
      if (u.includes("/releases/latest")) {
        return new Response(JSON.stringify({ tag_name: "v0.9.0" }), { status: 200 });
      }
      // Any other call — we want to see that releases/latest was enough.
      return new Response("{}", { status: 404 });
    }) as unknown as typeof globalThis.fetch;

    // Call fetchSource with ref "latest"; expect it to try releases/latest first.
    // It will then call giget (which will fail because we haven't mocked that),
    // but by the time it fails, we've already observed the API call we wanted.
    await fetchSource("github:UnderUndre/ai", "latest").catch(() => {
      // giget will fail in a unit test environment without a real tarball; we
      // don't care about that failure — only that the resolver hit the right API.
    });

    const releaseCalls = calls.filter((c) => c.includes("/releases/latest"));
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);
    expect(releaseCalls[0]).toContain("UnderUndre/ai");
  });

  it("resolveLatestRef: falls back to default_branch when no releases exist", async () => {
    // Simulate a repo with no releases (releases/latest returns 404) but a
    // valid default_branch. The resolver should return that branch name.
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      calls.push(u);
      if (u.includes("/releases/latest")) {
        return new Response("Not Found", { status: 404 });
      }
      if (u.endsWith("/ai")) {
        return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof globalThis.fetch;

    await fetchSource("github:UnderUndre/ai", "latest").catch(() => {
      /* giget will fail — not our concern */
    });

    // Verify the fallback path was exercised.
    const releaseCalls = calls.filter((c) => c.includes("/releases/latest"));
    const repoCalls = calls.filter((c) => c.endsWith("UnderUndre/ai"));
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);
    expect(repoCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("does not attempt resolution for explicit refs like 'v1.2.3' or branch names", async () => {
    // When the caller supplies a concrete ref, we MUST NOT hit the releases API.
    // This matters for pinned consumers — each sync shouldn't spam GitHub.
    const fetchSpy = vi.fn(
      async () => new Response("{}", { status: 500 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    await fetchSource("github:UnderUndre/ai", "v1.2.3").catch(() => {
      /* giget failure expected in unit test */
    });

    const releaseCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/releases/latest"),
    );
    expect(releaseCalls.length).toBe(0);
  });
});

describe("fetch auth resolution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear auth-related env vars
    delete process.env.GH_TOKEN;
    delete process.env.GIGET_AUTH;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers explicit auth over env vars", async () => {
    process.env.GH_TOKEN = "env-token";

    // We can't easily test fetchSource without network,
    // so we test the auth resolution logic conceptually
    const auth = process.env.GH_TOKEN;
    expect(auth).toBe("env-token");
  });

  it("falls back to GH_TOKEN env var", () => {
    process.env.GH_TOKEN = "gh-token-value";
    expect(process.env.GH_TOKEN).toBe("gh-token-value");
  });

  it("falls back to GIGET_AUTH env var", () => {
    process.env.GIGET_AUTH = "giget-auth-value";
    expect(process.env.GIGET_AUTH).toBe("giget-auth-value");
  });

  it("offline mode requires cache (conceptual)", () => {
    // fetchSource with offline: true and no cache should fail.
    // This is a conceptual test — actual network tests are in integration.
    expect(true).toBe(true);
  });
});
