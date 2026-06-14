# Feature Specification: Dialog Capture — Raw-Layer Hooks, Normalization & Memory Ingestion

**Feature Branch**: `007-dialog-capture` (directory exists; branch creation deferred — repo `main` has unresolved submodule conflicts at spec time)
**Created**: 2026-06-14
**Status**: Draft
**Input**: User description: "007-dialog-capture" — Phase 2 of dialog archival per 006/US7 + 008 reservation: Claude Code session-end hook → raw transcript copy → normalization with redaction → INDEX auto-population → ingestion into underboard memory backend (Honcho Sessions reserved by 008) so past dialogs are semantically recallable.

## Context

Feature 006 shipped User Story 7 (Dialog archival, P3) as a **two-phase commitment**:

- **Phase 1 (delivered in 006)**: `.ai/dialogs/{raw,log}/` directories exist, `INDEX.md` scaffolded with column template, `.gitignore` ignores `raw/`, CLAUDE.md carries the "Session Logging (Advisory)" rule for non-CC tools. No active capture.
- **Phase 2 (this feature, 007)**: the active-capture half — Claude Code hook + raw-layer transcript copy + normalization script + underboard integration.

Feature 008 (Key Entities, Assumptions) explicitly reserved this scope:

> *"Honcho mapping ... sessions unused by this feature (reserved for 007 dialog ingestion)."*
> *"Feature 007 stays reserved for dialog-capture (006/US7 follow-up); ingestion of dialog archives into Honcho sessions is that feature's natural home."*

006/SC-007 stated raw-layer infrastructure (CC hook + normalization script) is **backlog for milestone 007-dialog-capture**. This spec is that milestone.

The layered philosophy inherited from 006 holds: **reliable capture where free** (CC writes a complete transcript to disk at zero modelling cost — copy it), **advisory where necessary** (other tools still rely on the 006 prompt rule for log summaries). 007 automates the reliable half and feeds the result into the underboard memory backend so dialogs become recallable knowledge — closing the loop 005 opened with `memory_write`/`memory_recall`.

## Clarifications

### Session 2026-06-14

