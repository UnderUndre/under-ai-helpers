# Quickstart — Fleet Sync (developer / contributor)

How to build, test, and try the feature locally.

## Prerequisites

- Node.js ≥20
- `git` on PATH (any modern version)
- A GitHub auth token in one of: `GH_TOKEN`, `GIGET_AUTH`, or `gh auth login` already done
- For PR/push modes against your own test repos: token must have `repo` scope (or `public_repo` for public-only)

## Build & test

```bash
cd packages/cli
npm install         # picks up the two new deps when added: @inquirer/prompts, cli-table3
npm run validate    # tsc --noEmit (must be clean before commit)
npm test            # vitest run — must show all tests pass (162 + new fleet ones)
npm run build       # produces dist/
```

## Try the feature locally

### 1. List your fleet

```bash
node packages/cli/bin/helpers.mjs fleet list
```

First run: prints the table for your own repos that have `helpers-lock.json` at root on default branch. If you have none → "no projects found" message naming what was queried.

### 2. Add an org to scope

```bash
node packages/cli/bin/helpers.mjs fleet add-org my-employer-org
```

Confirms the addition + writes `~/.config/clai-helpers/fleet.json`. Re-run `fleet list` to see results from that org.

### 3. Sync a single repo (PR mode, dry-run first)

```bash
node packages/cli/bin/helpers.mjs fleet sync --repo myuser/myrepo --mode pr --dry-run
```

Shows the plan + diff preview. No writes happen.

Then for real:

```bash
node packages/cli/bin/helpers.mjs fleet sync --repo myuser/myrepo --mode pr
```

Opens a PR in `myuser/myrepo` titled `chore(deps): bump clai-helpers to <latest>`. Review and merge via GitHub UI when ready — tooling never auto-merges.

### 4. Interactive multi-select

```bash
node packages/cli/bin/helpers.mjs fleet sync
```

Shows a checkbox picker (space to toggle, enter to confirm). Then prompt for confirmation, then sequential sync per selection.

### 5. Try patch mode (no GitHub mutation)

```bash
node packages/cli/bin/helpers.mjs fleet sync --all --mode patch --patch-output ./.fleet-patches
```

Each selected repo's bump diff is written to `./.fleet-patches/<owner>__<repo>.patch`. Apply manually with `git apply` or open in editor.

## Test locally without hitting real GitHub

Most unit + integration tests for fleet use the same mocking pattern as `tests/unit/fetch.test.ts`:

```ts
vi.mock("node:child_process", () => ({
  execFile: vi.fn(/* ... */),
  // ...
}));

const fetchMock = vi.fn(async (url, init) => {
  // return canned GitHub responses
});
globalThis.fetch = fetchMock;
```

This makes the tests deterministic and offline.

## Debug a real run

```bash
node packages/cli/bin/helpers.mjs fleet list --verbose
```

`--verbose` adds:
- per-repo timing (ms)
- `X-RateLimit-Remaining` after each API call
- full git stderr when sync invokes git

If GitHub returns weird responses, set `DEBUG=clai-helpers:fleet:*` (planned — implement in core/fleet/github-api.ts using `consola.withTag("fleet")`).

## Common errors

| Error | Likely cause | Fix |
|-------|--------------|-----|
| `auth required: ...` | No token in env or `gh auth` | `export GH_TOKEN=...` or `gh auth login` |
| `github/rate-limited` | >5000 API calls/h hit | wait until reset (printed in error message) |
| `git/push-rejected (branch protection)` | branch protection requires reviewers, can't push direct | use `--mode pr` instead of `--mode push` |
| `lockfile/malformed` | a repo's `helpers-lock.json` is broken (rare) | open the repo, fix manually, re-run |
| `config/malformed` | typo in `~/.config/clai-helpers/fleet.json` | error message names the field; fix and re-run |

## What's NOT done in v1

(Listed so contributors don't surprise-implement; see spec assumptions and research for full rationale.)

- Local-only repos (no GitHub origin): invisible to the fleet.
- Offline mode for `fleet list`: requires live API.
- Per-repo mode override in config: deferred to v2.
- Workflow-dispatch mode: deferred (chicken-and-egg setup).
- Parallel sync execution: sequential only.
- Persistent fleet cache: every invocation re-fetches.
- Subdir lockfiles in monorepos: only root-level recognised.
- Web UI: deferred to a separate v2 spec if CLI proves insufficient.
