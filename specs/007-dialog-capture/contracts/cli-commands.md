# Contract: CLI Commands (`helpers dialog-*`)

**Artifact**: `packages/cli/src/cli/dialog.ts`
**Spec refs**: FR-019 (backfill), FR-022 (renormalize), US6 (purge/recovery); operational tooling
**Research refs**: V1 (file-watch), V6 (CC log retention)

All commands are subcommands of the existing `helpers` CLI (Commander.js). Loaded via `packages/cli/src/cli/index.ts` registration. Each command writes structured logs to `~/.underboard/logs/dialog-<command>.log` and emits machine-readable output to stdout when `--json` is passed.

## `helpers dialog-backfill`

Ingest historical CC sessions from CC's own log catalog (per FR-018 forward-only default + FR-019 explicit command).

```
helpers dialog-backfill [--from <date>] [--to <date>] [--limit <n>] [--dry-run] [--skip-pruning] [--json]
```

### Flags

| Flag | Type | Default | Notes |
|------|------|---------|-------|
| `--from` | date (YYYY-MM-DD) | 90 days ago | Inclusive lower bound on CC session start time |
| `--to` | date (YYYY-MM-DD) | today | Inclusive upper bound |
| `--limit` | integer | 100 | Max sessions processed in one run; safety cap |
| `--skip-pruning` | flag | false | **Gemini F2 fix**: bypass retention pruning for this backfill run only. Prevents the "backfill vs retention race" where a large historical backfill would immediately delete the newly-discovered raw transcripts before the user can audit them. Normal `keep-N-sessions` + `size-cap-MB` resume on the next forward capture. Use during initial setup or audit windows. |
| `--dry-run` | flag | false | List candidates + projected redactions without writing any files |
| `--json` | flag | false | Machine-readable output (see schema below) |
| `--project <path>` | string | CWD | Target project (defaults to current working dir) |

### Behavior

1. Resolve CC's project log dir: `~/.claude/projects/<encoded-project-path>/`.
2. List `*.jsonl` files, filter by mtime within `[--from, --to]`.
3. Sort ascending by mtime; cap at `--limit`.
4. For each candidate:
   - If `--dry-run`: parse → project redactions → emit candidate record; no writes.
   - Otherwise: run the full capture pipeline (same as a forward capture): copy raw → normalize → atomic INDEX update → enqueue quarantine spool.
5. Quarantine window applies normally — backfilled records don't skip the quarantine even though they're "old". (Reason: redaction misses in historical sessions are caught during the quarantine window just like forward captures.)
6. Retention applies by default: if backfill overflows `keep-n-sessions`, oldest sessions (newly-backfilled included) are pruned per FR-009. **`--skip-pruning` defers pruning** to the next forward capture cycle (Gemini F2 fix — protects newly-backfilled sessions during initial audit window).

### Output (`--json`)

```json
{
  "command": "dialog-backfill",
  "range": { "from": "2026-03-15", "to": "2026-06-14" },
  "dry_run": false,
  "project": "C:\\Users\\Admin\\Documents\\Repos\\underhelpers\\under-ai-helpers",
  "candidates": [
    { "session_uuid": "...", "started_at": "...", "messages": 47, "size_bytes": 234567,
      "status": "ingested" /* | "skipped" | "failed" */,
      "normalized_file": ".ai/dialogs/log/2026-03-15-claude-<theme>.md",
      "redactions": 3 }
  ],
  "summary": { "ingested": 12, "skipped": 3, "failed": 0, "pruned_by_retention": 1 }
}
```

### Idempotency (SC-011)

Re-running backfill on the same range:

- Sessions already in `dialog_quarantine_spool` or `dialog_outage_spool` (matched by `session_uuid`) are skipped with `status: "skipped"` and a `skip_reason: "already-ingested"` field.
- Sessions whose normalized file exists AND content_hash matches the spool row are skipped.
- Sessions tombstoned are skipped with `skip_reason: "tombstoned"`.

### Exit codes

- `0`: all candidates processed (any mix of ingested/skipped/failed-per-candidate).
- `1`: CLI error (invalid flags, missing CC log dir, permission error).
- `2`: partial run aborted mid-way (Ctrl-C, OOM); resume by re-running — idempotency handles the rest.

---

## `helpers dialog-renormalize`

Re-run normalization on past records with a new (or specified) redaction catalog version (per FR-022).