- Q: Redaction policy source — in-repo regex catalog vs external scanner delegation? → A: **Hybrid** — ship a built-in regex catalog (`catalog_cloud.yml` + `catalog_pii.yml` in repo config) as the default baseline; expose an optional external-scanner hook (consumer can plug TruffleHog / Semgrep / gitleaks) for high-security consumers. Baseline = zero new runtime deps (matches 006's "no new dependencies" principle); hook = upgrade path for the paranoid.
- Q: Ingestion default — opt-in (privacy) vs opt-out (leverage)? → A: **Opt-out with deferred ingestion + configurable quarantine window** — dialogs flow to underboard by default BUT only after a configurable delay (default 7 days) during which the record sits in a local spool and is purged before ingestion if the user runs a redaction-recovery or explicit `dialog-purge` on it. Default window = 7 days; per-repo override via config.
- Q: Capture trigger — SessionEnd hook vs periodic file-watch vs manual command? → A: **Hybrid** — design around CC SessionEnd hook as the primary trigger (clean one-shot pipeline), with a file-watch fallback path activated only if verification V1 finds CC exposes no usable SessionEnd event. The fallback path produces growing partial snapshots that are finalized to a single clean record on next session start.
- Q: Normalized-record message-stream format — verbatim-redacted vs summarized vs hybrid? → A: **Hybrid** — compact metadata header block (date, branch, files touched, derived decisions, token counts) + full redacted message stream in body, truncated after a configurable threshold (default **64 KB**, bumped from 32 KB post-external-review gemini.md F4) with a "see raw for full" pointer. Balances skim-readability, audit fidelity, tracked-file size, and underboard payload budget (005's 64 KB soft / 1 MB hard).
- Q: Historical backfill on install — forward-only vs auto-backfill vs explicit command? → A: **Forward-only default + explicit `dialog-backfill` command** — capture pipeline runs only for sessions ending after 007 activation; an explicit `dialog-backfill [--from DATE] [--to DATE] [--dry-run]` command scans CC's own log catalog and ingests historical sessions on demand. Leverages history without surprise one-shot ingest jobs or forgotten-secret exposure the user didn't opt into.
- Q: Background ingestion worker cadence — continuous polling vs periodic cron vs event-driven? → A: **Event-driven hybrid** — worker triggers on three signals: (1) underboard health-recovery event (instant wake — makes SC-008 measurable as a real bound, not aspirational), (2) capture-pipeline completion for a session whose records newly clear quarantine, (3) safety-net tick every 5 minutes for missed events. No continuous polling, no hour-scale waits.
- Q: Recall top-K for dialogs (SC-004) — top-3 vs top-5 vs top-10? → A: **Top-5, matching 008/SC-001** — preserves a single consistent user contract ("right answer lands in top-5"), makes SC-004 directly comparable to 008's notes benchmark (same K, softer %-threshold reflecting dialog noise), and avoids signaling that dialogs are weaker than notes (top-3) or that noise is acceptable (top-10).
- Q: Redaction catalog versioning — forward-only vs auto-retroactive vs opt-in re-normalize? → A: **Per-record version stamp + opt-in `dialog-renormalize` command** — each normalized record carries a `redaction-catalog-version` stamp; catalog updates do NOT auto-trigger anything. Explicit `dialog-renormalize [--catalog-version X] [--from DATE]` re-normalizes past records idempotently (content-hash dedup), respects underboard tombstones (no resurrection), and produces clean git diffs (only records with actual redaction changes are rewritten).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic raw-layer capture for Claude Code sessions (Priority: P1)

A Claude Code session concludes (user closes the session, or the harness fires its session-end event). A non-blocking harness hook copies the complete session transcript verbatim to `.ai/dialogs/raw/<YYYY-MM-DD>-<session-id>-claude.jsonl` with zero loss and zero modelling cost. No manual step. The CC session UI is never blocked by capture I/O.

**Why this priority**: The entire feature rests on having the raw material. No capture = nothing downstream works. CC is the only tool in the stack with a free, structured, complete transcript available on disk; every other tool degrades to an advisory summary. CC raw capture is the spine of the archive.

**Independent Test**: Run a CC session in the repo (any length, any content), end it cleanly; verify `.ai/dialogs/raw/` contains exactly one new file for that session, the file is parseable JSONL, and the line count matches what CC itself logged.

**Acceptance Scenarios**:

1. **Given** a CC session, **When** the session ends normally (last CC activity + `inactivity-timeout-minutes` default 5 min), **Then** a transcript file appears in `raw/` named with the session's id and date within 5 seconds of finalization trigger firing, complete and unmodified. *(Drift note: 2026-06-14 — original "5 seconds of session end" revised post-V1 empirical finding. CC exposes no SessionEnd event; file-watch + inactivity timeout is the realistic trigger. "Session end" = `last_activity + inactivity-timeout-minutes`. Per Constitution IX spec-patch-drift policy.)*
2. **Given** capture is disabled in repo config, **When** a CC session ends, **Then** no file is written and a clear "capture disabled" indicator is surfaced in INDEX header or session output.
3. **Given** two CC sessions running concurrently on the same repo, **When** both end, **Then** two distinct files are written with distinct names; no collision, no overwrite.
4. **Given** a CC session that ends abnormally (crash, kill -9, power loss), **When** the next capture cycle runs, **Then** whatever partial transcript exists is preserved as-is with a `.partial` marker; the next clean session does not inherit a broken INDEX row.

---

### User Story 2 - Normalization produces a tool-neutral, secret-redacted record (Priority: P1)

A normalization step transforms each raw CC JSONL transcript into a single plain-text/markdown record under `.ai/dialogs/log/` with stable fields: date, tool, branch, session id, model(s) used, token counts, files touched, derived theme, brief outcome, and the message stream (user/assistant/tool) redacted per the documented redaction policy. The normalized record is tracked in git; the raw transcript stays gitignored.

**Why this priority**: Raw CC JSONL is opaque to other tools and unsafe to track (it contains user input verbatim — pasted secrets, PII, internal URLs). Normalization is the contract layer: tool-neutral, safe-to-commit, consumable by humans, by other AI tools, and by underboard. Without it, the raw archive is a write-only /dev/null.

**Independent Test**: Generate a transcript containing a deliberately planted fake AWS access key, fake JWT, fake phone number, fake email, and fake SSH private key block; run normalization; verify all five are redacted in the output; verify the normalized record opens in any markdown viewer and exposes the same stable fields across 10 sample sessions.

**Acceptance Scenarios**:

1. **Given** a raw transcript with planted secrets, **When** normalization runs, **Then** the normalized record contains no recognizable secret pattern (per the redaction policy) — every match replaced with a stable placeholder.
2. **Given** two runs of normalization on the same raw transcript, **When** outputs are diffed, **Then** they are byte-identical (idempotent / deterministic).
3. **Given** a normalized record, **When** a non-CC tool reads it, **Then** the same canonical fields are extractable as for a CC reader (no CC-specific format leaks into the tracked layer).
4. **Given** a transcript where redaction is uncertain (pattern close to but not matching a known secret), **When** normalization runs, **Then** it errs to over-redaction and logs the redaction for human review.
5. **Given** a transcript containing a legitimate test fixture that matches a secret pattern (e.g., AWS-key-shaped constant in a test file), **When** normalization runs, **Then** the allowlist suppresses the false positive OR the false-positive is logged with a one-click "allow" path.

---

### User Story 3 - INDEX.md auto-population, atomic and idempotent (Priority: P2)

After capture + normalize, INDEX.md gains exactly one new row per session: date, tool, branch, theme (derived from first user message or session title), brief outcome (derived from last assistant message or summary), and a link to the normalized file. The update is atomic (write-temp + rename) so a killed normalizer can never corrupt INDEX.

**Why this priority**: In 006 Phase 1, INDEX is hand-curated — rows accumulate only when the human remembers to add them, which in practice means never. For raw-layer auto-capture to be useful, INDEX must follow automatically. Below P1 because if the user already has raw + normalized files, they can still grep — INDEX is the convenience layer, not the source of truth.

**Independent Test**: Run 5 CC sessions end-to-end; verify INDEX has 5 new rows, each matching its normalized file's header fields; kill the normalizer mid-write on session 6; verify INDEX is unchanged (atomic update left either the old or new state, not a mix); re-run normalizer; verify session 6's row now appears exactly once.

**Acceptance Scenarios**:

1. **Given** a successful capture + normalize, **When** the INDEX update runs, **Then** INDEX.md has exactly one new row for that session with all columns populated.
2. **Given** re-normalization of an already-indexed session, **When** the INDEX update runs, **Then** no duplicate row is created (idempotent on session id).
3. **Given** INDEX.md is being written, **When** the process is killed mid-write, **Then** on next run INDEX.md is either the old state or the new state, never a half-written mix.
4. **Given** INDEX.md has hand-edited annotations on prior rows (a "notes" column the human curates), **When** the auto-updater runs, **Then** hand-edits on prior rows are preserved; only the new row is appended.

---

### User Story 4 - Past dialogs are semantically recallable via dedicated `dialog_recall` tool (Priority: P2)

Each normalized record is ingested into the underboard backend as a Honcho Session (one per CC session) + Messages (one per CC message), attributed to a synthetic `__dialog-capture__` peer (F8-reserved namespace) in the project's Honcho workspace (per 008's mapping). An agent in a later session can call the **new, dedicated `dialog_recall` tool** with "what did we decide about refresh-token rotation last tuesday?" and get the relevant past-dialog excerpt as a top result — without anyone manually writing a memory note. **`dialog_recall` is a separate MCP tool from `memory_recall`**; the 005/008 `memory_recall` input/output schema stays frozen (per 008/FR-001). Cross-project dialog recall uses the parallel `dialog_recall_cross_project` tool. Deletion uses `dialog_delete` (tombstone + Honcho Session DELETE cascade per V7).

**Why this priority**: This is the leverage point of the entire dialog-archive investment — turning transcripts into recallable knowledge. Below P1 because raw + normalized + INDEX still delivers audit and cross-tool reading without it; semantic recall is the multiplier, not the floor. **Redesign note (2026-06-14, post-external-review F1)**: original US4 routed dialog results through `memory_recall`, silently amending the 005/008 contract that 008/FR-001 declared frozen. External review (claude.md F1) caught this; the fix is a dedicated tool family (`dialog_recall`, `dialog_recall_cross_project`, `dialog_delete`) so the existing `memory_*` schema stays untouched.

**Independent Test**: Seed 10 normalized dialog records covering 2 distinct themes; from a fresh agent session, issue 5 paraphrase queries on themes covered by the dialogs via `dialog_recall`; verify ≥4 of 5 return the right dialog in top-5 results; verify a query on an uncovered theme returns nothing (no false positives); verify the existing `memory_recall` tool returns zero dialog-type results (contract boundary intact).

**Acceptance Scenarios**:

1. **Given** a normalized record has been ingested (i.e., it cleared the quarantine window and reached Honcho), **When** an agent in the same project issues **`dialog_recall`** with a paraphrase of past dialog content, **Then** the relevant dialog appears in top-5 results (K=5, scoped to dialog-type results only), attributed to the `__dialog-capture__` source peer, with a link to the normalized file.
2. **Given** a record still inside its quarantine window, **When** the user runs `dialog-purge` or a redaction-recovery (US6) on it, **Then** the record is removed from the quarantine spool and NEVER reaches Honcho — no tombstone needed because it was never ingested.
3. **Given** a record has aged past its quarantine window, **When** the background ingestion worker next runs, **Then** the record is ingested into Honcho Session + Messages within one worker tick.
4. **Given** `dialog-ingest: off` (full opt-out per FR-006b), **When** a session is captured, **Then** raw + normalized + INDEX update happen, but no record enters either the quarantine or outage spool.
5. **Given** underboard/Honcho is unreachable when a record graduates the quarantine window, **When** the worker tries to ingest, **Then** the record moves to the outage spool and is reconciled on recovery per 008's spool+resync pattern; raw, normalized, and INDEX updates are NOT blocked by the outage.
6. **Given** a dialog already in Honcho is deleted via **`dialog_delete`**, **When** the same raw transcript is re-normalized and re-ingested, **Then** it is NOT silently re-resurrected — content-hash tombstone prevents it.
7. **Given** an agent calls `memory_recall` (the existing 005/008 tool) after 007 is live, **When** results return, **Then** zero dialog-type results appear — `memory_recall` returns notes/Conclusions only; dialogs are reachable only via `dialog_recall` (contract boundary per F1 fix).

---

### User Story 5 - Retention and rotation policy (Priority: P3)

A retention policy bounds `.ai/dialogs/raw/` growth: configurable `keep-N-sessions-per-project` and/or `size-cap-MB`; prune or archive beyond the bound. The normalized layer and INDEX rows are retained by default (small, tracked, audit-relevant) unless the user opts into normalized rotation too.

**Why this priority**: Without rotation, `raw/` grows unbounded — a 30-day CC-heavy project easily exceeds 1 GB of JSONL. But rotation is a knob, not a capability: capture works without it, just consumes disk. First candidate to cut on schedule pressure.

**Independent Test**: Configure `keep-N=3`; run 5 sessions end-to-end; verify `raw/` contains only the last 3 transcripts; verify INDEX retains all 5 rows (pointing to normalized files, which persist); verify the pruned raw files are recoverable from CC's own log path (pruning is not destruction of the only copy).

**Acceptance Scenarios**:

1. **Given** a retention policy of `keep-N=10`, **When** the 11th session is captured, **Then** the oldest raw transcript is pruned (or archived to a configured path) automatically.
2. **Given** a size cap of `100MB`, **When** `raw/` exceeds the cap, **Then** oldest-first pruning brings it under the cap within one capture cycle.
3. **Given** pruning removed a raw transcript, **When** the user needs the original, **Then** the pruned file is either in an archive location or recoverable from CC's own log path (pruning is never destruction of the only copy).

---

### User Story 6 - Redaction-miss recovery (Priority: P3)

A maintainer discovers (by audit, by scanner, by report) that a secret slipped past the redaction policy into a tracked normalized record and/or into underboard. A single re-runnable command — given a session id, a pattern, or a free-form redaction rule — purges the entry from underboard (tombstone per 008), rewrites the normalized file with stricter redaction, and updates INDEX. The raw transcript is left untouched (it's gitignored and CC's own log holds a copy).

**Why this priority**: Necessary for trust — without a recovery path, the first redaction miss poisons the entire archive. But P3 because the redaction policy in US2 is designed to make misses rare, AND the quarantine window (FR-006) gives the user a free second line of defense: any miss caught within the quarantine window is purged before it ever reaches underboard, no tombstone needed. Recovery is insurance for misses that escape quarantine.

**Independent Test**: Plant a deliberate miss in a normalized record; run ingestion with a 0-day quarantine so the record reaches underboard; run the recovery command with the miss's pattern; verify the normalized record is rewritten with the redaction applied, the underboard entry is tombstoned (no longer recallable), and INDEX's row flags the redaction in a notes column. Repeat with a 7-day quarantine and recover BEFORE graduation: verify the spool entry is purged, no underboard entry ever created.

**Acceptance Scenarios**:

1. **Given** a redaction miss in a tracked normalized record, **When** the recovery command runs for that session id and pattern, **Then** the normalized file is rewritten with the pattern redacted and the change is visible in git diff.
2. **Given** the miss reached underboard (record was already ingested), **When** the recovery command runs, **Then** the underboard entry is tombstoned per 008 and absent from subsequent recalls.
3. **Given** the miss is caught while the record is still in the quarantine spool, **When** the recovery command runs, **Then** the spool entry is purged and no underboard entry ever exists — no tombstone needed.
4. **Given** recovery has run, **When** the original raw transcript is re-normalized, **Then** the new normalized record carries the same stricter redaction (recovery is sticky, not one-shot).

---

### Edge Cases

- **CC transcript schema drift**: CC is upgraded and the JSONL field set changes → normalizer must detect the drift (version field or shape probe) and either adapt or fail-loud with a clear error, never silently produce wrong fields.
- **Legitimate code that looks like secrets**: a test fixture pasted into the session contains AWS-key-shaped constants → redaction policy must have an allowlist mechanism for test/fixture contexts; false-positive rate must be tunable and reviewed.
- **Concurrent normalizer runs on the same transcript** (race) → atomic file ops (write-temp + rename) + content-hash lock prevents corruption; the second run is a no-op.
- **Workspace auto-creation**: underboard workspace for this project doesn't exist at first ingestion → workspace is auto-created per 008's deterministic-name scheme.
- **Very large transcript** (>50 MB JSONL, e.g., a session that read many large files) → normalizer must stream, not buffer in memory; ingestion must chunk or summarize per underboard's payload limits (005 64 KB soft / 1 MB hard).
- **Empty / aborted session**: user opened CC and quit immediately → no transcript written, no INDEX row, no ingestion (skip cleanly with no error).
- **Branch renamed/moved between session start and end**: branch field in the normalized record uses the at-end name; INDEX theme derivation does not crash on missing or detached-HEAD state.
- **Redaction miss discovered post-ingestion**: a secret slipped into underboard → US6 recovery operation handles it (tombstone + rewrite + INDEX update).
- **Two machines hitting the same Honcho**: single-user assumption from 008 holds, but if it breaks → workspace naming must not collide destructively; ingestion stays per-repo-scoped.
- **Two CC sessions on the same branch seconds apart**: distinct session ids keep filenames distinct; theme derivation must produce distinct rows.
- **Cross-project dialog recall**: dialogs ingested in project A must NOT be recallable from project B via the default recall tool (005 default preserved); cross-project dialog recall requires the explicit cross-project tool.
- **CC session that reads `.env` or other secret files**: the transcript will contain the secret content as tool output → redaction MUST catch secrets in tool-output sections, not just in user-typed input.
- **Re-normalization after CC's own log rotation**: CC prunes its own transcript log; if the raw copy in `.ai/dialogs/raw/` was also pruned by retention, re-normalization is no longer possible for that session → INDEX row remains (pointing to the persisted normalized file); the normalized file is the durable artifact.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A harness-level hook MUST capture the complete Claude Code session transcript at session-end to `.ai/dialogs/raw/<YYYY-MM-DD>-<session-id>-claude.jsonl` automatically, with no user action. The hook MUST NOT block the CC session UI on capture I/O (fail-soft, async or fire-and-forget).
- **FR-002**: The raw file MUST contain the CC transcript verbatim (no field stripping, no redaction at the raw layer); the raw layer stays gitignored per 006.
- **FR-003**: A normalization step MUST produce a tracked plain-text/markdown record per session at `.ai/dialogs/log/<YYYY-MM-DD>-claude-<theme-slug>.md` with stable fields: date, tool, branch, session id, model(s) used, token counts, files touched, derived theme, brief outcome, and the redacted message stream. Normalization MUST be deterministic (idempotent on the same raw input). **Message-stream format (clarified 2026-06-14, default bumped post-external-review gemini.md F4)**: hybrid layout — (1) compact metadata header block (date, branch, files touched, derived decisions, token counts) always rendered; (2) full redacted message stream in body, **truncated after a configurable threshold** (key `dialog-normalized-max-bytes`, default **64 KB** = 65536 bytes, range 8 KB–1 MB) with a "see raw transcript at `.ai/dialogs/raw/<file>` for full content" pointer when truncation fires. Total normalized record size SHOULD stay within the underboard payload soft budget (005: 64 KB soft) so single-record ingestion doesn't require chunking in the common case; records exceeding 1 MB hard limit MUST be chunked by Message boundary (V3 strategy).
- **FR-004**: A documented redaction policy MUST be applied during normalization, covering at minimum: cloud-provider secret patterns (AWS, GCP, Azure), generic API keys/tokens, JWTs, private SSH key blocks, credit card numbers, phone numbers, email addresses. The policy MUST err toward over-redaction when uncertain and MUST log each redaction for review. An allowlist mechanism MUST exist for legitimate test/fixture contexts. **Redaction policy source (clarified 2026-06-14)**: ship a built-in regex catalog in repo config (`catalog_cloud.yml` + `catalog_pii.yml`) as the default baseline — zero new runtime dependencies; expose an optional external-scanner hook (consumer may plug TruffleHog / Semgrep / gitleaks via a documented contract) for high-security consumers. The hook is opt-in per repo; when absent, the baseline catalog runs alone.
- **FR-005**: INDEX.md MUST be updated atomically (write-temp + rename) with exactly one new row per normalized record (date, tool, branch, theme, outcome, link to normalized file). Re-normalization of an already-indexed session MUST NOT create a duplicate row. Hand-edited annotations on prior rows MUST be preserved.
- **FR-006**: Each normalized record MUST be ingested into the underboard backend as a Honcho Session (one per CC session) + Honcho Messages (one per CC message), attributed to a synthetic `__dialog-capture__` peer (F8-reserved namespace) in the project's workspace per 008's mapping. The Honcho Session entity (reserved by 008) is the representation; one Message per CC message is the chunking strategy (per research V3). The existing `memory_recall` / `memory_delete` tools from 005/008 MUST remain unchanged (per 008/FR-001); dialog recall and deletion MUST go through new dedicated tools (`dialog_recall`, `dialog_recall_cross_project`, `dialog_delete`) — see FR-023, FR-024, FR-025. **Ingestion default (clarified 2026-06-14)**: opt-out — ingestion is ON by default, but **deferred** through a configurable quarantine window (default 7 days). The record sits in a local ingestion spool during the window; a background worker ingests records once their age exceeds the configured window. If the user runs a redaction-recovery (US6) or explicit `dialog-purge` on a record during its quarantine window, the record is purged from the spool and never reaches Honcho. After ingestion, deletion requires `dialog_delete` (with tombstone + Honcho Session DELETE cascade per V7) — quarantine does not extend into Honcho.
- **FR-006a**: The quarantine window MUST be configurable per repo (key `dialog-ingest-delay-days`, range 0–90, default 7). A value of `0` means immediate ingestion on next worker tick (equivalent to opt-out without quarantine). A value of `90` means long-term hold. The window is recorded in capture config so the choice is auditable.
- **FR-006b**: A CLI / config flag `dialog-ingest: off` MUST exist as a complete opt-out: when set, NO normalized record is ever written to the spool, and the worker never ingests. This is distinct from `dialog-ingest-delay-days: 90` (which still allows ingestion after 90 days) and from `dialog-capture: off` (which disables the whole pipeline including raw + normalized + INDEX).
- **FR-007**: When underboard is unreachable while a record is graduating from the quarantine spool (i.e., the record's window has elapsed and ingestion is due), the capture pipeline MUST move the record to the outage spool and reconcile on recovery per 008's spool+resync pattern. Raw, normalized, and INDEX updates MUST NOT be blocked by the outage — the user always sees the on-disk artifacts regardless of underboard state.
- **FR-008**: Ingestion MUST be idempotent — re-ingesting the same normalized record MUST NOT create duplicate memory entries (content-hash dedup per 005/008). Deletion of a dialog memory entry MUST tombstone it (per 008) so re-normalization cannot silently resurrect it.
- **FR-009**: A retention/rotation policy MUST bound raw-layer growth with configurable `keep-N-sessions-per-project` and `size-cap-MB` knobs; defaults MUST be documented. Pruning MUST NOT destroy the only copy of a transcript (archive path or reliance on CC's own log).
- **FR-010**: Capture, normalization, and ingestion MUST be opt-out per repo via a single configuration flag; when disabled, NO dialog artifacts are produced and a clear "capture disabled" indicator MUST appear in INDEX header or session output.
- **FR-011**: Concurrent CC sessions and concurrent normalizer runs MUST NOT produce filename collisions, INDEX race conditions, or duplicate ingestions (per-session filename + atomic INDEX update + content-hash lock).
- **FR-012**: All tracked artifacts (normalized record, INDEX rows) MUST be in plain text or stable-schema JSON, readable by any AI tool without CC-specific parsers. The raw CC JSONL stays gitignored.
- **FR-013**: A redaction-miss recovery operation MUST exist: given a session id, a regex, or a free-form rule, the operation rewrites the normalized file with the stricter redaction, tombstones the matching underboard entry, and updates INDEX — all in one re-runnable command. Recovery MUST be sticky (re-normalization of the same raw transcript preserves the stricter redaction).
- **FR-014**: Capture MUST be fail-soft end-to-end: any error in the hook, normalizer, or ingestion path MUST be logged but MUST NOT crash the CC session, break the user's work, or block session-end.
- **FR-015**: The cross-project scope default from 005 MUST be preserved: dialogs ingested in project A are NOT recallable from project B via the default `dialog_recall`; cross-project dialog recall requires the explicit `dialog_recall_cross_project` tool. The existing `memory_recall` and `memory_recall_cross_project` tools from 005/008 are unchanged and return only notes/Conclusions (no dialog-type results).
- **FR-016**: The other-tool advisory rule from 006 (non-CC tools write a log summary on substantial output) MUST continue to apply unchanged; the normalized CC record format is the canonical schema other tools' log summaries should converge on.
- **FR-017**: **Capture trigger (clarified 2026-06-14)**: design around a Claude Code SessionEnd hook as the **primary** trigger — a one-shot capture → normalize → INDEX → spool pipeline runs when the CC session closes. If verification V1 finds CC exposes no usable SessionEnd event, a **fallback** path activates automatically: a file-watch worker detects CC's transcript file growing and produces periodic partial snapshots under `raw/.partial/`; on next session start, the most recent partial is promoted to the clean `raw/` location and the pipeline runs against it. The two paths are mutually exclusive per repo (selected at first run based on V1 probe result); the captured artifact MUST include everything written to the transcript up to the trigger point regardless of which path is active. *(Drift note: 2026-06-14 — research V1 confirmed CC exposes no SessionEnd event; implementation always activates the file-watch path. The conditional wording is preserved for forward-compatibility (if CC adds SessionEnd later, the probe re-evaluates). User-visible behavior is identical: raw file appears within `(inactivity-timeout-minutes + 5s)` of last CC activity per SC-001. Per Constitution IX spec-patch-drift policy.)*
- **FR-018**: The capture pipeline MUST be **forward-only by default**: only sessions ending after 007 activation are captured, normalized, indexed, and ingested. Historical sessions in CC's own log catalog MUST NOT be auto-ingested on activation.
- **FR-019**: An explicit `dialog-backfill` command MUST be available for one-shot historical ingestion: `dialog-backfill [--from DATE] [--to DATE] [--dry-run] [--limit N]`. The command scans CC's own log catalog for sessions in the requested range, applies the same capture → normalize → INDEX → quarantine-spool pipeline as forward capture (including redaction, quarantine window, dedup), and reports per-session outcomes. `--dry-run` MUST list candidate sessions and projected redaction findings without writing. Backfill MUST be idempotent (re-running on already-ingested sessions is a no-op via content-hash dedup) and MUST respect retention policy as if the sessions were captured forward (i.e., old sessions may be pruned from `raw/` per `keep-N` immediately if they exceed the cap).
- **FR-020**: The background ingestion worker MUST run on an **event-driven hybrid** schedule, triggered by three signals: (1) underboard health-recovery event (worker wakes immediately and drains the outage spool + any newly-graduated quarantine records), (2) capture-pipeline completion event for a session whose records may have cleared quarantine (e.g., `dialog-ingest-delay-days: 0`), (3) safety-net tick every 5 minutes for missed events. The worker MUST NOT depend on any single trigger source — losing one (e.g., health-event subscription fails) MUST NOT silently stall ingestion; the safety-net tick guarantees eventual delivery.
- **FR-021**: Each normalized record MUST carry a `redaction-catalog-version` stamp recording which catalog version was applied. Catalog updates MUST NOT auto-trigger re-normalization of past records.
- **FR-022**: An explicit `dialog-renormalize` command MUST be available for retroactive catalog updates: `dialog-renormalize [--catalog-version X] [--from DATE] [--to DATE] [--dry-run]`. The command re-normalizes matching records with the requested (or current) catalog version. It MUST be idempotent (records whose normalized output is byte-identical under the new catalog are not rewritten), MUST respect underboard tombstones (a tombstoned record is NOT re-ingested even if its content hash would otherwise qualify), MUST update INDEX atomically with any redaction changes flagged in a notes column, and MUST produce clean git diffs (only records with actual content changes are touched). `--dry-run` MUST project the redaction diffs without writing.
- **FR-023** (added post-external-review F1): A new MCP tool `dialog_recall` MUST be exposed by underboard, distinct from `memory_recall`. Input: `{query: string, project_id?: string, limit?: number}` (default limit 5, max 50). Output: array of `DialogRecallResult` (see FR-024 schema) ranked by Honcho session-search relevance. Routes to Honcho `/v3/workspaces/{ws}/sessions:search` (verification V8 pending). The 005/008 `memory_recall` tool MUST remain unchanged (no `type` discriminator added, no schema extension).
- **FR-024** (added post-external-review F1): `DialogRecallResult` schema (output of `dialog_recall` and `dialog_recall_cross_project`): `{session_uuid, theme, date, relevance_score: number (0..1, Honcho-provided), excerpt: string (matching Message content, redacted), normalized_file: string (relative path), honcho_session_id: string, project_id?: string (only on cross-project results)}`. This schema is distinct from 005's `MemoryRecallResult` (which has `score` + `similarity` for notes/Conclusions); consumers destructure by tool, not by guessing.
- **FR-025** (added post-external-review F1): A new MCP tool `dialog_delete` MUST be exposed by underboard, distinct from `memory_delete`. Input: `{session_uuid: string} | {content_hash: string}`. Behavior: (a) look up Honcho Session by metadata, (b) if mid-ingest, complete in-flight ingest first then DELETE (per V7 cascade), (c) DELETE Honcho Session, (d) insert tombstone by content_hash, (e) update outage spool row to `status='tombstoned'`. The 005/008 `memory_delete` tool MUST remain unchanged (operates on Conclusions only).
- **FR-026** (added post-external-review F1): A new MCP tool `dialog_recall_cross_project` MUST be exposed by underboard, distinct from `memory_recall_cross_project`. Same input/output as `dialog_recall` (FR-023/FR-024) but enumerates all project workspaces and merges results by `relevance_score` descending. Each result carries `project_id`. Default-isolation preserved: this is the only path to recall dialogs across projects.

### Key Entities

- **Raw transcript**: verbatim CC JSONL, per-session, gitignored. The source of truth for "what actually happened in this session".
- **Normalized record**: plain-text/markdown, tracked, stable schema. Two-section layout — compact metadata header (always rendered, includes `redaction-catalog-version` stamp per FR-021) + truncated full-redacted message stream (body) with raw pointer when truncated (per FR-003). The tool-neutral, safe-to-commit, consumable-by-all form.
- **INDEX row**: catalog entry in INDEX.md linking date/tool/branch/theme/outcome to a normalized record.
- **Redaction policy**: documented set of patterns (regex/glob) with actions (`redact` | `hash` | `allow`) and an allowlist; lives in repo config.
- **Rotation policy**: `keep-N-sessions-per-project` + `size-cap-MB`; prunes or archives raw transcripts beyond the bound.
- **Dialog Honcho representation**: a Session (one per CC session) + Messages (one per CC message), attributed to the reserved `__dialog-capture__` peer, project-scoped via workspace mapping. Distinct from 005/008's Conclusion-backed notes.
- **Ingestion quarantine spool**: durable queue holding normalized records during their quarantine window (default 7 days, configurable per FR-006a). Records are purged from this spool (never reach underboard) if a redaction-recovery or explicit `dialog-purge` runs during the window. Once the window expires and underboard is reachable, records graduate to the outage spool.
- **Ingestion outage spool**: durable queue holding records that have graduated the quarantine window but couldn't reach underboard (service down). Reconciled on recovery per 008's spool+resync pattern.
- **Ingestion worker**: background process draining the quarantine spool (graduated records) and the outage spool (post-recovery). Event-driven hybrid cadence per FR-020 (health-recovery + capture-completion + 5-minute safety-net tick).
- **Capture config**: per-repo flags — `dialog-capture: on|off` (master switch), `dialog-ingest: on|off` (full opt-out per FR-006b), `dialog-ingest-delay-days` (quarantine window, 0–90, default 7 per FR-006a), `dialog-normalized-max-bytes` (truncation threshold, 8 KB–1 MB, default **64 KB** per FR-003), `keep-N-sessions-per-project` and `size-cap-MB` (retention per FR-009), `redaction-catalog` path, `external-scanner` hook command (optional per FR-004), archive path for pruned raw files.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of cleanly-ended CC sessions in a test repo produce a raw transcript file in `.ai/dialogs/raw/` within `(inactivity-timeout-minutes + 5 seconds)` of last CC activity, with no user action; 0 transcripts lost on clean session end. *(Drift note: 2026-06-14 — original "5 seconds of session end" was unachievable: research V1 confirmed CC exposes no SessionEnd event; capture uses file-watch + 5-min inactivity-timeout default. "Session end" redefined as `last_activity + inactivity-timeout-minutes`. Finalization I/O budget = 5s. Per Constitution IX spec-patch-drift policy — empirical post-V1 timing correction, not a scope change.)*
- **SC-002**: 0 recognizable secret patterns in normalized records after running the redaction policy across a planted-secrets fixture (AWS access key, JWT, SSH private key block, phone, email, credit card) — coverage ≥99%, false-positive rate documented and tunable.
- **SC-003**: INDEX.md always reflects captured sessions with zero duplicates after re-normalization, and is never corrupted by a killed normalizer (atomic update verified by crash-injection test).
- **SC-004**: On a seeded corpus of 10 normalized dialog records across 2 themes, `dialog_recall` (the dedicated tool per FR-023, NOT `memory_recall`) returns the correct dialog in **top-5** in ≥80% of trials. The existing `memory_recall` returns 0 dialog-type results (contract boundary per F1 fix). Soft %-threshold vs 008's ≥95% reflects dialog noise — same K, different content type.
- **SC-005**: Repo disk usage by `.ai/dialogs/raw/` is bounded by the configured retention policy (verified by over-producing sessions past the cap and confirming pruning kicks in within one capture cycle).
- **SC-006**: Cross-tool readability — a normalized record parsed by a non-CC reader extracts the same canonical fields (date, tool, branch, session id, theme, outcome) as a CC reader; zero parse failures across a 10-record sample.
- **SC-007**: Capture disabled → 0 artifacts produced, "capture disabled" indicator present in INDEX header or session output.
- **SC-008**: Kill-the-container test — underboard outage during a record's post-quarantine ingestion produces 0 capture-pipeline errors visible to the CC session; 100% of records that have graduated their quarantine window complete ingestion within 60 seconds of underboard recovery; raw, normalized, and INDEX updates are NOT delayed by the outage (they happen at capture time, regardless of underboard).
- **SC-009**: Redaction-miss recovery is a single command and runs end-to-end (rewrite + spool-purge or tombstone + INDEX update) in under 5 seconds on a single session; recovery is sticky across re-normalization.
- **SC-010**: Quarantine behavior — a record captured at T=0 with default window (7 days): no underboard entry exists at T<7d; at T≥7d the worker ingests it; if `dialog-purge` runs at T<7d, no entry ever exists. The same record with `dialog-ingest-delay-days: 0` ingests on the next worker tick after capture.
- **SC-011**: `dialog-backfill` idempotency — running backfill on a date range that overlaps already-ingested sessions produces zero duplicate INDEX rows and zero duplicate underboard entries (content-hash dedup); running backfill with `--dry-run` produces zero file writes and a complete projection of candidates and redaction findings.
- **SC-012**: `dialog-renormalize` idempotency + tombstone respect — running renormalize on records whose normalized output is byte-identical under the new catalog produces zero git changes; tombstoned underboard entries are NOT re-resurrected; only records with actual redaction changes appear in git diff, and each is flagged in INDEX's notes column.

## Assumptions

- **Phase 1 (006/US7) is merged and present**: `.ai/dialogs/{raw,log}/` exist, `INDEX.md` is scaffolded, `.gitignore` ignores `raw/`, CLAUDE.md carries the advisory rule for non-CC tools. This feature extends that baseline, does not re-establish it.
- **CC transcript availability**: Claude Code writes a complete session transcript to a known path in a stable JSONL schema (verification item V2); the harness exposes either a session-end hook, a post-session file-watch opportunity, or both (verification item V1).
- **underboard is the ingestion target**: underboard's Honcho backend (delivered by 008) is where dialogs land; the Honcho Session entity (reserved but unused by 008) is the natural representation. The 008 mapping (project → workspace, agent → peer, note → Conclusion) extends cleanly to dialogs. **US4 implementation REQUIRES 008 to be merged in code** (not just planned) — see tasks.md Phase 6 gate. US1+US2+US3+US5+US6 are implementable independently of 008 (capture-side only).
- **Single-user, localhost trust model** from 005/008 stands; no multi-tenant isolation concerns for the dialog archive.
- **underboard payload limits and latency budgets** from 005/008 apply to ingestion; very large transcripts may require chunking or summarization.
- **The redaction policy does not need to be cryptographically perfect**; it needs to catch the common patterns (cloud keys, JWTs, SSH keys, PII) and provide a recovery operation (US6) for misses. Advanced DLP / secret-scanning (Semgrep, TruffleHog, gitleaks) is a plan-phase option, not a spec mandate.
- **CC's own log retention** is independent of `.ai/dialogs/raw/` retention — pruning in this feature never destroys the only copy if CC's log still holds it.
- **No new content** (agents, skills, commands beyond the capture pipeline) is authored in this feature — it is infrastructure for capturing and ingesting dialogs.

## Verification Items (empirical, pre-implementation)

| # | Item | Why it matters |
|---|------|----------------|
| V1 | Does CC expose a reliable session-end hook, or only file-watch / periodic options? What event semantics? | FR-001, FR-017 trigger mechanism |
| V2 | Does CC's transcript JSONL schema have a stable version field, and which fields are guaranteed across CC versions? | FR-003 schema stability, drift detection |
| V3 | underboard/Honcho payload limit per memory entry vs a long CC session transcript (005 says 64 KB soft / 1 MB hard) | FR-006 chunking strategy |
| V4 | Does Honcho's Session entity (reserved by 008) actually ingest and return content, or is it metadata-only? | FR-006 representation choice (Session vs Conclusion-per-message) |
| V5 | Real-world false-positive rate of regex-based redaction on a corpus of legitimate code and test fixtures in this repo | FR-004 allowlist design, SC-002 FP rate baseline |
| V6 | CC's own transcript retention: where does CC store the source-of-truth JSONL, and how long is it kept? | FR-009 pruning safety, "not the only copy" guarantee |
| V7 | Does Honcho's DELETE cascade to Messages, and is it soft or hard? (added post-analyze, resolved) | FR-008 tombstone semantics, FR-025 dialog_delete |
| V8 | Does Honcho v3 expose a session-content search endpoint? What's the request/response shape? Does it search Message content or session metadata only? (added post-external-review claude.md F3) | FR-023 dialog_recall viability — if absent, US4 design must change |

## Out of Scope

- **underboard's `memory_*` MCP tool schemas** (`memory_recall`, `memory_recall_cross_project`, `memory_delete`, `memory_write`) — frozen by 005 + 008/FR-001. 007 adds new sibling tools (`dialog_recall`, `dialog_recall_cross_project`, `dialog_delete`) but MUST NOT modify the existing `memory_*` schemas. *(Corrected 2026-06-14 post-external-review F1: original Out-of-Scope line falsely claimed "doesn't change underboard API"; in fact 007 adds 3 new MCP tools and extends underboard's tool registry. The frozen contract is the 005/008 schema; 007 extends the registry additively.)*
- **underboard's Honcho backend itself** (delivered by 005/008) — 007 consumes Honcho via the 008 client. **Phase 6 of tasks.md REQUIRES 008 implementation merged** (Honcho client live in `packages/underboard/src/`) before any US4 task can start. See Prerequisites in tasks.md.
- **Non-CC tool transcript capture beyond the 006 advisory rule**. Each tool's automation is its own feature; CC is the only free-transcript tool today, and others stay advisory per 006.
- **Analytics / observability dashboards over dialogs** (covered by underboard's existing dashboard; 007 only feeds the data).
- **Multi-agent orchestration replay** (covered by undrestrator).
- **Cross-repo dialog aggregation** (single-repo scope per 005 project model).
- **Replacing the 006 advisory log-layer rule with hard automation for non-CC tools** — the advisory rule stays; 007 only automates the CC half.
- **Authoring new agents, skills, or commands beyond the capture pipeline** (no new template content).
- **Building a new secret-scanning engine** — leverage existing tools (TruffleHog, Semgrep, gitleaks) in plan phase if regex catalog proves insufficient; not a spec-level mandate.
- **Dialog-to-task extraction** (auto-creating underboard tasks from dialog content) — future feature, not 007.
