import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listReposForUser,
  listReposForOrg,
  readLockfile,
  readLastCommitForPath,
  getDefaultBranch,
  getLatestRelease,
  findOpenPullRequest,
  createPullRequest,
} from "../../../src/core/fleet/github-api.js";
import { FleetError } from "../../../src/core/fleet/types.js";

// ── Helpers ─────────────────────────────────────────────────────────

const AUTH = "ghp_testtoken123";

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createFetchMock(responses: Response[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  let callIndex = 0;
  fn.mockImplementation(() => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return Promise.resolve(response);
  });
  return fn;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("github-api", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  // ── 1. Happy-path 200 ───────────────────────────────────────────

  describe("listReposForUser", () => {
    it("returns repos on 200", async () => {
      const repos = [
        { full_name: "user/repo1", name: "repo1", default_branch: "main", archived: false, disabled: false },
        { full_name: "user/repo2", name: "repo2", default_branch: "develop", archived: false, disabled: false },
      ];
      fetchMock.mockResolvedValueOnce(mockResponse(repos));
      const result = await listReposForUser(AUTH, fetchMock);
      expect(result).toEqual(repos);
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });

  // ── 2. 401 → auth/missing ───────────────────────────────────────

  it("throws auth/missing on 401", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ message: "Unauthorized" }, 401));

    try {
      await listReposForUser(AUTH, fetchMock);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FleetError);
      expect((e as FleetError).code).toBe("auth/missing");
    }
  });

  // ── 3. 403 with rate-limit headers → retry then throw ───────────

  describe("rate-limit handling", () => {
    it("throws github/rate-limited after retries exhausted", async () => {
      vi.useFakeTimers();
      const rateLimitHeaders = {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1),
      };

      // All calls return 403 rate-limited
      fetchMock.mockResolvedValue(
        mockResponse({ message: "rate limited" }, 403, rateLimitHeaders),
      );

      // Start the call — it will enter retry loop
      const promise = listReposForUser(AUTH, fetchMock);

      // Prevent unhandled rejection by attaching catch immediately
      const resultPromise = promise.then(
        () => { expect.unreachable("Should have thrown"); },
        (e: unknown) => e,
      );

      // Fast-forward through all retries
      await vi.advanceTimersByTimeAsync(30_000);

      const error = await resultPromise;
      expect(error).toBeInstanceOf(FleetError);
      expect((error as FleetError).code).toBe("github/rate-limited");

      vi.useRealTimers();
    });
  });

  // ── 4. 403 without rate-limit headers → auth/insufficient-scope ─

  it("throws auth/insufficient-scope on 403 without rate-limit headers", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ message: "Forbidden" }, 403),
    );

    try {
      await listReposForUser(AUTH, fetchMock);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as FleetError).code).toBe("auth/insufficient-scope");
    }
  });

  // ── 5. 404 → github/repo-not-found ──────────────────────────────

  it("throws github/repo-not-found on 404", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ message: "Not Found" }, 404),
    );

    try {
      await getDefaultBranch("owner", "nonexistent", AUTH, fetchMock);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect((e as FleetError).code).toBe("github/repo-not-found");
    }
  });

  // ── 6. Pagination follows rel="next" ────────────────────────────

  describe("pagination", () => {
    it("follows Link rel=next until exhausted", async () => {
      const page1 = [
        { full_name: "user/repo1", name: "repo1", default_branch: "main", archived: false, disabled: false },
      ];
      const page2 = [
        { full_name: "user/repo2", name: "repo2", default_branch: "main", archived: false, disabled: false },
      ];

      fetchMock
        .mockResolvedValueOnce(
          new Response(JSON.stringify(page1), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              link: '<https://api.github.com/user/repos?page=2>; rel="next"',
            },
          }),
        )
        .mockResolvedValueOnce(mockResponse(page2));

      const result = await listReposForUser(AUTH, fetchMock);
      expect(result).toHaveLength(2);
      expect(result[0]!.full_name).toBe("user/repo1");
      expect(result[1]!.full_name).toBe("user/repo2");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // ── 7. Malformed JSON → structured error ─────────────────────────

  it("throws on malformed JSON response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not json at all", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(listReposForUser(AUTH, fetchMock)).rejects.toThrow();
  });

  // ── 8. getLatestRelease returns tag_name ─────────────────────────

  describe("getLatestRelease", () => {
    it("returns tag_name from latest release", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ tag_name: "v0.5.0", name: "Release 0.5.0" }),
      );

      const tag = await getLatestRelease("UnderUndre", "ai", AUTH, fetchMock);
      expect(tag).toBe("v0.5.0");
    });
  });

  // ── 9. readLockfile Base64-decodes and JSON-parses ───────────────

  describe("readLockfile", () => {
    it("correctly decodes Base64 and parses JSON", async () => {
      const lockfile = { ref: "v0.4.0", source: "github:UnderUndre/under-ai-helpers" };
      const encoded = btoa(JSON.stringify(lockfile));

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          content: encoded,
          encoding: "base64",
          name: "helpers-lock.json",
          path: "helpers-lock.json",
        }),
      );

      const result = await readLockfile("owner", "repo", "main", AUTH, fetchMock);
      expect(result).toEqual({ ref: "v0.4.0", source: "github:UnderUndre/under-ai-helpers" });
    });

    it("throws lockfile/malformed on invalid JSON content", async () => {
      const encoded = btoa("not valid json");

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          content: encoded,
          encoding: "base64",
        }),
      );

      try {
        await readLockfile("owner", "repo", "main", AUTH, fetchMock);
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect((e as FleetError).code).toBe("lockfile/malformed");
      }
    });

    it("throws lockfile/malformed when ref or source missing", async () => {
      const encoded = btoa(JSON.stringify({ ref: "v0.4.0" })); // missing source

      fetchMock.mockResolvedValueOnce(
        mockResponse({
          content: encoded,
          encoding: "base64",
        }),
      );

      try {
        await readLockfile("owner", "repo", "main", AUTH, fetchMock);
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect((e as FleetError).code).toBe("lockfile/malformed");
      }
    });
  });

  // ── Additional coverage ─────────────────────────────────────────

  describe("listReposForOrg", () => {
    it("calls correct org endpoint", async () => {
      const repos = [
        { full_name: "myorg/repo1", name: "repo1", default_branch: "main", archived: false, disabled: false },
      ];
      fetchMock.mockResolvedValueOnce(mockResponse(repos));

      const result = await listReposForOrg("myorg", AUTH, fetchMock);
      expect(result).toEqual(repos);
      expect(fetchMock).toHaveBeenCalledOnce();
      const calledUrl = (fetchMock.mock.calls[0] as string[])[0] as string;
      expect(calledUrl).toContain("/orgs/myorg/repos");
    });
  });

  describe("readLastCommitForPath", () => {
    it("returns ISO date from latest commit", async () => {
      const date = "2025-01-15T10:30:00Z";
      fetchMock.mockResolvedValueOnce(
        mockResponse([{ commit: { author: { date } } }]),
      );

      const result = await readLastCommitForPath("owner", "repo", "helpers-lock.json", AUTH, fetchMock);
      expect(result).toBe(date);
    });

    it("returns null when no commits found", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse([]));

      const result = await readLastCommitForPath("owner", "repo", "helpers-lock.json", AUTH, fetchMock);
      expect(result).toBeNull();
    });
  });

  describe("getDefaultBranch", () => {
    it("returns default_branch from repo", async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({ default_branch: "develop" }),
      );

      const branch = await getDefaultBranch("owner", "repo", AUTH, fetchMock);
      expect(branch).toBe("develop");
    });
  });

  describe("findOpenPullRequest", () => {
    it("returns PR when found", async () => {
      const pr = { html_url: "https://github.com/owner/repo/pull/1", number: 1 };
      fetchMock.mockResolvedValueOnce(mockResponse([pr]));

      const result = await findOpenPullRequest("owner", "repo", "bump-branch", AUTH, fetchMock);
      expect(result).toEqual(pr);
    });

    it("returns null when no PR found", async () => {
      fetchMock.mockResolvedValueOnce(mockResponse([]));

      const result = await findOpenPullRequest("owner", "repo", "bump-branch", AUTH, fetchMock);
      expect(result).toBeNull();
    });
  });

  describe("createPullRequest", () => {
    it("creates PR and returns result", async () => {
      const params = {
        title: "chore(deps): bump clai-helpers to v0.5.0",
        body: "Automated bump",
        head: "clai-helpers-bump/v0.5.0",
        base: "main",
      };
      const created = { html_url: "https://github.com/owner/repo/pull/5", number: 5 };

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(created), { status: 201 }),
      );

      const result = await createPullRequest("owner", "repo", params, AUTH, fetchMock);
      expect(result).toEqual(created);

      // Verify POST was used
      const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(callArgs[1]!.method).toBe("POST");
    });
  });

  // ── 5xx retry ───────────────────────────────────────────────────

  describe("server errors", () => {
    it("retries once on 5xx then succeeds", async () => {
      const repos = [
        { full_name: "user/repo1", name: "repo1", default_branch: "main", archived: false, disabled: false },
      ];

      fetchMock
        .mockResolvedValueOnce(mockResponse({ message: "Internal Server Error" }, 500))
        .mockResolvedValueOnce(mockResponse(repos));

      vi.useFakeTimers();
      const promise = listReposForUser(AUTH, fetchMock);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result).toEqual(repos);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });
});