```
helpers dialog-renormalize [--catalog-version <ver>] [--from <date>] [--to <date>] [--dry-run] [--json]
```

### Flags

| Flag | Type | Default | Notes |
|------|------|---------|-------|
| `--catalog-version` | string | current | Use a specific catalog version; defaults to whatever is currently in `presets/redaction/` |
| `--from` | date | all | Filter by capture date (inclusive) |
| `--to` | date | today | Filter by capture date (inclusive) |
| `--dry-run` | flag | false | Project redaction diffs without writing |
| `--json` | flag | false | Machine-readable output |

### Behavior

1. Find normalized records matching the date range (read INDEX.md, filter rows).
2. For each record:
   - Read the original raw transcript from `.ai/dialogs/raw/` (or `.partial/`).
   - If raw is missing (pruned by retention), read the existing normalized body as the "raw" input — re-redaction is best-effort in this case (existing redactions stay, new rules apply to surviving text).
   - Run normalization with the requested catalog version.
   - If `--dry-run`: emit projected diff (redactions added, removed, content_hash delta) without writing.
   - Otherwise: write the new normalized body to a temp file, atomic rename over the existing record. INDEX row metadata-only update (`redaction_count`, `redaction_catalog_version`, `flags: redacted:<new-count>`).
3. Honcho ingest: only if `content_hash` changed, enqueue a new quarantine spool entry (subject to the quarantine window). Tombstones still apply — if the new content_hash is tombstoned, skip ingest.
4. Sessions whose content_hash is UNCHANGED are no-ops (FR-022 idempotency) — no git diff, no INDEX change, no ingest.

### Output (`--json`)

```json
{
  "command": "dialog-renormalize",
  "catalog_version_from": "2026.06.1",
  "catalog_version_to": "2026.06.2",
  "range": { "from": "2026-01-01", "to": "2026-06-14" },
  "dry_run": false,
  "records": [
    { "normalized_file": "...",
      "raw_available": true,
      "content_hash_from": "...", "content_hash_to": "...",
      "changed": true,
      "redactions_from": 3, "redactions_to": 5,
      "diff_summary": { "added": ["gcp-api-key"], "removed": [] },
      "reingested": false /* true if new hash bypassed tombstone */ }
  ],
  "summary": { "total": 47, "changed": 5, "unchanged": 42, "reingested": 3 }
}
```

### Exit codes

- `0`: all records processed.
- `1`: CLI error.

---

## `helpers dialog-purge`

Purge a session from the archive (raw + normalized + INDEX + spool + Honcho + tombstone). Implements US6 acceptance scenarios 1–3.

```
helpers dialog-purge [--session <uuid>] [--pattern <regex>] [--rule-id <id>] [--from <date>] [--to <date>] [--dry-run] [--json]
```

### Flags

| Flag | Type | Default | Notes |
|------|------|---------|-------|
| `--session` | UUID | — | Purge a specific session by CC UUID |
| `--pattern` | regex | — | Purge sessions whose normalized body matches the regex (e.g., a leaked secret pattern) |
| `--rule-id` | string | — | Re-run a specific redaction rule across all matching sessions; rewrite + tombstone |
| `--from` / `--to` | date | all | Limit by capture date |
| `--dry-run` | flag | false | Show what would be purged without writing |
| `--json` | flag | false | Machine-readable output |

At least one of `--session` / `--pattern` / `--rule-id` MUST be specified (otherwise the command refuses to run — refuses to "purge everything").

### Behavior varies by mode

**`--session <uuid>`**: Purge that session entirely.

1. Remove `.ai/dialogs/raw/<file>.jsonl` (or archive per `archive-path`).
2. Remove `.ai/dialogs/log/<file>.md`.
3. Remove INDEX row (atomic rewrite of INDEX.md).
4. If in quarantine spool: set `status='purged'`, `purge_reason='manual'`.
5. If in outage spool or already ingested: tombstone (`dialog_tombstones` insert).
6. If Honcho Session exists: DELETE via Honcho client.

