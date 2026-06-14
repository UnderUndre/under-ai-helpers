# Data Model: 007-dialog-capture

**Phase 1 output of `/speckit.plan`** · entities + state machines driving the implementation. Field types are domain-level (string, integer, timestamp, foreign-key), not TypeScript primitives — those live in code.

## Entities

### 1. CC Session (external, read-only)

Source of truth for raw capture. Lives at `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl` (V6). Managed by Claude Code itself; we only read.

| Field | Type | Notes |
|-------|------|-------|
| `session_uuid` | string (UUID) | CC-assigned; stable across CC versions |
| `project_path_encoded` | string | URL-encoded CWD; CC's directory-naming convention |
| `started_at` | timestamp | First message timestamp |
| `last_activity_at` | timestamp | Last appended line's timestamp |
| `messages` | array<CCMessage> | JSONL lines, parsed defensively per V2 |

**Relationships**: 1 CC Session → 0..1 Raw transcript (our copy) → 1 Normalized record → 0..1 Honcho Session.

---

### 2. Raw Transcript (file artifact, gitignored)

Verbatim copy of CC Session JSONL, written to `.ai/dialogs/raw/<YYYY-MM-DD>-<session-id>-claude.jsonl`.

| Field | Type | Notes |
|-------|------|-------|
| `filename` | string | `<YYYY-MM-DD>-<session-id>-claude.jsonl` |
| `session_uuid` | string (FK → CC Session) | |
| `captured_at` | timestamp | Persisted finalize-trigger time (written once to `raw/<file>.meta.json` sidecar when watcher finalizes the raw transcript; normalizer reads this stable input — F6 fix) |
| `size_bytes` | integer | |
| `line_count` | integer | JSONL line count (used in US1 acceptance test) |
| `is_partial` | boolean | True if captured from `.partial/` after abnormal CC exit (US1 scenario 4) |
| `redaction_catalog_version` | string | Stamp of catalog at capture time (FR-021) |

**State machine**:

```
   CC appends to JSONL
            │
            ▼
   file-watch detects growth ───┐
            │                   │
            ▼                   │
   inactivity timeout (5 min)   │ (new activity)
            │                   │
            ▼                   │
   finalize: copy to raw/  ◄────┘
            │
            ▼
   retention check ─────► pruned (archived or relied on CC log)
```

---

### 3. Normalized Record (file artifact, tracked)

Plain-text markdown at `.ai/dialogs/log/<YYYY-MM-DD>-claude-<theme-slug>.md`. Two-section layout per FR-003 clarification.

| Field | Type | Notes |
|-------|------|-------|
| `filename` | string | `<YYYY-MM-DD>-claude-<theme-slug>.md` |
| `session_uuid` | string (FK → Raw Transcript) | |
| `theme_slug` | string | Derived from first user message; kebab-case, ≤30 chars |
| `normalized_at` | timestamp | |
| `redaction_catalog_version` | string | Stamp (FR-021) |
| `size_bytes` | integer | Total file size |
| `truncated` | boolean | True if body was truncated at `dialog-normalized-max-bytes` |
| `header_block` | object | Metadata: date, branch, model(s), token counts, files touched, derived decisions, schema-warnings count |
| `body_block` | string | Redacted message stream (markdown-formatted) |
| `raw_pointer` | string | Path to raw transcript (when truncated) |
| `redaction_log` | array<RedactionEntry> | Per-redaction record: pattern_id, location, action taken |
| `content_hash` | string (sha256) | Hash of normalized body; used for dedup (FR-008) |

**Lifecycle**: written once → may be rewritten by `dialog-renormalize` (FR-022) or `dialog-purge` (US6) → never deleted (tracked file; git history is the deletion log).

---

### 4. INDEX Row (file artifact, tracked)

A row in `.ai/dialogs/INDEX.md` (markdown table).

| Field | Type | Notes |
|-------|------|-------|
| `date` | date (YYYY-MM-DD) | |
| `tool` | enum | `claude-code` | `gemini` | `copilot` | `codex` | `other` |
| `branch` | string | Git branch at capture time |
| `theme` | string | Human-readable theme (derived from theme_slug) |
| `outcome` | string | Brief outcome derived via fallback chain: (1) last assistant message's first `text` block, trimmed to first sentence; (2) if no text block, last `tool_use` block's `name` + input summary (e.g., `Edited src/foo.ts`); (3) if neither (session ended mid-tool-call with no assistant text), the literal string `(no summary — session ended mid-tool-call)`. |
| `file_link` | string | Relative path to normalized record |
| `notes` | string (optional) | Hand-edited annotations; preserved across auto-updates |
| `flags` | string (optional) | Auto-set: `redacted:<count>`, `truncated`, `recovered:<date>` |

