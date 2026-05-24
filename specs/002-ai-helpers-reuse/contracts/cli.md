# CLI Contract: underundre-helpers

**Version**: 1.0.0 | **Source of truth for FR-002**

## Invocation

```bash
npx underundre-helpers <command> [options]
```

## Global Flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--dry-run` | boolean | `false` | Print plan, write nothing. Exit 0. |
| `--offline` | boolean | `false` | No network. Use giget cache. |
| `--non-interactive` | boolean | `true` | Never prompt. CI-safe. |
| `--interactive` | boolean | `false` | Prompt on conflicts. Mutually exclusive with `--non-interactive`. |
| `--yes` | boolean | `false` | Auto-confirm destructive operations. |
| `--no-color` | boolean | respects `NO_COLOR` env | Disable color output. |
| `--json` | boolean | `false` | Output JSON instead of human-readable. |
| `--verbose` | boolean | `false` | Extended logging. |
| `--help` | boolean | — | Show help for command. |

## Commands

### `init`

Bootstrap a new project from source repo.

```bash
npx underundre-helpers init [options]
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `--source <url>` | string | `github:underundre/helpers` | Source repo URL |
| `--version <tag>` | string | latest tag | Pin to specific version tag |
| `--ref <ref>` | string | — | Branch or SHA (overrides `--version`) |
| `--targets <list>` | string | `claude,copilot,gemini` | Comma-separated target names |
| `--source-config <path>` | string | — | Local manifest override |
| `--trust-custom` | boolean | `false` | Pre-approve custom transformers |

### `sync`

Update existing project from source repo.

```bash
npx underundre-helpers sync [options]
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `--upgrade` | boolean | `false` | Move to latest version (without: heal drift only) |
| `--version <tag>` | string | — | Move to specific version |
| `--ref <ref>` | string | — | Branch or SHA |
| `--source-config <path>` | string | — | Local manifest override |
| `--trust-custom` | boolean | `false` | Pre-approve custom transformers |
| ~~`--only`~~ | — | — | **Removed in v3.2.** Deferred to v2. |

### `status`

Show current state of tracked files.

```bash
npx underundre-helpers status [options]
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `--strict` | boolean | `false` | Exit non-zero on drift |
| `--targets <list>` | string | all | Filter to specific targets |

**Output** (human): table of files with columns: path, kind, class, status, drift (y/n).
**Output** (JSON): array of `LockFileEntry` objects with computed drift boolean.

### `diff`

Show what would change on next sync.

```bash
npx underundre-helpers diff [path...]
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `--targets <list>` | string | all | Filter to specific targets |

### `eject`

Untrack a file but keep it locally.

```bash
npx underundre-helpers eject <path> [options]
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `--cascade` | boolean | `false` | Also untrack generated descendants |

### `remove`

Delete a file from disk and untrack it. **Destructive.**

```bash
npx underundre-helpers remove <path> [options]
```

Requires `--yes` or `--interactive`.

### `add-target`

Enable a new target and generate its files.

```bash
npx underundre-helpers add-target <name>
```

### `remove-target`

Delete all files for a target and untrack. **Destructive.**

```bash
npx underundre-helpers remove-target <name>
```

Requires `--yes` or `--interactive`.

### `list-transformers`

List available transformers.

```bash
npx underundre-helpers list-transformers [--json]
```

### `doctor`

Verify lock integrity and file hashes.

```bash
npx underundre-helpers doctor [--fix] [--clean]
```

| Flag | Description |
|---|---|
| `--fix` | Auto-correct safe issues (e.g., rebuild missing staging dir, recalculate hashes) |
| `--clean` | Delete all `.helpers_new` side-files left over from non-interactive conflict resolution |

### `recover`

Recover from a crashed sync/init run.

```bash
npx underundre-helpers recover <--resume | --rollback | --abandon>
```

Mutually exclusive flags. One required.

| Flag | Description |
|---|---|
| `--resume` | Re-attempt plan from first non-done entry |
| `--rollback` | Restore from backup, return to pre-sync state |
| `--abandon` | Delete journal + backup, leave files as-is. **Destructive.** Requires `--yes`. |

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Usage error (bad flags, unknown target) |
| `2` | Drift/conflicts detected (non-interactive mode) |
| `3` | Stale journal — run `helpers recover` |
| `4` | Untrusted custom transformer |
| `5` | Lock file schema mismatch |
| `≥10` | Internal error |
