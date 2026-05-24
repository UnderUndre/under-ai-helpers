# Feature Specification: Fleet Sync — multi-project discovery and on-demand sync

**Feature Branch**: `003-fleet-sync`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: "теперь я хочу фичу, чтобы автоматом синкать эти хелперы в проектах, где они у меня установлены — точнее, я хочу видеть, где установлено и синкать по необходимости, с возможностью выбора одного и/или более проектов для синка/апдейта"

## Clarifications

### Session 2026-05-06

- Q: Form factor — terminal CLI subcommand vs. TUI vs. local web UI vs. hybrid? → A: **A — CLI subcommand within existing `clai-helpers` binary.** Web UI deferred to a potential v2 spec if CLI proves insufficient. Logic (discovery + sync) is form-factor-independent; UI can swap later without re-architecting.
- Q: Source of truth for discovery + status — local disk scan vs. GitHub API vs. hybrid vs. manual list? → A: **A — GitHub API as sole source of truth.** Discovery queries the user's GitHub account (and configured orgs); each repo's `helpers-lock.json` on its default branch is the authoritative pinned-ref signal. Cross-machine inherent: state lives in GitHub, not on any one machine. Drift semantics shift from "local files vs pinned source" (file-level) to "pinned ref vs latest available release" (version-level). Local-only repos and offline mode are out of scope for the first release.
- Q: Sync mechanism — direct push vs. PR-based vs. patch file vs. workflow trigger; how configurable? → A: **C — Three modes supported with safe default + global config + per-session flag.** Default is PR (Standing Order #1 alignment, audit trail, branch-protection-friendly). User can change baseline via `defaultSyncMode: pr|push|patch` in `~/.config/clai-helpers/fleet.json`. Per-session override via `--mode <pr|push|patch>` flag. Per-repo override (option D) deferred to v2 if real demand emerges. Workflow-dispatch (option E) deferred (chicken-and-egg setup; doesn't compose well with default). All three modes honor: no auto-merge, user retains the final accept-the-change decision (merge PR / acknowledge push success / apply patch).

## User Scenarios & Testing

### User Story 1 — Discover what's installed where (Priority: P1)

The maintainer of clai-helpers (or any user with clai-helpers in multiple GitHub repos, possibly across multiple machines) wants a single command that lists every repo in their GitHub scope where clai-helpers is installed, showing each repo's identifier, the version it's pinned to on its default branch, the latest available version, and whether it has version-drifted (pinned ≠ latest).

**Why this priority**: Visibility is the prerequisite for action. Without "what do I have", there's no informed "what to update". This story alone (no sync action) already replaces ad-hoc browsing across GitHub repos and answers the recurring question "which of my projects are on stale templates?". It is the **MVP**: even without the sync action in P2, just knowing which repos exist and their state is valuable. Cross-machine by design — runs the same on any machine where the user has GitHub auth.

**Independent Test**: Run the discovery command with valid GitHub auth against an account having two consumer repos pinned to different versions of clai-helpers. Verify output lists both with correct `<owner>/<repo>`, default branch, current pinned ref, latest ref, and drift status. No mutation occurs in any repo.

**Acceptance Scenarios**:

1. **Given** the user has clai-helpers installed in 3 GitHub repos within their configured discovery scope, **When** they invoke the fleet listing command, **Then** the output shows all 3 repos with their identifiers, default branches, pinned refs, latest available ref, and drift indicators.
2. **Given** no repo in scope has clai-helpers installed, **When** the user invokes the listing command, **Then** they receive a clear "no projects found" message naming which scopes (user + orgs) were queried.
3. **Given** a previously-listed repo was deleted or transferred away from the user's scope on GitHub, **When** the listing runs again, **Then** the deleted/transferred repo does not appear and no error is raised.
4. **Given** a repo's `helpers-lock.json` is corrupt, malformed, or otherwise unreadable, **When** the listing runs, **Then** that repo is shown with an "unreadable" status and processing continues for other repos.
5. **Given** GitHub auth is missing or expired, **When** the user invokes the listing command, **Then** the command exits non-zero with a clear "auth required" message and a one-line hint at how to provide auth.

---

### User Story 2 — Sync selected projects interactively (Priority: P2)

After viewing the fleet, the user picks one or more projects from a list and triggers an upgrade sync on each. Selection is via a multi-select picker (checkbox-style) presented in the terminal. The user confirms before any sync runs. After confirmation, syncs run sequentially with progress feedback per project, and a final summary reports successes and failures.

**Why this priority**: This is the headline interaction. P1 gives visibility; P2 turns visibility into a workflow. Sequential rather than parallel by default avoids overwhelming the user with concurrent network activity and makes failures easier to read.

**Independent Test**: With 4 known consumer projects on stale versions, invoke the interactive sync, select 2 of them via the picker, confirm, observe two syncs run, and verify only the selected 2 advanced their pinned refs while the other 2 remain unchanged.

**Acceptance Scenarios**:

1. **Given** 4 projects shown in the fleet, **When** the user selects 2 and confirms, **Then** exactly those 2 projects are synced and their pinned refs advance to the latest; the other 2 remain at their prior refs.
2. **Given** a selected project under mode `pr` already has an open PR for the same lockfile bump, **When** sync runs on it, **Then** that project is reported as `succeeded` with the existing PR URL referenced (no new PR is opened — idempotent), and the next project proceeds.
3. **Given** sync fails on one selected project (network error, write conflict, branch protection), **When** processing continues, **Then** subsequent selected projects still get their chance, and the final summary clearly distinguishes succeeded vs. failed projects with the failure reason.
4. **Given** the user selects nothing in the picker and confirms, **When** the command proceeds, **Then** no syncs run and the user is told "nothing selected, exiting cleanly".
5. **Given** a project under mode `push` has branch protection requiring reviewers on the default branch, **When** the command tries to push, **Then** that project is skipped with a "push blocked by branch protection, retry with --mode pr" message and other projects proceed.

---

### User Story 3 — Non-interactive sync for automation (Priority: P3)

A user (or a CI script, or a scheduled task) wants to run sync against a known subset of projects without an interactive picker — by name, by glob, or via "everything". The command must accept flags that fully describe the selection so it can run unattended and exit with a meaningful code.

**Why this priority**: Power-user / automation case. Less critical than the interactive flow because most users will pick from the list, but essential for users who want this in cron or CI.

**Independent Test**: With 5 known projects, run the command with a flag selecting "all that match a name pattern" and verify only matching projects are synced. Re-run with `--all` and verify all are processed. Re-run with a project that doesn't exist by name and verify a non-zero exit code with a clear error.

**Acceptance Scenarios**:

1. **Given** the user runs the sync with a flag selecting all projects, **When** processing completes, **Then** every discovered project was attempted and a summary line indicates total succeeded / failed / skipped.
2. **Given** the user passes a project name that does not exist, **When** the command runs, **Then** it exits non-zero with an error message naming the unknown project — without syncing any other projects.
3. **Given** the user passes a glob/pattern matching 3 of 5 projects, **When** the command runs, **Then** exactly those 3 are synced.

---

### Edge Cases

- **Repo renamed or transferred on GitHub**: Discovery uses live GitHub data, so the renamed repo appears under its new `<owner>/<repo>` automatically. Any cached/saved selection by old name is invalidated; user is informed.
- **Repo deleted or archived**: Archived repos are surfaced with an "archived" status indicator and skipped from sync (FR-006). Deleted repos drop from the list silently.
- **Repo's default branch is not `main`**: System reads `helpers-lock.json` from whatever the repo's actual default branch is (`master`, `develop`, `trunk`, etc.) — never assumes `main`.
- **Multiple `helpers-lock.json` in one repo** (e.g., monorepo with several consumer dirs): For the first release, only the **root-level** `helpers-lock.json` is recognized. Nested ones are ignored. (Future: extend to subdirs.)
- **Project pinned to a floating ref** (branch name rather than a tag): "Latest available" still refers to the latest release of `clai-helpers` itself; drift is computed against pinned-ref-vs-latest-release. Floating refs are flagged as such in the list view (e.g., `main@<short-sha>`) so user can distinguish them from pinned tags.
- **GitHub API rate-limit hit mid-listing** (5000/h authenticated, lower for unauthenticated): System surfaces remaining quota; remaining lookups for this run fail individually with "rate-limited, retry in N min" rather than crashing. Already-fetched entries still render.
- **Authentication missing or insufficient scope** (e.g., token lacks `repo` for private repos): The whole `fleet list` exits with a clear "auth required" / "insufficient scope" message. Per-repo failures during sync are skipped, not aborts.
- **Network unavailable**: `fleet list` cannot run without GitHub API access in the first release (no local cache yet). Exit non-zero with clear "GitHub unreachable" message. (Future: cached last-known state for offline browse.)
- **Massive fleet** (50+ repos): Listing parallelizes per-repo lookups within rate-limit budget. Target: complete within ~5 seconds for 50 repos under typical network conditions.
- **User aborts mid-fleet** (Ctrl-C during a multi-project sync): Whatever project is currently syncing must clean up its working state (no half-applied trees on the local clone, no orphan PR branches); already-completed projects stay synced; remaining selected projects are not started; the summary reports "interrupted by user" for the remainder.

## Requirements

### Functional Requirements

- **FR-001**: System MUST discover projects via the GitHub API by enumerating repositories owned by the authenticated user plus any explicitly configured organizations, filtering to those whose default branch contains the canonical install marker (`helpers-lock.json`) at the repo root.
- **FR-002**: System MUST present a list view of discovered projects in the terminal as a tabular layout (columns: repository (`<owner>/<repo>`), default branch, current pinned ref, latest available ref of clai-helpers, version-drift indicator yes/no, timestamp of the most recent commit that touched `helpers-lock.json` on the default branch).
- **FR-003**: Users MUST be able to select one or more projects via an interactive terminal multi-select picker (checkbox-style; arrow keys to navigate, space to toggle, enter to confirm). The picker presents one row per discovered project with the same columns as the list view.
- **FR-004**: Users MUST be able to select projects non-interactively via flags: select all (`--all`), select by name pattern (`--filter <glob>`), select by explicit list of `<owner>/<repo>` (`--repo` repeatable).
- **FR-005**: System MUST execute selected syncs sequentially by default with per-project progress feedback. Optional concurrency settings are out of scope for the first release.
- **FR-006**: System MUST skip (not fail) a selected project when prerequisites for the chosen sync mode are not met. Skip cases include: insufficient GitHub auth scope, repo archived or disabled, branch-protection rules that the chosen mode cannot satisfy (e.g., required reviewer count > 0 with `--mode push`), and `git/push-rejected` outcomes that aren't branch-protection (e.g., non-fast-forward when the default branch advanced between clone and push under `--mode push`). Each skip is reported with a one-line reason naming the mode and the unmet prerequisite. Note: an already-open PR for the same bump (mode `pr`) is NOT a skip — it's reported as `succeeded` with the existing PR URL (idempotent: the bump is already in flight, just awaiting merge).
- **FR-007**: System MUST produce a final summary at the end of any sync session with three lines: succeeded count, failed count (each with `<owner>/<repo>` and one-line reason), skipped count.
- **FR-008**: System MUST exit with a non-zero status if any selected project failed to sync (non-zero failure count); exit zero otherwise. Skips are not failures.
- **FR-009**: System MUST treat `fleet list` as strictly read-only — no writes to local disk (beyond optional cache file under user config dir), no writes to any GitHub repo, no clones triggered by listing.
- **FR-010**: System MUST support three sync modes — `pr` (open a pull request with the bumped lockfile + regenerated derived files), `push` (commit and push directly to the default branch), `patch` (write a `.patch` file per repo to a local output dir; user applies manually). Mode is selected in this priority order: `--mode <pr|push|patch>` flag, then `defaultSyncMode` in user config (`~/.config/clai-helpers/fleet.json`), then hardcoded default `pr`. Mode `patch`'s output directory defaults to `./.fleet-patches/` under the working directory and is overridable via `patchOutputDir` in user config or `--patch-output <dir>` flag. Regardless of mode, System MUST NEVER auto-merge a created PR — the user retains the final merge decision in mode `pr`, retains the push-acknowledgement in mode `push` (system reports the pushed SHA but does not push tags or trigger releases), and retains the apply-the-patch decision in mode `patch`.
- **FR-011**: System MUST derive "most recent sync" per project from git history of `helpers-lock.json` on the default branch (the most recent commit touching that file), surfaced via GitHub API. No separate persisted state is needed.
- **FR-012**: System MUST require GitHub authentication for discovery and read access. Auth resolution order matches the existing CLI (explicit `--auth`, then `GH_TOKEN` env, then `GIGET_AUTH` env, then `gh auth token`). When no auth is found, the command exits non-zero with a clear "auth required" message and a hint at how to provide it.
- **FR-013**: System MUST support a configurable scope of GitHub orgs/users to query, persisted in user config (default: only the authenticated user's own repos). New orgs can be added via a dedicated subcommand (`fleet add-org <org>` / `fleet remove-org <org>`) without editing config files by hand.
- **FR-014**: System MUST handle GitHub API rate-limit responses gracefully: surface remaining quota in verbose output, retry with backoff on 403 secondary-rate-limit responses up to a sensible cap, and fail any individual project lookup (not the whole session) if its API call exhausts retries.
- **FR-015**: System MUST support a `--dry-run` mode for `fleet sync` that performs discovery, selection resolution, and plan output but performs ZERO mutations: no clones, no commits, no pushes, no PR creation, no patch writes. Intended for verification before a real run; `--dry-run` skips the confirm prompt automatically (nothing destructive can happen anyway).

### Key Entities

- **Fleet Entry**: A single GitHub-hosted project where clai-helpers is installed (signaled by `helpers-lock.json` at the repo root on its default branch). Attributes: `<owner>/<repo>` identifier, default branch name, current pinned ref of clai-helpers (read from `helpers-lock.json`), current pinned source URL, latest available release of clai-helpers (resolved once per session), version-drift flag (pinned ≠ latest), timestamp of the most recent commit touching `helpers-lock.json`, archived/disabled state.
- **Discovery Scope**: The set of GitHub owners (the authenticated user plus any explicitly configured orgs) that the listing queries. Persisted in user config; can be edited via flags or by editing the config file.
- **Selection**: A subset of fleet entries chosen for a sync session. Source: interactive picker, name pattern (`--filter`), explicit `--repo <owner>/<repo>` (repeatable), or `--all`.
- **Sync Result**: Per-entry outcome of a sync attempt. State: succeeded / failed / skipped, with reason for the latter two and the resulting ref change for succeeded.
- **Sync Session**: One invocation of the multi-project sync with its selection and per-entry sync results, summarized at the end.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Listing a fleet of up to 20 GitHub repos returns within 5 seconds end-to-end on a typical broadband connection (includes API auth, scope query, per-repo lockfile read, and rate-limit-aware parallelization). For 50 repos, target is 10 seconds.
- **SC-002**: A user new to the feature can identify which of their projects are on stale templates within 30 seconds of running the command for the first time, without consulting documentation beyond the on-screen output.
- **SC-003**: Of all sync sessions across the user base, at least 95% complete with zero data loss in any selected project (measured: no project ends in a half-applied state after the session, including interrupts).
- **SC-004** (observational, post-release self-report; no automated test): The number of separate `cd` + `sync` invocations the user performs per quarter for upgrade campaigns drops by at least 80% compared to the pre-feature baseline. Verified via user self-report or shell history audit; surfaced during `/speckit.retrospective` rather than enforced by a CI check.
- **SC-005**: A failed sync of one project never aborts the rest of the session — exactly one summary covers all selected projects regardless of individual outcomes.

## Assumptions

- **Form factor: CLI subcommand** within the existing `clai-helpers` binary (not a separate process, not a web app, not a TUI app). Multi-select is a terminal checkbox picker; list view is a terminal table. Works inside ssh sessions and CI without modification. Web/TUI is explicitly out of scope for the first release; a future v2 spec may reconsider.
- **Source of truth: GitHub origin.** Discovery and status read from each repo's default-branch `helpers-lock.json` via the GitHub API. State lives in GitHub, not on any single user machine — that is what makes the feature cross-machine by design.
- A project is considered to "have clai-helpers installed" if and only if `helpers-lock.json` is present at the **repo root** on the **default branch**. Nested lockfiles in monorepo subdirs are out of scope for v1.
- **GitHub authentication is required.** Auth resolution mirrors the existing CLI (`--auth` → `GH_TOKEN` → `GIGET_AUTH` → `gh auth token`). Token must have `repo` scope for private repos; `public_repo` is sufficient for public-only fleets. No new auth surface; reuses what `sync` already needs.
- **Local-only repos and offline mode are out of scope for v1.** A repo without a GitHub origin is invisible to fleet listing. Offline browsing of last-known fleet state is a candidate for a future release.
- The feature is invoked manually. Scheduled or background auto-sync is explicitly out of scope (the user clarified "по необходимости" — on demand).
- **Sync mechanism**: three modes (`pr`, `push`, `patch`) selectable per session via `--mode` flag or globally via `defaultSyncMode` in `~/.config/clai-helpers/fleet.json`. Default is `pr`. Per-repo overrides deferred to v2.
- **Standing Orders apply**: no auto-merges, no auto-tags, no auto-releases. Mode `pr` opens the PR but never merges it. Mode `push` pushes but never tags/releases. Mode `patch` only writes local files and never touches GitHub. The user retains the final accept-the-change decision in every mode.
