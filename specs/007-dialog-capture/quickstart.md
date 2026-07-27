# Quickstart: 007-dialog-capture

**Phase 1 output of `/speckit.plan`** · test scenarios mapped to spec user stories. Each scenario is independently runnable end-to-end and exercises one acceptance criterion. Ordered for incremental verification — earlier scenarios unlock later ones.

## Prerequisites

- Repo on `specs/007-dialog-capture` branch (or merged to `main`).
- `npm install` from repo root (pulls new `chokidar` dep).
- `cd packages/cli && npm run build` produces `dist/`.
- `cd packages/underboard && npm run build` produces `dist/`.
- Honcho Docker stack running (Postgres + pgvector + Redis + TEI) — same stack 008 depends on. Verify with `curl http://localhost:7e76f2a0.../health` (return `{"status":"ok"}`).
- underboard service running: `cd packages/underboard && npm start`.
- A test consumer repo with `.claude/` populated (run `npx clai-helpers init --source github:UnderUndre/under-ai-helpers` in a temp dir).

---

## Scenario 1 — US1: Clean session-end capture (P1)

**Tests**: FR-001, FR-002, SC-001; acceptance scenarios 1, 3.

### Setup

In the test consumer repo, ensure `.ai/dialogs/raw/` exists and is empty.

### Steps

1. Start a Claude Code session in the test repo.
2. Send 3 messages; receive 3 assistant responses (use simple prompts so the transcript is short).
3. Close the CC session cleanly (Ctrl-D or `/exit`).
4. Wait 6 minutes (inactivity-timeout default 5 + 1 min margin).
5. List `.ai/dialogs/raw/`.

### Verify

- ✅ Exactly one new file in `.ai/dialogs/raw/`, named `<YYYY-MM-DD>-<session-uuid>-claude.jsonl`.
- ✅ File is parseable JSONL; line count matches what CC logged.
- ✅ `is_partial: false` in the normalized header (capture was clean).
- ✅ File appeared within `(inactivity-timeout-minutes + 5s)` of last CC activity (SC-001 post-drift budget: default = 5 min inactivity + 5s finalization = ~5 min 5 s).
- ✅ CC session was NOT blocked by capture (no perceptible delay at session close).

### Concurrent variant (scenario 3)

Run step 1–4 in two terminals simultaneously against the same repo. Verify two distinct files written, no filename collision, no overwrite.

---

## Scenario 2 — US2: Redaction on planted secrets (P1)

**Tests**: FR-003, FR-004, SC-002, SC-006; acceptance scenarios 1, 2, 4.

### Setup

Create a fixture CC transcript with planted secrets. Easiest path: take a real CC session JSONL and inject known patterns.

```bash
# Use the seed fixture
cp packages/cli/tests/fixtures/golden/redaction/seeds/aws-access-key.jsonl \
   ~/.claude/projects/<encoded>/test-aws-<uuid>.jsonl
```

### Steps

1. Trigger normalization manually: `helpers dialog-backfill --session test-aws-<uuid> --dry-run`.
2. Inspect projected redaction output (should show `aws-access-key-id` rule firing on the planted key).
3. Run for real: `helpers dialog-backfill --session test-aws-<uuid>`.
4. Open `.ai/dialogs/log/<date>-claude-<theme>.md`.

### Verify

- ✅ The planted AWS key is replaced with `[REDACTED:aws-access-key-id]` in the body.
- ✅ Redaction log entry exists with rule_id, location, action.
- ✅ Frontmatter `redaction_count: 1`, `redaction_catalog_version: <current>`.
- ✅ Re-running normalization produces byte-identical output (determinism — FR-003).
- ✅ A non-CC reader (any markdown viewer, or a Gemini CLI session opening the file) sees the same fields.

### FP baseline probe (V5) + first-ingestion dry-run (gemini.md F3)

**First-ingestion policy (post gemini.md F3)**: any new install of 007 SHOULD run `dialog-backfill --dry-run` against the user's CC log catalog as the **first action**, before any real ingestion. The dry-run output lets the user:

1. See projected redactions per rule (TP/FP classification sample).
2. Tune `presets/redaction/allowlist.yml` to suppress FPs before they pollute the archive.
3. Decide on `dialog-ingest-delay-days` based on observed sensitivity (high secret density → longer quarantine window).
4. Only after dry-run looks clean → run real `dialog-backfill --skip-pruning` (gemini.md F2 — protect newly-backfilled raw files from immediate retention pruning during audit window).

**FP baseline probe procedure**:

