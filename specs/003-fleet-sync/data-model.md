# Phase 1 Data Model — Fleet Sync

Concrete TypeScript shapes, validation rules, state transitions. Source of truth for code generation in `/speckit.tasks`.

## Entities

### `FleetEntry`

A single GitHub-hosted project where clai-helpers is installed. Read-only snapshot at the moment of `fleet list` invocation.

```ts
interface FleetEntry {
  /** GitHub identifier `<owner>/<repo>`. Globally unique; primary key. */
  fullName: string;
  /** Human-readable name (= `<repo>`); shown when context already established. */
  shortName: string;
  /** Default branch name (`main`, `master`, `develop`, etc.). NEVER assume `main`. */
  defaultBranch: string;
  /** Pinned ref of clai-helpers (read from `helpers-lock.json.ref`). E.g. `v0.4.0`, `main`, sha. */
  pinnedRef: string;
  /** Source URL field from `helpers-lock.json.source`. E.g. `github:UnderUndre/under-ai-helpers`. */
  pinnedSource: string;
  /** Latest release tag of clai-helpers itself. Resolved once per session, shared across entries. */
  latestRef: string;
  /** Drift = pinned !== latest. Computed; not stored. */
  hasDrift: boolean;
  /** ISO timestamp of the most recent commit that touched `helpers-lock.json` on default branch. */
  lastSyncAt: string | null;
  /** GitHub repository state: 'active' | 'archived' | 'disabled' | 'unreadable'. */
  state: RepoState;
  /** If state === 'unreadable', a one-line explanation. Otherwise null. */
  unreadableReason: string | null;
}

type RepoState = "active" | "archived" | "disabled" | "unreadable";
```

**Validation**:

- `fullName` matches `^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?/[a-zA-Z0-9._-]+$` (GitHub naming).
- `defaultBranch` non-empty.
- `pinnedRef` non-empty if `state === 'active'`; null/undefined for `'unreadable'`.
- `latestRef` resolved at most once per session and reused (a single GitHub call to `/repos/UnderUndre/ai/releases/latest`).

**State transitions**: none — `FleetEntry` is an immutable snapshot.

---

### `DiscoveryScope`

User configuration that bounds what GitHub will be queried. Lives in `~/.config/clai-helpers/fleet.json`.

```ts
interface DiscoveryScope {
  /** Always queries the authenticated user's own repos. Default true. */
  includeOwnRepos: boolean;
  /** Additional GitHub orgs to enumerate. Empty by default. */
  orgs: string[];
  /** Optional repo-fullname filter pattern; supports `*` glob. Empty = no filter. */
  filter?: string;
}
```

**Defaults** (when no config file exists):

```json
{ "includeOwnRepos": true, "orgs": [], "filter": null }
```

**Validation**:

- Each org name matches GitHub naming.
- `filter` (if set) is a valid glob (compiled at load time; rejects malformed).

---

### `FleetConfig`

Top-level user config combining `DiscoveryScope` + sync defaults.

```ts
interface FleetConfig {
  scope: DiscoveryScope;
  /** Default sync mode when no `--mode` flag passed. */
  defaultSyncMode: SyncMode;
  /** Output dir for `--mode patch`. Default `./.fleet-patches/` relative to CWD. */
  patchOutputDir: string;
  /** Max GitHub API parallelism for discovery reads. Default 5. */
  discoveryConcurrency: number;
}

type SyncMode = "pr" | "push" | "patch";
```

**Defaults** (no config file):

```json
{
  "scope": { "includeOwnRepos": true, "orgs": [], "filter": null },
  "defaultSyncMode": "pr",
  "patchOutputDir": "./.fleet-patches",
  "discoveryConcurrency": 5
}
```

**Validation**:

- `defaultSyncMode` ∈ `{"pr", "push", "patch"}`.
- `discoveryConcurrency` ∈ [1, 20].
- `patchOutputDir` is a path; created on first patch write if missing.

---

### `Selection`

The set of `FleetEntry.fullName` values chosen for a sync session. Internal-only (not persisted).

```ts
interface Selection {
  /** Selected entries (subset of the listed fleet). */
  entries: FleetEntry[];
  /** How the selection was made (for logging/UX). */
  source: SelectionSource;
}

type SelectionSource =
  | { kind: "interactive" }
  | { kind: "all" }
  | { kind: "filter"; pattern: string }
  | { kind: "explicit"; repos: string[] };
```

**Validation**:

