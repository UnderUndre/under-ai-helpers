# Implementation Plan: Memory Backend — Honcho Integration with Local Fallback

**Branch**: `specs/006-008` | **Date**: 2026-06-13 | **Spec**: [spec.md](../../008-memory-backend-honcho/spec.md)
**Input**: Feature specification from `specs/008-memory-backend-honcho/spec.md`

## Summary

Replace underboard's broken local ML pipeline (toy tokenizer, dead sqlite-vec, never-started backfill worker) with a pluggable memory backend boundary. Honcho v3.0.9 (already running locally via Docker, backed by Postgres 16 + pgvector + TEI embed/rerank) becomes the semantic primary; the local FTS5/BM25 lexical tier stays as permanent offline fallback. Agent-facing MCP contract (7 tools from spec 005) is untouched. Dead ML code (~400 LOC + onnxruntime-node dependency) is deleted. Two unregistered tools are registered. Sync queue survives Honcho outages with durable `pending_sync` state.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 20+ LTS (unchanged from 005)
**Primary Dependencies**: @modelcontextprotocol/sdk, better-sqlite3, commander, c12, consola, dompurify, jsdom (remove: onnxruntime-node, sqlite-vec)
**Storage**: Local SQLite (better-sqlite3, FTS5 — retained for lexical tier + sync queue + tombstones) + Honcho v3 REST API (semantic tier)
**Testing**: vitest (consistent with packages/underboard/)
**Target Platform**: Windows / macOS / Linux developer machine, localhost-only
**Project Type**: Standalone MCP server (`packages/underboard/`) — modify existing, not new package
**Performance Goals**: <500ms p95 recall, <1s p95 write at 10k entries (005 budgets preserved through local REST hop to Honcho)
**Constraints**: <64MB idle (ONNX removed), offline = lexical degraded mode, single-user localhost, no GPU
**Scale/Scope**: ~10k memory entries across ~20 projects; Honcho already handles vector search
**MCP Transport**: HTTP+SSE (2024-11-05 spec), unchanged from 005
**Honcho Pin**: v3.0.9 (live-probed 2026-06-13, 35+ REST endpoints under `/v3/`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Source of Truth | PASS | No `.claude/` template edits |
| II. Transformer, Not Fork | PASS | No new transpile targets |
| III. Protected Slots | N/A | No managed files involved |
| IV. SemVer 0.x | PASS | underboard at 0.1.0, breaking change = MINOR bump to 0.2.0 |
| V. Token Economy | PASS | Removes dead code, net negative LOC |
| VI. Cross-AI Review Gate | N/A | Plan stage, not implement |
| VII. Artifact Versioning | PASS | Will snapshot via `snapshot-stage.ps1` |
| VIII. Self-Maintaining Knowledge | PASS | Pattern: backend seam for external service with local fallback — candidate for `/learn` |
| IX. Two-Phase Review Flow | PASS | On `specs/006-008` planning branch |

No violations. No complexity tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/008-memory-backend-honcho/
├── spec.md              # Feature specification (done)
├── plan.md              # This file
├── research.md          # Honcho API mapping + verification
├── data-model.md        # Schema changes (new tables, dropped columns)
├── quickstart.md        # Dev setup + Honcho wiring
├── contracts/
│   └── memory-backend.md # Backend interface contract
└── tasks.md             # Task breakdown (Phase 2 output)
```

### Source Code (modifications to existing package)

```text
packages/underboard/src/
├── server/
│   ├── mcp-server.ts        # MODIFY: register 2 missing tools + deep-recall
│   └── http-server.ts       # MODIFY: inject backend, health enhancements
├── storage/
│   ├── database.ts          # MODIFY: new migration runner
│   ├── memory-store.ts      # MODIFY: add sync-queue fields, remove embedding helpers
│   ├── sync-queue-store.ts  # NEW: pending_sync queue CRUD
│   ├── tombstone-store.ts   # NEW: tombstone CRUD
│   └── migrations/
│       ├── 001_initial_schema.sql    # UNCHANGED (already applied)
│       └── 002_backend_seam.sql      # NEW: sync_queue, tombstones, retire embedding cols
├── memory-backend/
│   ├── interface.ts          # NEW: MemoryBackend abstract contract
│   ├── local-lexical.ts      # NEW: FTS5-only backend (refactored from retrieval/)
│   ├── honcho.ts             # NEW: Honcho REST client backend
│   ├── honcho-client.ts      # NEW: Low-level Honcho API client (HTTP + auth)
│   ├── backend-factory.ts    # NEW: Backend selection + health + fallback logic
│   └── reconciler.ts         # NEW: Background sync queue drain → Honcho
├── retrieval/
│   ├── lexical.ts            # RETAIN (used by local-lexical backend)
│   ├── hybrid-retrieval.ts   # DELETE (fusion moves into backend logic)
│   └── semantic.ts           # DELETE (sqlite-vec dead code)
├── embedding/                # DELETE ENTIRE DIRECTORY
│   ├── embedding-service.ts
│   ├── model-downloader.ts
│   └── backfill.ts
├── tools/
│   ├── memory/
│   │   ├── write.ts          # MODIFY: route through backend interface
│   │   ├── recall.ts         # MODIFY: route through backend interface
│   │   ├── recall-cross.ts   # MODIFY: route through backend interface
│   │   ├── list-recent.ts    # MODIFY: route through backend interface
│   │   ├── get.ts            # MODIFY: route through backend interface
│   │   ├── delete.ts         # MODIFY: route through backend interface
│   │   ├── delete-cross.ts   # MODIFY: route through backend interface
│   │   └── deep-recall.ts    # NEW: P3 dialectic tool (config-gated)
│   └── emit-event.ts         # UNCHANGED
├── project/
│   └── detector.ts           # UNCHANGED
└── events/
    └── event-bus.ts          # UNCHANGED

packages/underboard/
├── package.json              # MODIFY: remove onnxruntime-node, sqlite-vec
└── tests/
    ├── unit/
    │   ├── memory-backend-interface.test.ts   # NEW
    │   ├── local-lexical-backend.test.ts      # NEW
    │   ├── honcho-backend.test.ts             # NEW
    │   ├── honcho-client.test.ts              # NEW
    │   ├── reconciler.test.ts                 # NEW
    │   └── tombstone-store.test.ts            # NEW
    └── integration/
        ├── mcp-tools.test.ts                  # MODIFY: test both backends
        └── degradation.test.ts                # NEW: kill-container simulation
```

**Structure Decision**: Modify the existing `packages/underboard/` package. New `memory-backend/` directory holds the seam. Delete `embedding/` and dead retrieval code. Migration 002 adds sync queue + tombstone tables.

## Implementation Phases

### Phase 0: Research

Resolve verification items from spec before design locks:

1. **V1 (Conclusion hard-delete)**: Probe `DELETE /v3/workspaces/{id}/conclusions/{conclusion_id}` — spec shows this endpoint. If available, tombstone can hard-purge. If not, tombstone-only.
2. **V2 (TEI model identity)**: Query `GET /info` on TEI embed container (port 8080) for model name + multilingual support.
3. **V3 (Payload size limits)**: Test `POST /v3/workspaces/{id}/conclusions` with 64KB+ content.
4. **V4 (Search latency)**: Benchmark `POST /v3/workspaces/{id}/conclusions/query` at 10k entries.
5. **Workspace naming collision**: Verify workspace creation idempotency when two machines share the same Honcho.
6. **Conclusion schema**: What fields does a Conclusion carry? Does it have free-form content + metadata? Does `conclusions/query` accept semantic search queries?

### Phase 1: Design Artifacts

Generated in this plan:
- `data-model.md` — schema changes: new `sync_queue` and `tombstones` tables, `memory_entries` column retirements
- `contracts/memory-backend.md` — `MemoryBackend` TypeScript interface
- `research.md` — Honcho API mapping + verification results
- `quickstart.md` — Honcho wiring + config

### Phase 1.1: Architecture Updates

Update `specs/main/architecture.md` §5.1 and §10:
- §5.1: Remove ONNX/sqlite-vec references. Add `memory-backend/` directory. Note Honcho as semantic backend.
- §10: New data flow diagram showing two-tier backend (Honcho REST + local SQLite).

### Post-Design Constitution Re-check

No new violations introduced by Phase 1 design. All gates still PASS.

## Complexity Tracking

No violations to track.
