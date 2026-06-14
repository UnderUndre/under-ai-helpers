# Contract: Ingestion Pipeline (Spools + Worker + Honcho)

**Artifact**: `packages/underboard/src/dialog-ingest/*` + `~/.underboard/data.db` (3 new tables)
**Spec refs**: FR-006, FR-006a, FR-006b, FR-007, FR-008, FR-015, FR-020; SC-004, SC-008, SC-010
**Research refs**: V3 (chunking strategy), V4 (Honcho Session+Message)

## SQLite schema (migration `0011-dialog-spools.sql`)

```sql
-- Quarantine spool: normalized records waiting out their delay window
CREATE TABLE IF NOT EXISTS dialog_quarantine_spool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uuid TEXT NOT NULL,
  normalized_file TEXT NOT NULL,                  -- relative path to .md
  content_hash TEXT NOT NULL,                     -- sha256 of normalized body
  captured_at TEXT NOT NULL,                      -- ISO-8601
  graduates_at TEXT NOT NULL,                     -- captured_at + delay-days
  project_id TEXT NOT NULL,                       -- FK to underboard.projects
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'graduated', 'purged')),
  purged_at TEXT,
  purge_reason TEXT,
  UNIQUE (content_hash, project_id)               -- dedup within project (FR-008)
);

CREATE INDEX IF NOT EXISTS idx_dialog_quarantine_graduates
  ON dialog_quarantine_spool (graduates_at, status);

-- Outage spool: graduated records waiting for Honcho to recover
CREATE TABLE IF NOT EXISTS dialog_outage_spool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uuid TEXT NOT NULL,
  normalized_file TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  graduated_at TEXT NOT NULL,
  project_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  next_retry_at TEXT,                             -- backoff schedule
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ingested', 'tombstoned')),
  honcho_session_id TEXT                          -- set on successful ingest
);

CREATE INDEX IF NOT EXISTS idx_dialog_outage_pending
  ON dialog_outage_spool (status, next_retry_at);

-- Tombstones: content_hashes that must never be re-ingested (US6 recovery)
CREATE TABLE IF NOT EXISTS dialog_tombstones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_hash TEXT NOT NULL UNIQUE,              -- dedup key
  session_uuid TEXT NOT NULL,
  honcho_session_id TEXT,                         -- null if purged pre-ingestion
  tombstoned_at TEXT NOT NULL,
  reason TEXT NOT NULL                            -- 'manual' | 'recovery:<rule_id>'
);

CREATE INDEX IF NOT EXISTS idx_dialog_tombstones_hash
  ON dialog_tombstones (content_hash);
```

**Migration applies idempotently** (`CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`). Safe to re-run.

## Honcho v3 client (`packages/underboard/src/dialog-ingest/honcho-client.ts`)

Thin REST client over `undici` (already available transitively in `packages/underboard/`).

### Endpoint surface used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/workspaces` | POST | Auto-create workspace for project (per 008 mapping) |
| `/v3/workspaces/{ws}/sessions` | POST | Create Honcho Session for a CC session |
| `/v3/workspaces/{ws}/sessions/{id}/messages` | POST | Add a CC message as a Honcho Message |
| `/v3/workspaces/{ws}/sessions/{id}` | DELETE | Soft-delete with cascade (V7 empirical: Session + Messages hidden immediately; physically purged after server-side retention window, default 30 days). Used by tombstone propagation. Tombstone is the authoritative anti-resurrection record; Honcho soft-delete is defense-in-depth. |
| `/v3/workspaces/{ws}/sessions:search` | POST | Recall by semantic query (US4) |
| `/health` | GET | Liveness probe (FR-020 trigger source) |

**Pinned version**: Honcho v3.0.9 (matches 008/FR-011). Version-mismatch warning only; never crash.

### Mapping (per 008 + V4 decisions)

| Underboard concept | Honcho v3 entity |
|---------------------|------------------|
| Project (stable key) | Workspace (deterministic name per 008) |
| CC session | Session (title = `<YYYY-MM-DD> <theme>`) |
| CC message | Message (sender = `__dialog-capture__` reserved peer — F8 fix; namespace-isolated from real agent peers per 008 mapping) |
| `dialog_delete` MCP tool | DELETE on Honcho Session + tombstone insert (NEW tool, NOT `memory_delete`) |

**Chunking** (V3): one Honcho Message per CC message — not per session. Typical CC message < 5 KB, well under any per-message limit. A 6-hour CC session produces 50–500 Messages; Honcho handles thousands per Session.