1. Run `helpers dialog-backfill --from 2026-01-01 --to 2026-06-14 --dry-run --json` against the real CC log catalog of this repo.
2. Count matches per rule_id.
3. Manually classify a sample of 20 matches as TP/FP.
4. If FP rate > 1%, tune the allowlist in `presets/redaction/catalog_*.yml` and re-run.

This is the empirical gate for SC-002's "false-positive rate documented and tunable".

---

## Scenario 3 — US3: INDEX atomicity under crash (P2)

**Tests**: FR-005; acceptance scenarios 2, 3.

### Setup

5 short CC sessions captured normally (run scenario 1 five times). INDEX.md should have 5 rows.

### Steps

1. Start a 6th session.
2. While the normalizer is running (or simulate via `helpers dialog-renormalize --rule-id test` over the 5 records), kill the process mid-write (`taskkill /F /PID <pid>` or `kill -9`).
3. Inspect `.ai/dialogs/INDEX.md`.
4. Re-run the renormalize.

### Verify

- ✅ After kill: INDEX.md is either the pre-kill state OR the post-rewrite state — never a half-written mix (atomic write-temp + rename).
- ✅ After re-run: 5 (or 6) rows present, no duplicates (idempotency on session_uuid).
- ✅ Hand-edited annotations on prior rows (e.g., a `notes` column entry) are preserved across re-runs.

---

## Scenario 4 — US4: Semantic recall across dialogs (P2)

**Tests**: FR-006, FR-008, FR-015, SC-004; acceptance scenarios 1, 3, 6.

### Setup

Seed 10 normalized records covering 2 themes. Use `dialog-backfill` to ingest historical CC sessions, or fabricate records via a test fixture that drops 10 `.md` files + INDEX rows directly.

Set `dialog-ingest-delay-days: 0` in test config (so quarantine graduates immediately).

### Steps

1. Trigger a worker tick: `curl -X POST http://localhost:<port>/internal/dialog-ingest-tick` (test-only endpoint) OR wait for the safety-net tick.
2. Verify all 10 records moved from `dialog_quarantine_spool.status='graduated'` → `dialog_outage_spool.status='ingested'` → Honcho Sessions created.
3. From a fresh CC session in the same repo, call `memory_recall` with a paraphrase of one theme (e.g., original dialog was about "refresh-token rotation"; query "how do we handle token expiry?").

### Verify

- ✅ The relevant dialog appears in top-5 results (SC-004, K=5).
- ✅ Result includes `type: 'dialog'`, `session_uuid`, `normalized_file` link, `relevance_score`.
- ✅ Query on an UNCOVERED theme returns zero dialog-type results (no false positives).
- ✅ Calling `memory_delete` on one result, then re-ingesting the same session, produces no resurrection (tombstone works — acceptance scenario 6).

### Cross-project isolation check (acceptance scenario 1, second half)

Run the same `memory_recall` from a DIFFERENT project workspace. Verify zero dialog-type results from the original project (project-scoped default per FR-015).

---

## Scenario 5 — US5: Retention pruning (P3)

**Tests**: FR-009, SC-005.

### Setup

Set `keep-n-sessions: 3` in test config. Capture (or backfill) 5 sessions.

### Steps

1. After 5 sessions captured, list `.ai/dialogs/raw/`.
2. Check INDEX.md row count.
3. Check normalized files in `.ai/dialogs/log/`.

### Verify

- ✅ `.ai/dialogs/raw/` contains only the 3 most recent transcripts (oldest 2 pruned).
- ✅ INDEX.md still has all 5 rows (normalized files persist; pruning is raw-only).
- ✅ Pruned raw files exist in `archive-path` if configured, OR are recoverable from CC's own log (`~/.claude/projects/<encoded>/`) per V6.

### Size-cap variant

Set `size-cap-mb: 1`. Capture sessions until total raw size > 1 MB. Verify oldest-first pruning brings raw under 1 MB within one capture cycle.

---

## Scenario 6 — US6: Redaction-miss recovery (P3)

**Tests**: FR-013, SC-009; acceptance scenarios 1, 2, 3.

### Setup (post-ingestion branch)

1. Capture a session with a deliberately-weak catalog that misses a specific pattern (e.g., a custom token format `MYCO-TOKEN-<32-hex>` not in the default catalog).
2. Ingest with `dialog-ingest-delay-days: 0` so the record reaches Honcho.
3. Confirm the token is searchable in Honcho (redaction miss = leak).

### Steps — recovery from Honcho

1. Add a new rule to `presets/redaction/catalog_pii.yml`:

   ```yaml
   - id: myco-token
     pattern: 'MYCO-TOKEN-[a-f0-9]{32}'
     action: redact
   ```