- `entries.length >= 1` to proceed (empty selection → exit cleanly per P2 acceptance #4).
- Each entry must have `state === "active"` to be syncable; `archived`/`disabled` are filtered before selection materialises (or skipped at sync time with a clear reason if user explicitly named them).

---

### `SyncResult`

Per-entry outcome of a sync attempt within a session.

```ts
interface SyncResult {
  fullName: string;
  outcome: SyncOutcome;
  /** Mode that was used for THIS entry. Always equal to session mode in v1; reserved for future per-repo override. */
  mode: SyncMode;
  /** Populated when outcome === 'succeeded'. */
  refBefore?: string;
  refAfter?: string;
  /** PR URL when mode === 'pr' && outcome === 'succeeded'. */
  prUrl?: string;
  /** Pushed commit SHA when mode === 'push' && outcome === 'succeeded'. */
  pushedSha?: string;
  /** Path to written patch when mode === 'patch' && outcome === 'succeeded'. */
  patchPath?: string;
  /** Populated when outcome ∈ {'failed', 'skipped'}. */
  reason?: string;
  /** Error code for machine identification. */
  errorCode?: ErrorCode;
  /** Wall-clock duration (ms). */
  durationMs: number;
}

type SyncOutcome = "succeeded" | "failed" | "skipped" | "no-op";
```

**Outcomes**:

- `succeeded`: bump applied per chosen mode; `refBefore`/`refAfter` populated.
- `no-op`: pipeline produced no diff (already up-to-date); not counted as failure or skip in summary.
- `skipped`: prerequisite not met (FR-006; e.g. branch protection blocker, archived repo); populated `reason` and `errorCode`.
- `failed`: error occurred during sync (network, write conflict); populated `reason` and `errorCode`.

---

### `SyncSession`

One invocation of `fleet sync`. Aggregates results.

```ts
interface SyncSession {
  startedAt: string;       // ISO timestamp
  endedAt: string;         // ISO timestamp
  mode: SyncMode;          // resolved mode (flag > config > default 'pr')
  selection: Selection;
  results: SyncResult[];
  /** Whether the session was interrupted (Ctrl-C / SIGINT). */
  interrupted: boolean;
}
```

**Derived counts** (computed at end):

```ts
function summarise(s: SyncSession) {
  const c = (o: SyncOutcome) => s.results.filter(r => r.outcome === o).length;
  return {
    succeeded: c("succeeded"),
    noOp: c("no-op"),
    failed: c("failed"),
    skipped: c("skipped"),
    interrupted: s.interrupted,
  };
}
```

**Exit code derivation** (matches research §R10):

```ts
function exitCode(s: SyncSession): number {
  const c = summarise(s);
  if (c.failed > 0) return 1;        // any real failure → 1
  return 0;                           // all-skipped or all-succeeded → 0
}
```

Exit codes **2** (usage error: unknown flag, malformed `--repo`, no auth) and **3** (rate-limited OR GitHub wholly unreachable — DNS failure, connection refused, all retries exhausted) are raised BEFORE `SyncSession` is constructed and short-circuit it; they are not derived from session results.

---

## Relationships

```text
FleetConfig
  └── scope: DiscoveryScope ← user-edited
                  └── orgs: string[]

GitHub API ─── enumerates ──→ FleetEntry[] (one per matching repo)

User Selection ──→ Selection { entries: FleetEntry[] }
                                 │
                                 └── per entry, one SyncResult produced

SyncSession ── aggregates ──→ SyncResult[]
                              ── exit code derived ──→ process exit
```

## Invariants

1. **One snapshot per command**: `FleetEntry[]` is fetched once at the start of `fleet list` or `fleet sync`. The picker and sync operate against that snapshot. Repos that change state between snapshot and sync produce per-entry failures, not session aborts.
2. **Latest ref resolved once**: `FleetConfig.latestRef` is queried once per session (one API call) and reused for every entry's drift computation.
3. **No persistent state**: nothing about the fleet is cached to disk in v1. Every invocation re-derives state from GitHub. (`FleetConfig` is the only persisted artifact, and it's user-authored.)
4. **Mode immutability per session**: the resolved mode at session start applies to every entry. No mid-session mode switches in v1. (If per-repo override ships in v2, `SyncResult.mode` per-row deviates from `SyncSession.mode`.)

## Error model

```ts
class FleetError extends Error {
  constructor(
    public code: FleetErrorCode,
    message: string,
    public cause?: unknown,
  ) { super(message); this.name = "FleetError"; }
}

type FleetErrorCode =
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
```

Errors carry stable `code` strings — used for skip/fail messages (FR-006) and exit code mapping. No localised strings; messages always English.
