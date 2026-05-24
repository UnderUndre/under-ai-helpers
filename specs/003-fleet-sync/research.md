# Phase 0 Research — Fleet Sync

Resolves all open technical decisions left from the spec/plan. Each entry: **Decision → Rationale → Alternatives**.

## R1. GitHub API client

**Decision**: Extend the existing raw-`fetch` pattern from `core/fetch.ts`. Add a thin wrapper `core/fleet/github-api.ts` exposing `listReposInScope(scope, auth)`, `readLockfile(repoFullName, auth)`, `readLastCommitForPath(repoFullName, path, auth)`, `getDefaultBranch(repoFullName, auth)`, `findOpenPullRequest(repoFullName, branchName, auth)`, `createPullRequest(repoFullName, params, auth)`. All use `Bearer` auth + `application/vnd.github+json` Accept header.

**Rationale**:
- Existing `fetch.ts` already handles `resolveAuth()` and uses raw fetch — consistent style across the codebase.
- Zero new dependency footprint.
- Full control over rate-limit handling (retry with backoff per FR-014); easier to reason about than Octokit's plugin chain.
- Fewer lines of code than wiring Octokit auth + plugins.
- Mockable via `globalThis.fetch` shim (same pattern as `tests/unit/fetch.test.ts`).

**Alternatives**:
- `@octokit/rest` — official, full-featured. Rejected: ~250 KB unzipped; brings auth-app/auth-token plugin chain we don't need; breaks "minimal deps" repo constitution.
- `octokit` (modular umbrella) — rejected for the same dependency-weight reason; we use < 10 endpoints.
- `gh` CLI subprocess for everything — rejected: requires `gh` installed on every user's machine (current CLI works without it; `gh` is only a fallback in `resolveAuth()`).

## R2. Git operations (clone, branch, commit, push)

**Decision**: Spawn the system `git` CLI via `child_process.execFile('git', [...])` with explicit args, no shell. Wrap in a `core/fleet/ephemeral-clone.ts` helper that returns `{ dir, cleanup }` from `mkdtemp(os.tmpdir(), 'helpers-fleet-')`.