2. Bump catalog version.
3. Run `helpers dialog-purge --rule-id myco-token`.
4. Inspect output: should report 1 session affected.
5. Check Honcho: original Session deleted (tombstoned).
6. Check normalized file: rewritten with `[REDACTED:myco-token]` applied.
7. Check INDEX row: `flags: recovered:<date>`.
8. Re-normalize the same session: new content_hash bypasses tombstone (intentional) → new ingest with corrected redaction.

### Setup (quarantine-window branch)

Repeat steps 1–2 but with `dialog-ingest-delay-days: 7`. The record sits in quarantine spool, never reaching Honcho.

### Steps — recovery during quarantine

1. Same catalog update + `dialog-purge --rule-id myco-token`.
2. Verify the quarantine spool entry is purged (`status: 'purged'`), not tombstoned.
3. Verify no Honcho Session was ever created.

### Verify (both branches)

- ✅ Recovery command runs < 5 s (SC-009).
- ✅ Sticky: re-normalization preserves the stricter redaction (FR-013).
- ✅ Quarantine branch: zero Honcho footprint (no tombstone needed).
- ✅ Post-ingestion branch: tombstone prevents resurrection by re-ingest of the OLD hash; new hash is eligible (corrected version).

---

## Edge-case probes

### Edge 1 — Schema drift in CC JSONL

Modify a fixture JSONL to include an unknown content block type (e.g., `{"type": "future_block", "data": "..."}`).

**Verify**: normalizer counts `schema_warnings: 1` in frontmatter, renders the unknown block as `<details><summary>unknown-block:future_block</summary>...</details>`, continues parsing. No hard failure.

### Edge 2 — Concurrent normalizer race

Two parallel invocations of `helpers dialog-renormalize` against the same record (simulated via two terminals).

**Verify**: atomic write-temp + rename ensures one wins cleanly; the other either no-ops (same content_hash) or sees the new file on retry. No corruption.

### Edge 3 — Large transcript streaming

Capture a session that read 50 large files (>50 MB JSONL total).

**Verify**: normalizer streams the file (does not buffer in memory); total wall-clock < 30 s; body truncated at `dialog-normalized-max-bytes` with raw pointer; INDEX row added normally.

### Edge 4 — Underboard outage during capture

Stop the underboard service mid-capture.

**Verify**: raw + normalized + INDEX updates complete normally. Quarantine spool write fails (underboard is down) — the capture logs a warning and defers the spool enqueue. Restart underboard; run `helpers dialog-doctor`; safety-net tick picks up the deferred entry.

### Edge 5 — CC crash mid-session

Start a CC session, send messages, kill CC process (`kill -9`).

**Verify**: chokidar watcher (running in detached child from last Stop hook) eventually times out → finalizes a `.partial` raw file. On next CC session start, the `.partial/` orphan is promoted to clean `raw/` after `partial-promotion-age-minutes`. Normalized record carries `is_partial: true` in frontmatter.

### Edge 6 — Catalog version mismatch

A consumer with catalog version `2026.06.1` receives normalized records stamped `2026.06.2` from a different machine.

**Verify**: their local `dialog-renormalize --catalog-version 2026.06.2` reconciles; old records with `2026.06.1` stamps are flagged in `dialog-doctor` as "stale catalog".

---

## Acceptance traceability matrix

| Scenario | User Story | FRs covered | SCs covered |
| ---------- | ----------- | ------------- | ------------- |
| 1 | US1 | FR-001, FR-002, FR-011, FR-014 | SC-001 |
| 2 | US2 | FR-003, FR-004, FR-012 | SC-002, SC-006 |
| 3 | US3 | FR-005, FR-011 | (idempotency) |
| 4 | US4 | FR-006, FR-006a, FR-008, FR-015, FR-020 | SC-004, SC-008 |
| 5 | US5 | FR-009 | SC-005 |
| 6 | US6 | FR-013, FR-022 | SC-009 |
| Edge 1 | (US2) | FR-003 (defensive parsing) | — |
| Edge 2 | (US3) | FR-005, FR-011 | — |
| Edge 3 | (US1, US2) | FR-003 (streaming) | — |
| Edge 4 | (US4) | FR-007, FR-014 | SC-008 |
| Edge 5 | (US1) | FR-001, FR-014 | — |
| Edge 6 | (US2) | FR-021, FR-022 | — |

FR-016 (other-tool advisory rule) is verified by inspection: `CLAUDE.md` still carries the 006 "Session Logging (Advisory)" rule unchanged.

FR-017 (capture trigger hybrid) is verified via Edge 5 + the inactivity-timeout default behavior in Scenario 1.