## Worker (`packages/underboard/src/dialog-ingest/worker.ts`)

Per FR-020, the worker triggers on three signals:

```ts
type WorkerEvent =
  | { type: 'underboard-recovered' }     // Honcho health transitioned unreachable → reachable
  | { type: 'capture-completed', sessionUuid: string }  // capture pipeline finished
  | { type: 'safety-net-tick' };         // 5-min cron
```

### Worker algorithm

```
On any event:
  1. Probe Honcho /health
     - If unreachable: log + exit (wait for next event)
     - If reachable: continue

  2. Graduate eligible quarantine entries:
     SELECT * FROM dialog_quarantine_spool
      WHERE status = 'pending'
        AND graduates_at <= now()
     For each:
       BEGIN TRANSACTION
         INSERT INTO dialog_outage_spool (...)
         UPDATE dialog_quarantine_spool SET status = 'graduated'
       COMMIT

  3. Drain outage spool:
     SELECT * FROM dialog_outage_spool
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= now())
      ORDER BY graduated_at
      LIMIT 100                                   -- bound per tick
     For each:
       - Check dialog_tombstones by content_hash
         - If tombstoned: mark as 'tombstoned', skip
       - Read normalized_file, parse markdown
       - Check Honcho for existing session by metadata.cc_session_uuid
         - If exists (idempotent re-run): mark as 'ingested', skip
       - POST Honcho Session (title, metadata)
       - POST one Honcho Message per CC message (stream; not buffered)
       - On success: UPDATE status='ingested', honcho_session_id=...
       - On failure:
         - INCREMENT attempts
         - SET last_attempt_at = now()
         - SET next_retry_at = now() + min(backoff(attempts), 1h)
           backoff(n) = 30s * 2^n

  4. Log summary: graduated=N, ingested=N, failed=N, tombstoned=N
```

### Backoff policy

- `attempts=1` → retry in 30s
- `attempts=2` → retry in 60s
- `attempts=3` → retry in 2min
- `attempts=4` → retry in 4min
- `attempts=5` → retry in 8min
- `attempts≥6` → retry in 1h (cap)

After 24h of continuous failure, the worker emits a `dialog-ingest-stalled` warning to `~/.underboard/logs/dialog-ingest.log` and continues retrying at the 1h cap.

## Reconciliation protocol (outage → recovery)

When underboard recovers (`underboard-recovered` event):

1. Health probe → reachable.
2. Graduate any newly-eligible quarantine entries (step 2 above).
3. Drain outage spool (step 3 above) — typically empties within 1–2 ticks for small backlogs.
4. SC-008 contract: all records that graduated their quarantine window pre-recovery complete ingestion within 60 s of recovery (bounded by `LIMIT 100` per tick + 1s tick gap).

## Dedup + tombstone semantics (FR-008)

### Idempotent ingest

Three layers protect against duplicates:

1. **Quarantine UNIQUE(content_hash, project_id)** — same normalized content never enqueued twice.
2. **Tombstone check** — `dialog_tombstones.content_hash` blocks ingest at step 3.
3. **Honcho metadata check** — before POSTing a Session, query by `metadata.cc_session_uuid`; if a Session with that UUID exists, treat as already ingested.

Re-normalization that changes content (new catalog version, stricter redaction) produces a different `content_hash`, so it bypasses the tombstone (intentional — the user wants the new version). Re-normalization that doesn't change content produces the same hash → no-op (FR-022 idempotency).

### `dialog_delete` integration (renamed from `memory_delete` post-external-review F1)

007 introduces a **new** MCP tool `dialog_delete` (file `packages/underboard/src/tools/dialog/delete.ts`), distinct from 005/008's `memory_delete`. The existing `memory_delete` operates on Conclusions (008) and remains unchanged (008/FR-001 frozen).

When an agent calls `dialog_delete`:

1. `dialog_delete` tool routes to dialog-ingest's `deleteDialog(session_uuid | content_hash)`.
2. Check `dialog_outage_spool` for an in-flight ingest of this `content_hash`:
   - If found (`status='pending'` and ingest worker is mid-Session-POST): worker completes the in-flight ingest (idempotent via Honcho metadata check — re-POSTed Messages are no-ops for already-present UUIDs), THEN issues DELETE.
   - If found and `honcho_session_id` is set (Session was created, possibly with partial Messages): Honcho DELETE on the Session cascades to all Messages (V7 empirical: confirmed cascade).
   - If not found in outage spool (ingest never started): tombstone alone suffices.