**Idempotency key**: `(date, session_uuid-derived file_link)`. Re-normalization of an indexed session MUST NOT add a duplicate row (FR-005).

---

### 5. Redaction Rule

A single pattern in the redaction catalog.

| Field | Type | Notes |
|-------|------|-------|
| `rule_id` | string | Stable ID across catalog versions (e.g., `aws-access-key-id`) |
| `pattern` | regex (string) | Match pattern |
| `action` | enum | `redact` (replace with `[REDACTED:<rule_id>]`) | `hash` (replace with sha256 prefix) | `allow` (allowlist — suppress false positive) |
| `description` | string | Human-readable explanation |
| `replacement` | string (optional) | Custom replacement text; default `[REDACTED:<rule_id>]` |
| `catalog_version` | string | Version of the catalog containing this rule (FR-021) |

---

### 6. Redaction Catalog

A versioned YAML file at `presets/redaction/catalog_*.yml`.

| Field | Type | Notes |
|-------|------|-------|
| `version` | string | Semver-ish (e.g., `2026.06.1`); stamped per normalized record |
| `rules` | array<RedactionRule> | |
| `allowlist` | array<AllowlistEntry> | Path-pattern + rule-id pairs that suppress matches |

---

### 7. Quarantine Spool Entry (SQLite row)

A normalized record waiting out its quarantine window before ingestion.

