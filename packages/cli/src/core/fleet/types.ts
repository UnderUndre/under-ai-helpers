/**
 * Fleet Sync — Type definitions.
 * Source of truth: specs/003-fleet-sync/data-model.md
 */

// ── Repo state ──────────────────────────────────────────────────────

export type RepoState = "active" | "archived" | "disabled" | "unreadable";

// ── Fleet entry ─────────────────────────────────────────────────────

export interface FleetEntry {
  /** GitHub identifier `<owner>/<repo>`. Primary key. */
  fullName: string;
  /** Human-readable name (= `<repo>`). */
  shortName: string;
  /** Default branch name. NEVER assume `main`. */
  defaultBranch: string;
  /** Pinned ref from helpers-lock.json.ref. */
  pinnedRef: string;
  /** Source URL from helpers-lock.json.source. */
  pinnedSource: string;
  /** Latest release tag, resolved once per session. */
  latestRef: string;
  /** Computed: pinned !== latest. */
  hasDrift: boolean;
  /** ISO timestamp of last commit touching helpers-lock.json. */
  lastSyncAt: string | null;
  /** GitHub repository state. */
  state: RepoState;
  /** If state === 'unreadable', a one-line explanation. Otherwise null. */
  unreadableReason: string | null;
}

// ── Discovery scope ─────────────────────────────────────────────────

export interface DiscoveryScope {
  /** Always queries the authenticated user's own repos. Default true. */
  includeOwnRepos: boolean;
  /** Additional GitHub orgs to enumerate. */
  orgs: string[];
  /** Optional repo-fullname glob filter. */
  filter?: string;
}

// ── Sync mode ───────────────────────────────────────────────────────

export type SyncMode = "pr" | "push" | "patch";

// ── Fleet config ────────────────────────────────────────────────────

export interface FleetConfig {
  scope: DiscoveryScope;
  defaultSyncMode: SyncMode;
  patchOutputDir: string;
  discoveryConcurrency: number;
}

// ── Selection ───────────────────────────────────────────────────────

export type SelectionSource =
  | { kind: "interactive" }
  | { kind: "all" }
  | { kind: "filter"; pattern: string }
  | { kind: "explicit"; repos: string[] };

export interface Selection {
  entries: FleetEntry[];
  source: SelectionSource;
}

// ── Sync result ─────────────────────────────────────────────────────

export type SyncOutcome = "succeeded" | "failed" | "skipped" | "no-op";

export interface SyncResult {
  fullName: string;
  outcome: SyncOutcome;
  mode: SyncMode;
  refBefore?: string;
  refAfter?: string;
  prUrl?: string;
  pushedSha?: string;
  patchPath?: string;
  reason?: string;
  errorCode?: FleetErrorCode;
  durationMs: number;
}

// ── Sync session ────────────────────────────────────────────────────

export interface SyncSession {
  startedAt: string;
  endedAt: string;
  mode: SyncMode;
  selection: Selection;
  results: SyncResult[];
  interrupted: boolean;
}

// ── Error model ─────────────────────────────────────────────────────

export type FleetErrorCode =
  | "auth/missing"
  | "auth/insufficient-scope"
  | "github/rate-limited"
  | "github/network"
  | "github/repo-not-found"
  | "github/api-error"
  | "lockfile/malformed"
  | "git/clone-failed"
  | "git/push-rejected"
  | "git/branch-protected"
  | "config/malformed"
  | "config/invalid-scope";

export class FleetError extends Error {
  constructor(
    public code: FleetErrorCode,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "FleetError";
  }
}

// ── Derived helpers ─────────────────────────────────────────────────

export interface SessionSummary {
  succeeded: number;
  noOp: number;
  failed: number;
  skipped: number;
  interrupted: boolean;
}

export function summarise(s: SyncSession): SessionSummary {
  const c = (o: SyncOutcome) => s.results.filter((r) => r.outcome === o).length;
  return {
    succeeded: c("succeeded"),
    noOp: c("no-op"),
    failed: c("failed"),
    skipped: c("skipped"),
    interrupted: s.interrupted,
  };
}

export function exitCode(s: SyncSession): number {
  const summary = summarise(s);
  if (summary.failed > 0) return 1;
  return 0;
}