**Rationale**:
- Every dev environment that uses clai-helpers already has `git` (it's a `helpers sync` prerequisite when consumers commit `helpers-lock.json`). No new install burden.
- `execFile` (not `exec`) avoids shell injection risks — we always pass arg arrays.
- Spawning gives us full control over flags. Standing Order #3 ("never use `--force`") is enforceable: every git invocation in the code is greppable for forbidden flags.
- Easy to mock in vitest via `vi.mock('node:child_process', ...)`.

**Alternatives**:
- `simple-git` library — adds a dep with little real value over plain spawn; the library's surface is opinionated and obscures which flags are actually invoked.
- `isomorphic-git` (pure JS) — clones via API which avoids subprocess but is significantly slower for full clones; sparse-checkout support adequate but adds complexity. Reasonable for v2 if we want shallow API-based clones.
- Pure GitHub API for blob/tree/commit (no clone at all) — works for `pr` mode in theory, but reproducing the local sync result via API alone requires uploading every regenerated derived file. Massive, error-prone, and breaks symmetry with `helpers sync` which works on a real working tree. Rejected.

## R3. Multi-select picker

**Decision**: `@inquirer/prompts` (modular). Import only `checkbox` and `confirm` (post-selection confirm step per FR-003 acceptance #4). Two subpackages totalling ~30 KB.

**Rationale**:
- Modular imports avoid pulling the full `inquirer` (heavy).
- Maintained, typed, supports navigation keys + space-toggle + enter-confirm out of the box.
- Renders correctly in Windows Terminal, iTerm2, gnome-terminal (the platforms in our test matrix).

**Alternatives**:
- Full `inquirer` — overhead.
- `enquirer` — lighter but its multi-select prompt has a quirky default render and less consistent cross-terminal behaviour on Windows.
- DIY readline checkbox — ~200 LOC just for this widget; reinventing maintained code for negligible gain.

## R4. Table rendering

**Decision**: `cli-table3`.

**Rationale**:
- Tiny (~25 KB), focused, ANSI color compatible.
- Handles column-width auto-sizing and truncation cleanly for paths/refs that may overflow.
- Stable, widely used; predictable behaviour.

**Alternatives**:
- `consola.box` / hand-rolled spacing — fine for 3 columns, ugly when 6+ columns must align across rows of varying length. Rejected.
- `terminal-kit` — overkill (full TUI library).

## R5. User config storage

**Decision**: Reuse `c12` (already a dep). Use its built-in user-config-dir resolution: `loadConfig({ name: 'clai-helpers', cwd: <user-home>, ... })` reads `~/.config/clai-helpers/fleet.{ts,js,json,yaml,yml}` with TS priority. Schema enforced in `core/fleet/config.ts` via discriminated union types and runtime validation (no Zod — keep it manual for one-file schema).

**Rationale**:
- `c12` is already loaded for `helpers.config.ts` parsing — same code path, same priority order (TS > JS > JSON > YAML).
- Cross-platform user-config-dir resolution is c12's responsibility (uses `env-paths`-style logic internally).
- No new dep.

**Alternatives**:
- `cosmiconfig` — would add a dep duplicating c12's role. Rejected.
- Plain `fs.readFile('~/.config/...')` with `JSON.parse` — works for v1 but loses TS-config support consumers might want for typed defaults.

## R6. Sync mechanism implementation per mode

**Decision**: Each mode (`pr`/`push`/`patch`) shares an upstream pipeline:

```text
1. Resolve <owner>/<repo> default branch via GitHub API.
2. Ephemeral clone the default branch into mkdtemp dir (depth=1 — shallow).
3. Run the existing single-project `sync` pipeline against that clone (reuses core/pipeline.ts).
4. If working tree had no diff after sync → "already up-to-date" → mark succeeded with no-op note.
5. Otherwise dispatch to mode-specific finisher:
   - pr-mode:    create branch `clai-helpers-bump/<latest-ref>`, commit, push, open PR via API
   - push-mode:  commit, push to default branch
   - patch-mode: write `git diff` output to <CWD>/.fleet-patches/<owner>__<repo>.patch
6. Cleanup tempdir (always, including on failure).
```

**Rationale**:
- Symmetric with single-project `helpers sync` semantics (Step 3) — no duplicate logic.
- Step 4 short-circuits the "no real bump" case (e.g., consumer already on latest); avoids creating empty PRs.
- Cleanup in `finally` block + a SIGINT handler that signals all in-flight ephemeral dirs to wipe — addresses SC-003 (zero half-applied state).

**Alternatives**:
- Pure GitHub API for `pr` mode (blob/tree/commit endpoints, no clone) — see R2; rejected as parallel implementation.
- Persistent local mirror cache instead of ephemeral clones — saves repeat clone time at the cost of cache eviction/staleness logic. Premature for v1; revisit if SC-001 fails.

## R7. PR uniqueness / idempotency

**Decision**: Branch name is deterministic: `clai-helpers-bump/<target-ref>` (e.g., `clai-helpers-bump/v0.5.0`). Before pushing, query GitHub API for an existing open PR with this head ref. If found → skip (FR-006 → P2 acceptance #2). If found but closed/merged → still push and open new PR (the user might have closed without merging; we re-offer the bump).

**Rationale**:
- Deterministic name = idempotent: re-running `fleet sync --mode pr` against an already-bumped repo doesn't produce duplicates.
- "Closed without merging" is rare and handled correctly without UI complexity.

**Alternatives**:
- Random branch suffix — every run creates a new PR. Spammy. Rejected.
- Force-update existing branch via `--force` push — violates Standing Order #3. Rejected.

## R8. Concurrency / rate-limit strategy

**Decision**:
- Discovery (read-only, GitHub API): parallel with `Promise.all` bounded by a pool of 5 in-flight requests (handwritten p-limit, ~10 LOC). Honors `X-RateLimit-Remaining` header — pause if remaining < 50.
- Sync (mutating): strictly sequential per FR-005. No parallel modes for v1.

**Rationale**:
- Discovery dominates list-time perf; parallel API calls fit GitHub's 5000/h authenticated quota for typical fleets.
- Sequential sync makes failures readable and prevents quota burn during destructive flows.
- Hand-written 10-LOC limiter avoids `p-limit` dep.

**Alternatives**:
- `p-limit` package — fine, but the implementation we need is ~10 LOC; not worth a dep.
- Parallel sync — premature; revisit if SC-005 holds and users ask for it.

## R9. Test strategy

**Decision**:
- **Unit**: pure modules (table renderer, config loader, github-api wrapper) tested in isolation with `globalThis.fetch` shim and `vi.mock('node:child_process')`.
- **Integration**: `fleet list` end-to-end with mocked GitHub API; `fleet sync` per mode with mocked git spawn + mocked GitHub API.
- **Golden**: table output for 1, 5, 50 rows. Snapshot any time list-table format changes.
- Uses existing `vitest` infrastructure; same config; same `npm test` invocation.

**Rationale**:
- Mirrors existing test architecture (`tests/unit/fetch.test.ts` is the model — `vi.mock('giget')` + `globalThis.fetch` shim).
- No new test runner, no new test deps.

**Alternatives**:
- E2E against real GitHub repos (test account) — flaky; rate-limited; needs CI secrets. Rejected for primary suite; could be opt-in via env-flag for manual smoke testing.

## R10. Error semantics + exit codes

**Decision**:
- Exit `0`: list completed cleanly OR sync had zero failures (skips and successes only).
- Exit `1`: sync had ≥1 failure.
- Exit `2`: usage error (unknown flag, malformed `--repo` arg, no auth).
- Exit `3`: GitHub API rate-limited beyond retry budget AND at least one repo's status couldn't be fetched.
- Skips never raise the exit code; they're informational.

**Rationale**:
- Maps to FR-008 (failures → non-zero) + FR-006 (skips ≠ failures).
- Differentiated codes help CI scripts (P3) decide between "retry later" (exit 3) and "fix the bug" (exit 1).
- `2` for usage matches POSIX convention.

**Alternatives**:
- Single non-zero (any error → 1) — loses the "transient vs. permanent" distinction. Rejected.

---

**Phase 0 status**: All NEEDS CLARIFICATION resolved. Ready for Phase 1 (data model + contracts).