3. Issue `DELETE /v3/workspaces/{ws}/sessions/{id}` via Honcho client (soft-delete with cascade per V7; recoverable within Honcho's server-side retention window, default 30 days).
4. INSERT into `dialog_tombstones` (`content_hash`, `session_uuid`, `honcho_session_id`, `reason`).
5. UPDATE outage spool row to `status='tombstoned'` (if it existed).

**Tombstone is the authoritative anti-resurrection record**. Honcho's own soft-delete is defense-in-depth — even if Honcho's retention window expires and the row is hard-purged, the tombstone persists locally and blocks re-ingest. Re-normalization that produces the same `content_hash` is a no-op (US4 acceptance scenario 6); a different `content_hash` bypasses (intentional — the user wants the new version).

## Project-scoped recall (FR-015, FR-023, FR-026)

007 introduces **new** MCP tools (`dialog_recall`, `dialog_recall_cross_project`) in `packages/underboard/src/tools/dialog/`. The existing 005/008 tools (`memory_recall`, `memory_recall_cross_project`) remain unchanged and return only notes/Conclusions.

`dialog_recall` routes to Honcho `/v3/workspaces/{ws}/sessions:search` (verification V8 pending) where `{ws}` is the current project's workspace only. `dialog_recall_cross_project` enumerates all project workspaces and merges results by `relevance_score` descending. Default isolation preserved: cross-project dialog recall requires the explicit `dialog_recall_cross_project` tool.

## Recall schema (FR-024)

`dialog_recall` and `dialog_recall_cross_project` return `DialogRecallResult[]`. This schema is **distinct** from 005's `MemoryRecallResult` (which has `score` + `similarity` for notes/Conclusions); consumers destructure by tool, not by guessing a discriminator.

```ts
type DialogRecallResult = {
  session_uuid: string;
  theme: string;
  date: string;                  // YYYY-MM-DD
  relevance_score: number;       // 0..1 (Honcho-provided, V8 verification pending)
  excerpt: string;               // matching Message content (redacted)
  normalized_file: string;       // link to full normalized record
  honcho_session_id: string;
  project_id?: string;           // only on cross-project results
};
```

Agents receive this shape via the new `dialog_recall` / `dialog_recall_cross_project` tools only. `memory_recall` is unchanged and never returns dialog-type results (contract boundary enforced — see spec US4 acceptance scenario 7).

## Failure modes table

| Failure | Behavior | User-visible |
|---------|----------|--------------|
| Honcho `/health` 5xx | Worker exits; waits for next event | Ingestion deferred; raw/normalized/INDEX unaffected |
| Honcho Session POST 4xx (bad workspace) | Auto-create workspace (008 mapping); retry once | Transparent |
| Honcho Message POST 5xx (transient) | Backoff per attempts counter | Ingestion deferred |
| Honcho Message POST 4xx (payload too large) | Log + skip that Message; mark partial | Some Messages missing from Session |
| SQLite write fails | Crash + restart underboard (existing recovery) | Worker resumes from last committed transaction |
| Tombstone check fails (DB error) | Fail-closed: skip ingest, retry next tick | No ingest until DB recovers |
| Normalized file missing on disk | Log + skip; mark `normalized_file_missing` | Session not recallable; row remains for retry |

## Health endpoint extension

underboard's existing `/health` endpoint adds a `dialog_ingest` section:

```json
{
  "status": "ok",
  "memory_backend": "honcho",
  "dialog_ingest": {
    "quarantine_pending": 12,
    "outage_pending": 0,
    "tombstones_total": 3,
    "last_worker_tick": "2026-06-14T12:34:56Z",
    "last_graduation": "2026-06-14T12:30:00Z",
    "last_successful_ingest": "2026-06-14T12:30:05Z",
    "stalled_records": 0
  }
}
```

`stalled_records` = count of outage rows with `attempts >= 6`. If non-zero, the doctor check flags it.

## Doctor check extension

`helpers dialog-doctor` (see cli-commands.md) reads `/health` and surfaces:

- Active backend (Honcho reachable? version?)
- Quarantine queue depth (N pending, oldest age)
- Outage queue depth (N pending, oldest age, max attempts)
- Tombstone count
- Last worker tick timestamp
- Any stalled records (attempts ≥ 6)

Exits 0 if healthy, 1 if any warnings (stalled records, queue growing unboundedly), 2 if critical (no worker ticks in 1h, Honcho unreachable >1h).
