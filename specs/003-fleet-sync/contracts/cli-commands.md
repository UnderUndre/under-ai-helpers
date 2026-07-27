# CLI Command Contract — `clai-helpers fleet`

Defines exact command surface, flags, exit codes, and output format. Stable between releases (additive changes only post-1.0).

## Command tree

```text
clai-helpers fleet              # alias for `fleet list`
clai-helpers fleet list         # show fleet status (read-only)
clai-helpers fleet sync         # sync selected projects
clai-helpers fleet add-org      # add an org to discovery scope
clai-helpers fleet remove-org   # remove an org from discovery scope
```

## `fleet list`

Read-only listing of all projects in scope.

### Synopsis

```text
clai-helpers fleet list [--filter <glob>] [--json] [--no-color] [--verbose]
```

### Flags

| Flag | Short | Default | Effect |
| ------ | ------- | --------- | -------- |
| `--filter <glob>` | — | none | Filter the rendered rows; does NOT alter the configured scope |
| `--json` | — | off | Emit `FleetEntry[]` as JSON to stdout instead of a human table |
| `--no-color` | — | off | Disable ANSI color codes (also implied by `NO_COLOR=1` env) |
| `--verbose` | `-v` | off | Print rate-limit remaining, timing per repo |

### Output (default human format)

```text
┌────────────────────────────────┬──────────┬──────────┬──────────┬───────┬────────────────┐
│ Repo                           │ Branch   │ Pinned   │ Latest   │ Drift │ Last sync      │
├────────────────────────────────┼──────────┼──────────┼──────────┼───────┼────────────────┤
│ UnderUndre/myproject           │ main     │ v0.3.0   │ v0.5.0   │ YES   │ 2026-04-30     │
│ UnderUndre/sandbox             │ main     │ v0.5.0   │ v0.5.0   │ no    │ 2026-05-07     │
│ myorg/internal-tool            │ master   │ main@a3f │ v0.5.0   │ YES   │ 2026-05-01     │
└────────────────────────────────┴──────────┴──────────┴──────────┴───────┴────────────────┘

Scope: user (UnderUndre) + 1 org (myorg). Latest of clai-helpers: v0.5.0.
```

### Output (`--json`)

```json
[
  {
    "fullName": "UnderUndre/myproject",
    "shortName": "myproject",
    "defaultBranch": "main",
    "pinnedRef": "v0.3.0",
    "pinnedSource": "github:UnderUndre/under-ai-helpers",
    "latestRef": "v0.5.0",
    "hasDrift": true,
    "lastSyncAt": "2026-04-30T12:34:56Z",
    "state": "active",
    "unreadableReason": null
  }
]
```

### Exit codes

| Code | Condition |
| ------ | ----------- |
| 0 | List rendered cleanly (even if zero entries — printed empty result + "no projects found") |
| 2 | Usage error (unknown flag, malformed `--filter`, no auth provided/discoverable) |
| 3 | GitHub API rate-limited beyond retry budget AND ≥1 entry could not be fetched |

## `fleet sync`

Apply bumps to selected repos under the chosen mode.

### Synopsis

```text
clai-helpers fleet sync
  [--all | --repo <owner>/<repo>... | --filter <glob>]
  [--mode <pr|push|patch>]
  [--patch-output <dir>]
  [--yes]
  [--dry-run]
  [--verbose]
  [--no-color]
```

### Flags

| Flag | Short | Default | Effect |
| ------ | ------- | --------- | -------- |
| `--all` | — | off | Select every active entry in scope (skips archived/disabled) |
| `--repo <owner>/<repo>` | — | none | Explicit selection (repeatable: `--repo a/b --repo c/d`) |
| `--filter <glob>` | — | none | Select entries matching pattern (e.g., `myorg/*`) |
| `--mode <m>` | — | from config (default `pr`) | Override session mode for this invocation |
| `--patch-output <dir>` | — | from config (default `./.fleet-patches`) | Where `--mode patch` writes `.patch` files |
| `--yes` | `-y` | off | Skip the confirm prompt (still emits the planned diff list to stderr) |
| `--dry-run` | — | off | Plan & show what would happen, but make NO mutations |
| `--verbose` | `-v` | off | Print per-entry timing, rate-limit remaining, full git stderr |

### Behaviour

1. Resolve mode: `--mode` flag > `defaultSyncMode` from config > hardcoded `pr`.
2. Discover fleet (same as `fleet list`).
3. Apply selection:
   - If exactly one of `--all`/`--repo`/`--filter` provided → use that.
   - If none provided AND stdin is a TTY → open interactive checkbox picker.
   - If none provided AND stdin is NOT a TTY → exit 2 with "ambiguous selection in non-interactive mode; pass --all/--repo/--filter".
4. Display plan: list of selected entries + mode + estimated count of bumps.
5. Confirm (skipped if `--yes` or `--dry-run`).
6. Execute sequentially. Per entry: ephemeral clone → run sync pipeline → mode dispatcher.
7. Emit summary.

### Output

```text
Plan: 3 repos, mode=pr
  • UnderUndre/myproject     v0.3.0 → v0.5.0
  • UnderUndre/sandbox       (already at latest, will skip)
  • myorg/internal-tool      main@a3f → v0.5.0

Continue? [Y/n] y

[1/3] UnderUndre/myproject     ✓ PR opened: https://github.com/UnderUndre/myproject/pull/42
[2/3] UnderUndre/sandbox       ⊘ already up-to-date (no-op)
[3/3] myorg/internal-tool      ⊘ skipped: branch protection requires reviewers (FR-006)

Summary:
  Succeeded: 1 (PRs: 1)
  No-op:     1
  Skipped:   1 (branch protection: 1)
  Duration:  4.2s
```

### Exit codes

| Code | Condition |
| ------ | ----------- |
| 0 | All selected entries succeeded or were no-op or were skipped |
| 1 | At least one entry failed (`SyncOutcome === "failed"`) |
| 2 | Usage error (conflicting selection flags, malformed `--repo`, etc.) |
| 3 | GitHub API rate-limited beyond retry budget |

## `fleet add-org` / `fleet remove-org`

```text
clai-helpers fleet add-org <org-name>
clai-helpers fleet remove-org <org-name>
```

Mutates the user config file at `~/.config/clai-helpers/fleet.json` (creates with defaults if missing). Idempotent. Exits 0 on success or "already present"/"not present" (no-op cases). Exits 2 on malformed org name.

## Global preconditions

All `fleet *` subcommands require GitHub authentication. Resolution order matches existing CLI:

1. `--auth <token>` flag (if exposed at global level)
2. `GH_TOKEN` env
3. `GIGET_AUTH` env
4. `gh auth token` subprocess output

If none resolve → exit 2 with: `auth required: set GH_TOKEN, run 'gh auth login', or pass --auth`.

## Stability promise

Post-1.0:

- New flags: SHALL be additive (no breaking).
- Removed/renamed flags: MAJOR bump only (per Constitution Principle IV; in 0.x, MINOR signals breaking).
- Output format changes: `--json` output is the stable machine-readable contract; human format may change between MINOR versions. Scripts MUST use `--json`.
