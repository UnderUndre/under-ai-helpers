# Implementation Plan: 007-dialog-capture

**Branch**: `specs/007-dialog-capture` (planning branch per Constitution IX) | **Date**: 2026-06-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-dialog-capture/spec.md` (Phase 2 of 006/US7 + Honcho Session integration reserved by 008).

## Summary

Capture Claude Code session transcripts automatically (file-watch + inactivity-timeout primary, `Stop` hook as timer reset), normalize them into a tracked, secret-redacted, tool-neutral markdown record with a stable schema, auto-populate `.ai/dialogs/INDEX.md` atomically, and ingest normalized records into underboard's Honcho backend (Session-per-CC-session, Message-per-CC-message) so past dialogs are semantically recallable via `memory_recall`. Ingestion defaults to opt-out with a configurable quarantine window (default 7 days) so redaction misses caught early never reach shared memory. Supports `dialog-backfill` for historical sessions, `dialog-renormalize` for catalog updates, `dialog-purge` / recovery for redaction misses.

Technical approach: layered pipeline — `.claude/hooks/dialog-capture.mjs` (thin wrapper) → `packages/cli/src/dialog-capture/` (normalizer, redaction engine, CLI commands) → `packages/underboard/src/dialog-ingest/` (quarantine spool, outage spool, ingestion worker). One new runtime dependency (`chokidar`); Honcho v3 Session entity is the natural representation; existing underboard SQLite holds the spool tables. All tracked artifacts are plain-text markdown (cross-tool readable). Raw transcripts stay gitignored (006 baseline).

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node.js ≥20 (matches `packages/cli/` + `packages/underboard/` baseline).
**Primary Dependencies**:
- Existing (reused): `better-sqlite3` (spool tables in underboard DB), `consola` (logging), `c12` (config), `commander` (CLI subcommands), `undici` (Honcho REST client), `js-yaml` (catalog parsing, transitive via c12), `pathe` (cross-platform paths).
- **New (single addition)**: `chokidar` — cross-platform file-watch with debouncing (V1 primary trigger). ~50 KB.
- Optional consumer-side: an external secret scanner (TruffleHog / Semgrep / gitleaks) wired via the redaction hook contract (FR-004 clarification). NOT a runtime dependency; consumer opt-in.

**Storage**:
- `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl` — CC's own transcript log (source of truth, not managed by us, V6).
- `.ai/dialogs/raw/<YYYY-MM-DD>-<session-id>-claude.jsonl` — verbatim copy (gitignored per 006).
- `.ai/dialogs/raw/.partial/<session-id>.jsonl` — in-progress file-watch snapshots before finalization.
- `.ai/dialogs/log/<YYYY-MM-DD>-claude-<theme-slug>.md` — normalized records (tracked).
- `.ai/dialogs/INDEX.md` — catalog (tracked, 006 scaffolded).
- `~/.underboard/data.db` (existing underboard SQLite) — **new tables**: `dialog_quarantine_spool`, `dialog_outage_spool`, `dialog_tombstones` (extend `packages/underboard/src/storage/migrations/`).
- Honcho v3 (Docker stack per 008) — Session + Message entities; project → workspace mapping per 008.

**Testing**: vitest (matches existing). Test layers:
- Unit: redaction engine, normalizer determinism, schema parsing, allowlist logic.
- Integration: capture → normalize → INDEX pipeline with planted secrets; quarantine graduation; outage reconciliation.
- Golden-fixture: redaction catalog against a curated corpus of legitimate code + known secrets (Principle II corollary — fixtures are the anti-drift discipline).
- E2E (cross-domain): full pipeline from a real CC transcript through underboard recall.

**Target Platform**: Windows, macOS, Linux consumer machines (matches 006 FR-013 cross-platform requirement). `chokidar` handles OS differences; `pathe` handles path normalization.

**Project Type**: monorepo internal — three touched areas:
- `packages/cli/src/dialog-capture/` — new subpackage (normalizer + redaction + CLI commands).
- `packages/underboard/src/dialog-ingest/` — new subpackage (spools + worker).
- `.claude/hooks/dialog-capture.mjs` — new hook (thin wrapper).
- `helpers.config.ts#dialogs` — new config section.
- `presets/redaction/` — new preset directory (extends 006's `presets/`).

**Performance Goals**:
- Capture hook (`.claude/hooks/dialog-capture.mjs`): fire-and-forget spawn, < 100ms wall-clock from CC hook invocation to return. Async pipeline handles the rest.
- Normalizer: streaming parse, < 5s wall-clock for a typical 1 MB JSONL transcript; < 30s for an outlier 50 MB transcript.
- INDEX update: atomic (write-temp + rename), < 100ms.
- Ingestion worker drain: 100 records from quarantine graduation in < 60s of underboard-reachable time (SC-008 bound).

**Constraints**:
- Capture MUST NOT block CC session UI (FR-001, FR-014 fail-soft).
- Tracked artifacts MUST be plain-text (FR-012 cross-tool readable); no binary, no CC-specific format leaks.
- Spool tables MUST be transactional (atomic graduation, atomic purge, no half-written rows).
- Redaction coverage ≥99% (SC-002); false-positive rate documented and tunable.
- Honcho outage MUST NOT delay raw/normalized/INDEX updates (FR-007).

**Scale/Scope**:
- Typical CC session: 0.1–5 MB JSONL, 50–500 messages.
- Outlier CC session: 50 MB JSONL (long sessions reading many large files).
- Per-project retention default: `keep-N=30` sessions, `size-cap=500MB` raw.
- Ingestion throughput: low (one record per quarantine graduation; not a high-volume pipeline).
- Single-user, localhost trust model (per 005/008).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Pre-research: ✅ All 9 principles reviewed, no violations (see [research.md §Constitution Principle check](research.md#constitution-principle-check-post-research)).

Post-design (this section, re-evaluated after Phase 1 below):

| Principle | Verdict | Notes |
|-----------|---------|-------|
| I — Source of truth | ✅ PASS | Capture hook in `.claude/hooks/` (source); CLI logic in `packages/cli/`; ingest in `packages/underboard/`. Config extends `helpers.config.ts`. No reverse flow. |
| II — Transformer not fork | ✅ PASS (N/A) | No new AI-tool target introduced. Dialog capture is harness infra, not a transpile destination. |
| III — Protected slots | ✅ PASS (N/A) | No generated files touched; all new files. |
| IV — SemVer 0.x | ✅ PASS | Feature → MINOR bump. New runtime dep (`chokidar`) → MINOR. `/bump` will classify correctly. |
| V — Token economy | ✅ PASS | Hook body is fire-and-forget spawn (`child_process.spawn` detached); adds zero per-turn context to CC sessions. Hook is registered in `.claude/settings.json` for `Stop` event only. |
| VI — Cross-AI review gate | ✅ DEFERRED | Gate enforced at `/speckit.implement`, not at plan. Will require `reviews/analyze.md` + ≥2 external reviewers. |
| VII — Artifact versioning | ⚠️ BLOCKED (not violated) | `plan/007-dialog-capture/v1` + `tasks/...` tags blocked by repo's unresolved submodule conflicts. Tags applied after merge-conflict resolution. |
| VIII — Self-maintaining knowledge | ✅ PASS | N/A for plan phase; capture pipeline itself becomes the `/learn` data source post-implementation. |
| IX — Two-phase review | ✅ PASS | `specs/007-dialog-capture/` is the planning branch; `<slug>` implementation branch created from `main` after planning PR merges. |

**No violations.** No Complexity Tracker entries needed (single new runtime dep, no new project/package boundary, no new transformer).

## Project Structure

### Documentation (this feature)

```text
specs/007-dialog-capture/
├── spec.md                 # /speckit.full-spec output (Phase 1 + Phase 2 clarifications)
├── checklists/
│   └── requirements.md     # Spec quality checklist (all green)
├── research.md             # Phase 0 (/speckit.plan): V1–V6 + tech decisions
├── plan.md                 # This file
├── data-model.md           # Phase 1: entities + state machines
├── contracts/              # Phase 1: interface contracts
│   ├── capture-hook.md
│   ├── normalized-record.md
│   ├── ingestion-pipeline.md
│   └── cli-commands.md
├── quickstart.md           # Phase 1: test scenarios
└── tasks.md                # Phase 2 (/speckit.tasks): task breakdown
```

### Source Code (repository root)

```text
.claude/hooks/
└── dialog-capture.mjs              # NEW — Stop-hook wrapper: spawns packages/cli detached

packages/cli/
├── src/
│   ├── dialog-capture/             # NEW subpackage
│   │   ├── mod.ts                  # Public exports
│   │   ├── watcher.ts              # chokidar file-watch + 5-min inactivity finalizer (V1)
│   │   ├── normalizer.ts           # JSONL → normalized .md (V2 defensive parsing)
│   │   ├── redaction/
│   │   │   ├── engine.ts           # Redaction engine: catalog + allowlist + external hook
│   │   │   ├── catalog-loader.ts   # YAML catalog parser + version stamp
│   │   │   └── types.ts            # RedactionRule, RedactionResult, Catalog
│   │   ├── index-updater.ts        # Atomic INDEX.md write-temp + rename
│   │   ├── retention.ts            # keep-N + size-cap pruning + archive path
│   │   ├── backfill.ts             # dialog-backfill command impl
│   │   ├── renormalize.ts          # dialog-renormalize command impl
│   │   ├── recovery.ts             # dialog-purge + redaction-miss recovery (US6)
│   │   └── config.ts               # helpers.config.ts#dialogs loader
│   └── cli/
│       └── dialog.ts               # NEW — Commander subcommands: backfill, renormalize, purge
├── tests/
│   ├── unit/dialog-capture/        # Unit tests (normalizer, redaction, retention, etc.)
│   ├── integration/dialog-capture/ # Pipeline integration with planted secrets
│   └── fixtures/golden/redaction/  # Golden fixtures: known secrets + legit code corpus
└── package.json                    # +chokidar dependency

packages/underboard/
├── src/
│   ├── dialog-ingest/              # NEW subpackage
│   │   ├── mod.ts                  # Public exports
│   │   ├── quarantine-spool.ts     # dialog_quarantine_spool table + graduation logic
│   │   ├── outage-spool.ts         # dialog_outage_spool table + reconciliation
│   │   ├── tombstones.ts           # dialog_tombstones table (US6 recovery)
│   │   ├── worker.ts               # Event-driven worker (FR-020)
│   │   ├── honcho-client.ts        # Honcho v3 Session/Message REST client (V4)
│   │   └── ingest.ts               # Normalized record → Honcho Session + Messages
│   ├── storage/
│   │   └── migrations/
│   │       └── 0011-dialog-spools.sql  # NEW migration: 3 tables
│   └── tools/
│       └── memory.ts               # Extended: route type=dialog queries to session-search
├── tests/
│   ├── unit/dialog-ingest/         # Spool + worker + Honcho client tests
│   └── integration/dialog-ingest/  # End-to-end ingest with mocked Honcho
└── package.json                    # (no new deps; undici already present)

presets/redaction/                  # NEW — extends 006's presets/ directory
├── catalog_cloud.yml               # AWS/GCP/Azure key patterns
├── catalog_pii.yml                 # JWT, SSH private blocks, phone, email, CC
├── allowlist.yml                   # Default allowlist: test fixtures, EXAMPLE suffixes
└── external-scanner-contract.md    # Hook spec for TruffleHog/Semgrep/gitleaks (FR-004)

helpers.config.ts                   # MODIFIED — add `dialogs` section (capture config)
.ai/dialogs/                        # EXISTS (006 Phase 1) — directories + INDEX scaffold present
├── raw/                            # gitignored (006)
├── raw/.partial/                   # NEW — in-progress file-watch snapshots
├── log/                            # tracked (006) — normalized records land here
└── INDEX.md                        # tracked (006) — auto-populated by this feature
```

**Structure Decision**: Single-monorepo-internal layout. No new top-level package; the feature is split across `packages/cli/src/dialog-capture/` (capture-side logic) and `packages/underboard/src/dialog-ingest/` (ingest-side logic), reflecting the natural seam: capture is per-CC-session synchronous work, ingest is asynchronous background work touching shared memory. The hook itself is a thin `.claude/hooks/` wrapper to keep Constitution Principle I intact (hook = source-of-truth AI config).

## Phases

### Phase 0: Outline & Research

✅ Complete — see [research.md](research.md). All V1–V6 verification items resolved; technology decisions locked; constitution principles re-checked.

### Phase 1: Design & Contracts

**Output (this plan)**:
- `data-model.md` — entities (Raw transcript, Normalized record, INDEX row, Quarantine spool entry, Outage spool entry, Tombstone, Capture config, Redaction catalog, Rotation policy) + state machines (record lifecycle, spool graduation).
- `contracts/capture-hook.md` — Stop hook event + file-watch wrapper + capture config schema.
- `contracts/normalized-record.md` — markdown schema (header + body + raw pointer) + redaction catalog YAML format + allowlist mechanism.
- `contracts/ingestion-pipeline.md` — quarantine/outage spool schemas + worker event triggers + Honcho Session/Message mapping + dedup/tombstone semantics.
- `contracts/cli-commands.md` — `dialog-backfill`, `dialog-renormalize`, `dialog-purge`, `dialog-doctor` CLI contracts.
- `quickstart.md` — 6 test scenarios (one per user story) + edge-case probes.
- `specs/main/architecture.md` — §2 (source of truth) + §5/§5.1 (package layouts) + §6 (SpecKit integration) updated with 007 reference.

## Key rules

- All paths absolute in tasks.md.
- Single new runtime dependency (`chokidar`); any other dep addition requires `/speckit.analyze` flag.
- `.claude/hooks/dialog-capture.mjs` MUST be < 50 LOC (thin wrapper); all logic in `packages/cli/`.
- No code in this plan phase; only design artifacts.

## Snapshot Stage (Principle VII)

`plan/007-dialog-capture/v1` tag — **blocked** by repo's unresolved submodule conflicts on `main`. Will be applied after:

```powershell
git checkout -b specs/007-dialog-capture
git add specs/007-dialog-capture/
git commit -m "feat(specs): add 007-dialog-capture plan + Phase 1 artifacts"
.specify\scripts\powershell\snapshot-stage.ps1 -Stage plan -Slug 007-dialog-capture
```