**Table**: `dialog_quarantine_spool` (in `~/.underboard/data.db`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer (PK, autoincrement) | |
| `session_uuid` | string | FK to CC Session |
| `normalized_file` | string | Relative path to normalized record |
| `content_hash` | string (sha256) | Hash of normalized body; dedup key |
| `captured_at` | timestamp | When capture completed |
| `graduates_at` | timestamp | `captured_at + dialog-ingest-delay-days` |
| `project_id` | string | FK to underboard `projects` table |
| `status` | enum | `pending` | `graduated` | `purged` |
| `purged_at` | timestamp (nullable) | Set when `dialog-purge` or recovery removes it |
| `purge_reason` | string (nullable) | `manual` | `recovery:<rule_id>` |

**State machine**:

```
   pending ──(graduates_at ≤ now AND underboard reachable)──► graduated ──► (move to outage spool path then ingest)
       │                                                              │
       │                                                              │
       └──(dialog-purge OR recovery during window)────► purged         │
                                                                        │
                                                          (ingest succeeds) ──► row archived/deleted
```

**Constraint**: `UNIQUE(content_hash, project_id)` — same normalized content in same project is enqueued once.

---

### 8. Outage Spool Entry (SQLite row)

A graduated record waiting for underboard to recover.

**Table**: `dialog_outage_spool`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer (PK) | |
| `session_uuid` | string | |
| `normalized_file` | string | |
| `content_hash` | string | |
| `graduated_at` | timestamp | When it left quarantine |
| `project_id` | string | |
| `attempts` | integer | Failed ingest attempts; backoff input |
| `last_attempt_at` | timestamp (nullable) | |
| `status` | enum | `pending` | `ingested` | `tombstoned` |

---

### 9. Tombstone (SQLite row)

Marks a Honcho Session as deleted; prevents re-ingestion from re-normalization.

**Table**: `dialog_tombstones`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer (PK) | |
| `content_hash` | string (UNIQUE) | The hash that must NEVER be re-ingested |
| `session_uuid` | string | |
| `honcho_session_id` | string (nullable) | If ingestion completed before tombstone |
| `tombstoned_at` | timestamp | |
| `reason` | string | `manual` | `recovery:<rule_id>` |

**Semantics**: `ingest()` checks tombstones by content_hash before posting to Honcho. Re-normalization that produces the same hash is a no-op; a different hash bypasses (intentional — the catalog update changed content).

---

### 10. Capture Config

The per-repo configuration block (extends `helpers.config.ts#dialogs`).

| Key | Type | Default | Range | Notes |
|-----|------|---------|-------|-------|
| `capture` | `"on"` \| `"off"` | `"on"` | — | Master switch (FR-010) |
| `ingest` | `"on"` \| `"off"` | `"on"` | — | Full opt-out (FR-006b) |
| `ingest-delay-days` | integer | `7` | 0–90 | Quarantine window (FR-006a) |
| `normalized-max-bytes` | integer | `65536` (64 KiB, post gemini.md F4) | 8192–1048576 | Truncation threshold (FR-003) |
| `keep-n-sessions` | integer | `30` | 1–1000 | Retention: count |
| `size-cap-mb` | integer | `500` | 50–10000 | Retention: size |
| `archive-path` | string (nullable) | `null` | — | Where pruned raw files are moved (null = delete, rely on CC log) |
| `redaction-catalog-dir` | string | `presets/redaction/` | — | Catalog location |
| `external-scanner` | string (nullable) | `null` | — | Hook command (e.g., `trufflehog filesystem --no-update`) |

---

### 11. Honcho Session (external, V4)

Honcho v3 representation of one CC session. Lives in `http://localhost:7e76f2a0.../v3/workspaces/<workspace_id>/sessions/<session_id>`.

| Field | Type | Notes |
|-------|------|-------|
| `session_id` | string | Honcho-assigned |
| `workspace_id` | string | Derived from project stable key per 008 mapping |
| `title` | string | `<YYYY-MM-DD> <theme>` (matches normalized record filename stem) |
| `metadata` | object | `{cc_session_uuid, content_hash, normalized_file, captured_at}` |
| `messages` | array<HonchoMessage> | One per CC message |

---

### 12. Honcho Message (external, V4)

| Field | Type | Notes |
|-------|------|-------|
| `message_id` | string | Honcho-assigned |
| `session_id` | string (FK) | |
| `sender_id` | string | `__dialog-capture__` reserved peer (F8 fix; namespace-isolated from real agent peers; per 008 agent → peer mapping extended with reserved-prefix rule) |
| `content` | string | Redacted message body (single string; multi-block CC messages joined) |
| `timestamp` | timestamp | From CC message |
| `metadata` | object | `{cc_role, cc_block_types, cc_message_uuid}` |

---

### 13. Ingestion Worker Event (transient)

Signals that trigger the worker per FR-020.

| Type | Trigger | Action |
|------|---------|--------|
| `underboard-recovered` | Honcho health probe transitions unreachable → reachable | Drain outage spool + any newly graduated quarantine entries |
| `capture-completed` | Capture pipeline finishes normalizing a session | Check if any new records graduated (relevant when `ingest-delay-days: 0`) |
| `safety-net-tick` | Cron-like 5-minute timer | Drain whatever's ready; backstop for missed events |

---

## Entity Relationship Diagram

```
   CC Session (external)
        │
        │ 1:1 (verbatim copy)
        ▼
   Raw Transcript (file, gitignored)
        │
        │ 1:1 (normalize)
        ▼
   Normalized Record (file, tracked) ───── content_hash ─────┐
        │                                                     │
        │ 1:1 (index entry)                                   │
        ▼                                                     │
   INDEX Row (file, tracked)                                  │
                                                              │
   Normalized Record ──── ingests ────► Quarantine Spool ───► (graduates) ───► Outage Spool ───► Honcho Session
                                              │                                       │              │
                                              │                                       │              │ 1:N
                                              ▼                                       ▼              ▼
                                          (purge)                                (tombstone)   Honcho Message
                                              │                                       │
                                              ▼                                       │
                                          (no ingestion)                          Tombstone row
                                                                                      │
                                                                          (blocks re-ingest by content_hash)
```

## State Machine Summaries

### Record lifecycle (end-to-end)

```
[CC Session] →capture→ [Raw] →normalize→ [Normalized + INDEX row]
                                         │
                                         │ (if dialog-ingest: on)
                                         ▼
                                  [Quarantine Spool: pending]
                                         │
                                  (window expires)
                                         │
                                         ▼
                                  [Quarantine: graduated]
                                         │
                                  (underboard reachable?)
                                  ├── yes → [Outage Spool: pending] → ingest → [Honcho Session] → (recallable)
                                  └── no  → [Outage Spool: pending] → (wait) → (underboard-recovered event) → ingest
```

### Failure / recovery paths

```
[Normalized + INDEX] ──(redaction miss found, in quarantine)──► dialog-purge → [Quarantine: purged] → (no Honcho Session ever)
[Honcho Session]     ──(redaction miss found, post-ingestion)──► dialog-purge → [Tombstone] → (recall blocks it; re-normalize is no-op)
[Normalized + INDEX] ──(catalog update via renormalize)────────► rewrite file → INDEX metadata-only update → (no re-ingest unless content_hash changed)
```

## Validation rules summary (cross-reference to FRs)

- FR-001: Raw filename format + capture within 5s + non-blocking → enforced by watcher contract
- FR-003: Normalized file schema + determinism → content_hash + defensive parsing
- FR-004: Redaction rule catalog + allowlist + external-scanner hook
- FR-005: INDEX idempotency key (date, file_link) + atomic write-temp + rename
- FR-006/006a/006b: Quarantine graduates_at + dialog-ingest flag
- FR-008: Tombstone table + content_hash dedup
- FR-009: keep-n-sessions + size-cap-mb + archive-path
- FR-019: dialog-backfill idempotency via content_hash
- FR-020: 3 worker event types
- FR-022: dialog-renormalize stamps new catalog_version, only rewrites changed files
