/**
 * Fleet discovery orchestrator.
 * Enumerates repos, filters by lockfile presence, builds FleetEntry[].
 */

import { createConsola } from "consola";
import type { FleetConfig, FleetEntry, RepoState } from "./types.js";
import { FleetError } from "./types.js";
import {
  listReposForUser,
  listReposForOrg,
  readLockfile,
  readLastCommitForPath,
  getLatestRelease,
} from "./github-api.js";
import type { GitHubRepo } from "./github-api.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
import { matchGlob } from "../glob.js";

const log = createConsola().withTag("fleet");

// ── Concurrency pool ────────────────────────────────────────────────

async function pool<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(() => {
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

// ── Repo deduplication ──────────────────────────────────────────────

function dedupeRepos(repos: GitHubRepo[]): GitHubRepo[] {
  const seen = new Set<string>();
  return repos.filter((repo) => {
    if (seen.has(repo.full_name)) return false;
    seen.add(repo.full_name);
    return true;
  });
}

// ── Glob filter ─────────────────────────────────────────────────────

function matchesFilter(fullName: string, filter: string | undefined): boolean {
  if (!filter) return true;
  return matchGlob(filter, fullName);
}

// ── Repo state mapping ──────────────────────────────────────────────

function resolveRepoState(repo: GitHubRepo): RepoState {
  if (repo.archived) return "archived";
  if (repo.disabled) return "disabled";
  return "active";
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Discover all GitHub repos with clai-helpers installed.
 *
 * Steps:
 * 1. Resolve latest clai-helpers release ONCE
 * 2. Enumerate repos from user + orgs
 * 3. Apply glob filter
 * 4. For each repo, check lockfile presence + read contents
 * 5. Fetch last commit date for lockfile
 * 6. Build FleetEntry[] sorted by fullName
 */
export async function discoverFleet(
  config: FleetConfig,
  auth: string,
  fetchFn: FetchLike = globalThis.fetch as FetchLike,
): Promise<FleetEntry[]> {
  // Step 1: Resolve latest release once
  let latestRef: string;
  try {
    latestRef = await getLatestRelease("UnderUndre", "ai", auth, fetchFn);
  } catch (e) {
    // If we can't resolve latest release, use "unknown" — drift will show true
    log.warn("Failed to resolve latest clai-helpers release:", e instanceof Error ? e.message : String(e));
    latestRef = "unknown";
  }

  // Step 2: Enumerate repos
  const allRepos: GitHubRepo[] = [];

  if (config.scope.includeOwnRepos) {
    try {
      const userRepos = await listReposForUser(auth, fetchFn);
      allRepos.push(...userRepos);
    } catch (e) {
      if (e instanceof FleetError && e.code === "github/rate-limited") throw e;
      log.warn("Failed to enumerate user repos:", e instanceof Error ? e.message : String(e));
    }
  }

  for (const org of config.scope.orgs) {
    try {
      const orgRepos = await listReposForOrg(org, auth, fetchFn);
      allRepos.push(...orgRepos);
    } catch (e) {
      if (e instanceof FleetError && e.code === "github/rate-limited") throw e;
      log.warn(`Failed to enumerate org "${org}" repos:`, e instanceof Error ? e.message : String(e));
    }
  }

  // Deduplicate (user might be org member)
  const repos = dedupeRepos(allRepos);

  // Step 3: Apply glob filter
  const filtered = repos.filter((repo) => matchesFilter(repo.full_name, config.scope.filter));

  // Step 4-6: For each repo, check lockfile + build entry
  const entries: FleetEntry[] = [];
  const entriesLock = { push: (entry: FleetEntry) => entries.push(entry) };

  await pool(
    filtered,
    async (repo) => {
      const state = resolveRepoState(repo);

      // Attempt to read lockfile
      let pinnedRef = "";
      let pinnedSource = "";
      let hasLockfile = false;
      let unreadableReason: string | null = null;

      try {
        const lockfile = await readLockfile(
          repo.full_name.split("/")[0]!,
          repo.name,
          repo.default_branch,
          auth,
          fetchFn,
        );
        pinnedRef = lockfile.ref;
        pinnedSource = lockfile.source;
        hasLockfile = true;
      } catch (e) {
        if (e instanceof FleetError) {
          if (e.code === "github/repo-not-found") {
            // 404 on lockfile → repo doesn't have helpers-lock.json → skip
            return;
          }
          // Other errors → mark as unreadable
          unreadableReason = e.message;
        } else {
          unreadableReason = e instanceof Error ? e.message : String(e);
        }

        // Still include unreadable entries
        entriesLock.push({
          fullName: repo.full_name,
          shortName: repo.name,
          defaultBranch: repo.default_branch,
          pinnedRef: "",
          pinnedSource: "",
          latestRef,
          hasDrift: true,
          lastSyncAt: null,
          state: "unreadable",
          unreadableReason,
        });
        return;
      }

      if (!hasLockfile) return;

      // Fetch last commit date for lockfile
      let lastSyncAt: string | null = null;
      try {
        lastSyncAt = await readLastCommitForPath(
          repo.full_name.split("/")[0]!,
          repo.name,
          "helpers-lock.json",
          auth,
          fetchFn,
        );
      } catch {
        // Non-critical: just leave null
      }

      const hasDrift = pinnedRef !== latestRef;

      entriesLock.push({
        fullName: repo.full_name,
        shortName: repo.name,
        defaultBranch: repo.default_branch,
        pinnedRef,
        pinnedSource,
        latestRef,
        hasDrift,
        lastSyncAt,
        state,
        unreadableReason: null,
      });
    },
    config.discoveryConcurrency,
  );

  // Sort by fullName
  entries.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return entries;
}
