/**
 * GitHub REST API v3 wrapper for Fleet Sync.
 * Contract: specs/003-fleet-sync/contracts/github-api-surface.md
 */

import { resolveAuth } from "../fetch.js";
import { FleetError } from "./types.js";
import { createConsola } from "consola";

const log = createConsola().withTag("fleet");

const GITHUB_API = "https://api.github.com";

// ── Types ───────────────────────────────────────────────────────────

interface GitHubRepo {
  full_name: string;
  name: string;
  default_branch: string;
  archived: boolean;
  disabled: boolean;
}

interface LockfileContent {
  ref: string;
  source: string;
}

interface PullRequestParams {
  title: string;
  body: string;
  head: string;
  base: string;
}

interface PullRequest {
  html_url: string;
  number: number;
}

// ── Internal helpers ────────────────────────────────────────────────

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function headers(auth: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${auth}`,
    "User-Agent": "clai-helpers",
  };
}

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the next page URL from the Link header.
 */
function parseNextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match?.[1];
}

/**
 * Core request wrapper with error mapping, rate-limit handling, and retries.
 */
async function githubRequest(
  url: string,
  auth: string,
  fetchFn: FetchLike,
  method: string = "GET",
  body?: unknown,
): Promise<Response> {
  const maxRetries = 3;
  let lastError: FleetError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetchFn(url, {
      method,
      headers: {
        ...headers(auth),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Rate-limit awareness: warn if remaining is low
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining !== null && Number(remaining) < 50) {
      log.warn(`Rate limit low: ${remaining} requests remaining`);
    }

    // Success
    if (response.ok) return response;

    // 401 → auth/missing
    if (response.status === 401) {
      throw new FleetError("auth/missing", "Authentication required. Set GH_TOKEN or run `gh auth login`.");
    }

    // 403 handling
    if (response.status === 403) {
      const isRateLimited =
        remaining === "0" ||
        response.headers.get("retry-after") !== null;

      if (isRateLimited) {
        const retryAfter = response.headers.get("retry-after");
        const resetHeader = response.headers.get("x-ratelimit-reset");
        let waitMs: number;

        if (retryAfter !== null) {
          waitMs = Math.min(Number(retryAfter) * 1000, 60_000);
        } else if (resetHeader !== null) {
          const resetAt = Number(resetHeader) * 1000;
          waitMs = Math.min(resetAt - Date.now(), 60_000);
        } else {
          waitMs = 2000 * Math.pow(2, attempt);
        }

        if (waitMs > 60_000 || attempt >= maxRetries) {
          throw new FleetError("github/rate-limited", "GitHub API rate limit exceeded. Retry later.");
        }

        log.warn(`Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retry (${attempt + 1}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }

      // 403 without rate-limit headers → insufficient scope
      throw new FleetError("auth/insufficient-scope", "Token lacks required scope for this operation.");
    }

    // 404
    if (response.status === 404) {
      throw new FleetError("github/repo-not-found", `Repository not found: ${url}`);
    }

    // 5xx → retry once then throw
    if (response.status >= 500) {
      if (attempt < 1) {
        const backoff = 2000 * Math.pow(2, attempt);
        log.warn(`Server error ${response.status}. Retrying in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw new FleetError("github/network", `GitHub server error: ${response.status}`);
    }

    // Other errors
    throw new FleetError("github/api-error", `GitHub API error: ${response.status} ${response.statusText}`);
  }

  // Should not reach here, but just in case
  throw lastError ?? new FleetError("github/api-error", "Unexpected error in GitHub API request");
}

/**
 * Paginate through GitHub list endpoints following Link rel="next".
 */
async function paginate<T>(
  url: string,
  auth: string,
  fetchFn: FetchLike,
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const response = await githubRequest(nextUrl, auth, fetchFn);
    const page = (await response.json()) as T[];
    results.push(...page);

    const linkHeader = response.headers.get("link");
    nextUrl = parseNextLink(linkHeader);
  }

  return results;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Resolve auth token. Uses resolveAuth() from core/fetch.ts.
 */
export function resolveFleetAuth(): string {
  const token = resolveAuth();
  if (!token) {
    throw new FleetError("auth/missing", "No GitHub token found. Set GH_TOKEN or run `gh auth login`.");
  }
  return token;
}

/**
 * List repos owned by the authenticated user.
 * GET /user/repos?affiliation=owner&per_page=100
 */
export async function listReposForUser(
  auth: string,
  fetchFn: FetchLike = globalThis.fetch,
): Promise<GitHubRepo[]> {
  return paginate<GitHubRepo>(
    `${GITHUB_API}/user/repos?affiliation=owner&per_page=100`,
    auth,
    fetchFn,
  );
}

/**
 * List repos for an org.
 * GET /orgs/{org}/repos?type=all&per_page=100
 */
export async function listReposForOrg(
  org: string,
  auth: string,
  fetchFn: FetchLike = globalThis.fetch,
): Promise<GitHubRepo[]> {
  return paginate<GitHubRepo>(
    `${GITHUB_API}/orgs/${org}/repos?type=all&per_page=100`,
    auth,
    fetchFn,
  );
}

/**
 * Read helpers-lock.json from a repo, decode and parse.
 * GET /repos/{owner}/{repo}/contents/helpers-lock.json?ref={branch}
 */
export async function readLockfile(
  owner: string,
  repo: string,
  branch: string,
  auth: string,
  fetchFn: FetchLike = globalThis.fetch,
): Promise<LockfileContent> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/helpers-lock.json?ref=${branch}`;
  const response = await githubRequest(url, auth, fetchFn);

  const data = (await response.json()) as {
    content: string;
    encoding: string;
  };

  if (data.encoding !== "base64" || !data.content) {
    throw new FleetError("lockfile/malformed", `Unexpected encoding or empty content in ${owner}/${repo}`);
  }

  // GitHub Base64 includes newlines — strip them before decoding
  const decoded = atob(data.content.replace(/\n/g, ""));

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new FleetError("lockfile/malformed", `helpers-lock.json in ${owner}/${repo} is not valid JSON`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("ref" in parsed) ||
    !("source" in parsed) ||
    typeof (parsed as Record<string, unknown>).ref !== "string" ||
    typeof (parsed as Record<string, unknown>).source !== "string"
  ) {
    throw new FleetError("lockfile/malformed", `helpers-lock.json in ${owner}/${repo} missing 'ref' or 'source'`);
  }

  return {
    ref: (parsed as Record<string, unknown>).ref as string,
    source: (parsed as Record<string, unknown>).source as string,
  };
}

/**
 * Get the most recent commit date for a path.
 * GET /repos/{owner}/{repo}/commits?path={path}&per_page=1
 */
export async function readLastCommitForPath(
  owner: string,
  repo: string,
  path: string,
  auth: string,
  fetchFn: FetchLike = globalThis.fetch,
): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`;
  const response = await githubRequest(url, auth, fetchFn);

  const commits = (await response.json()) as Array<{
    commit: { author: { date: string } };
  }>;

  if (commits.length === 0) return null;
  return commits[0]!.commit.author.date;
}

/**
 * Get the default branch for a repo.
 * GET /repos/{owner}/{repo}
 */
export async function getDefaultBranch(
  owner: string,
  repo: string,
  auth: string,
  fetchFn: FetchLike = globalThis.fetch,
): Promise<string> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}`;
  const response = await githubRequest(url, auth, fetchFn);

  const data = (await response.json()) as { default_branch: string };
  return data.default_branch;
}

/**
 * Get the latest release tag for a repo.
 * GET /repos/{owner}/{repo}/releases/latest
 */
export async function getLatestRelease(
  owner: string,
  repo: string,
  auth: string,
  fetchFn: FetchLike = globalThis.fetch,
): Promise<string> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/releases/latest`;
  const response = await githubRequest(url, auth, fetchFn);

  const data = (await response.json()) as { tag_name: string };
  return data.tag_name;
}

/**
 * Find an open pull request for a given branch.
 * GET /repos/{owner}/{repo}/pulls?head={owner}:{branchName}&state=open
 */
export async function findOpenPullRequest(
  owner: string,
  repo: string,
  branchName: string,
  auth: string,
  fetchFn: FetchLike = globalThis.fetch,
): Promise<PullRequest | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?head=${owner}:${encodeURIComponent(branchName)}&state=open`;
  const response = await githubRequest(url, auth, fetchFn);

  const pulls = (await response.json()) as PullRequest[];
  if (pulls.length === 0) return null;
  return pulls[0]!;
}

/**
 * Create a pull request.
 * POST /repos/{owner}/{repo}/pulls
 */
export async function createPullRequest(
  owner: string,
  repo: string,
  params: PullRequestParams,
  auth: string,
  fetchFn: FetchLike = globalThis.fetch,
): Promise<PullRequest> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls`;
  const response = await githubRequest(url, auth, fetchFn, "POST", params);

  return (await response.json()) as PullRequest;
}

// Re-export types for convenience
export type { GitHubRepo, LockfileContent, PullRequestParams, PullRequest };