**`--pattern <regex>`**: Find sessions whose normalized body matches; for each, run the `--session` flow above. Outputs the list of matches and asks for confirmation unless `--yes` (which is **REFUSED** per Standing Order #3 — purge requires explicit session-by-session confirmation OR a documented batch-confirmation prompt).

Wait — Standing Order #3: "Never use `--force`, `--yes`, `-y` or any bypass flags." So batch purge needs interactive confirmation. The command prompts:

```
Found 5 sessions matching pattern.
Purge all? [y/N/inspect]
> inspect                 # show first 3 candidates with context
> y                       # confirmed; proceeds
```

**`--rule-id <id>`**: Redaction-miss recovery (US6 scenarios 2–3). Searches by the rule's PATTERN (not by the rule_id string in the body).

1. Load rule `<id>` from the current redaction catalog (`presets/redaction/catalog_*.yml`).
2. Compile the rule's regex.
3. Scan each session's normalized body for matches (i.e., the rule's pattern is present in unredacted form — meaning the rule SHOULD have caught it but didn't, because either (a) the rule is new, or (b) the rule was added/updated after this session was normalized).
4. For each session with matches:
   - Re-run the rule against the body (produces redacted replacements).
   - Rewrite the normalized file with the new redaction applied (atomic).
   - If the rule is sticky-recovery (FR-013), the new content_hash is NOT tombstoned (the user wants the corrected version ingested). Tombstone the OLD content_hash to prevent resurrection by re-normalization.
   - INDEX row metadata update with `flags: recovered:<date>`.

**Note on rule_id presence in body**: `rule_id` appears in already-normalized bodies only as the replacement text `[REDACTED:<rule_id>]`. Searching for the literal rule_id string would find already-redacted sessions, not unredacted misses. The `--rule-id` mode always uses the rule's regex pattern, not a string search.

### Output (`--json`)

```json
{
  "command": "dialog-purge",
  "mode": "session" /* | "pattern" | "rule-id" */,
  "dry_run": false,
  "purged": [
    { "session_uuid": "...", "normalized_file": "...", "raw_purged": true,
      "index_row_removed": true, "spool_status": "purged" /* | "tombstoned" */,
      "honcho_session_deleted": true }
  ],
  "summary": { "total": 1, "purged": 1, "skipped": 0 }
}
```

### Exit codes

- `0`: purge complete.
- `1`: CLI error.
- `2`: refused (no filter specified, or `--yes` attempted on batch purge).

---

## `helpers dialog-doctor`

Operational health check for the dialog-capture subsystem. Read-only.

```
helpers dialog-doctor [--json]
```

### Behavior

1. Probe underboard `/health` (Honcho reachability, version, queue depths).
2. Check `.claude/hooks/dialog-capture.mjs` exists and is registered in `.claude/settings.json`.
3. Check `helpers.config.ts#dialogs` is parseable; warn on any keys outside the documented schema.
4. Check `.ai/dialogs/{raw,log,INDEX.md}` exists per 006 baseline.
5. Check `presets/redaction/catalog_*.yml` exists and parses; report catalog version(s).
6. Probe last 5 capture events from `~/.underboard/logs/dialog-capture.log`; surface any errors.
7. Probe last 5 worker ticks from `~/.underboard/logs/dialog-ingest.log`; surface stalls.

### Output (`--json`)

```json
{
  "command": "dialog-doctor",
  "ok": true,
  "checks": [
    { "name": "underboard_health", "ok": true, "details": { "backend": "honcho", "version": "3.0.9" } },
    { "name": "capture_hook_registered", "ok": true },
    { "name": "capture_config_parseable", "ok": true, "details": { "capture": "on", "ingest": "on", "delay_days": 7 } },
    { "name": "dialogs_dirs_exist", "ok": true },
    { "name": "redaction_catalogs", "ok": true, "details": { "cloud": "2026.06.1", "pii": "2026.06.1" } },
    { "name": "recent_captures", "ok": true, "details": { "last_5": "all_success" } },
    { "name": "recent_worker_ticks", "ok": true, "details": { "stalled": 0 } }
  ],
  "warnings": [],
  "errors": []
}
```

### Exit codes

- `0`: all checks pass.
- `1`: warnings (catalog out of date, stalled records < 5).
- `2`: critical (Honcho unreachable > 1h, no worker tick in 1h, hook misregistered).

---

## `helpers dialog-internal-capture-event`

**Internal** — invoked by the `.claude/hooks/dialog-capture.mjs` Stop hook wrapper. Not advertised in `helpers --help`. Stable interface for the hook.

```
helpers dialog-internal-capture-event <stdin-json-event>
```

Reads the CC Stop hook event JSON from stdin, kicks off the file-watch + inactivity-timeout flow per `contracts/capture-hook.md`. Returns immediately (fire-and-forget from CC's perspective).

**Never invoked directly by users.** Exposed only because the hook needs a stable CLI entry point.
