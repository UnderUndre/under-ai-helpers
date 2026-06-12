# Contract — New CLI Subcommands

Both commands: citty-based, consola logging, ESM, no new dependencies. Exit codes follow existing CLI conventions (0 ok, 1 error, 2 drift/violation).

## `helpers migrate` (FR-014)

Migrate a legacy full-template consumer to packs.

```
helpers migrate [--dry-run] [--source <repo-ref>]
```

| Step | Behavior |
|------|----------|
| Detect | Hash-compare consumer `.claude/{commands,agents,skills}` against upstream catalog manifest (reuses `core/hash.ts`, `core/manifest.ts`). Classify: `identical` / `slot-modified` (diff only inside HELPERS:CUSTOM slots) / `consumer-authored`. |
| Propose | Minimal pack set covering identical+slot-modified components; table output (cli-table3). |
| Confirm | `@inquirer/prompts` interactive confirmation. **No `--yes` flag exists** (Standing Order #3). `--dry-run` stops here. |
| Apply | Remove `identical` duplicates; `slot-modified` → slot content extracted and reported for manual port, file preserved; `consumer-authored` → never touched (FR-014). |
| Re-run | Pure function of tree state; second run reports "nothing to migrate", exit 0. |

Exit codes: 0 = migrated or nothing to do; 1 = error; 2 = unresolvable conflicts found (report only, nothing deleted).

## `helpers presets apply` (FR-008, FR-011)

```
helpers presets apply [--dry-run] [--only permissions|statusline]
```

| Aspect | Behavior |
|--------|----------|
| Source | `presets/permissions.json`, `presets/statusline.mjs` from installed pack / upstream fetch |
| Target | consumer `.claude/settings.json` (+ statusline script copied to `.claude/statusline.mjs`) |
| Merge | union + dedupe of `permissions.allow`/`deny`; consumer entries never removed; `statusLine` key set only if absent (existing consumer statusline wins; `--only statusline` + explicit confirm to overwrite) |
| Idempotence | re-run on applied state = no-op, exit 0 |
| Safety | staged write + journal (reuses `core/staging.ts`/`core/journal.ts`); `--dry-run` prints unified diff |

## `helpers doctor` — new check (R9)

`doctor/checks/packs.ts`: reads installed packs (consumer settings/plugin state), verifies every `dependsOn` is satisfied; missing dep → warning with `/plugin install <dep>@underundre` hint. Read-only.

## `helpers regen` / `sync` / `status` — extended surface (FR-012)

- `regen`: additionally runs pack assembly (validate → assemble → write `packs/` + `.claude-plugin/marketplace.json`).
- `status --strict`: drift detection automatically covers the new generated trees (they are pipeline outputs — no new mechanism, research R10). Exit 2 on hand-edited pack files.
