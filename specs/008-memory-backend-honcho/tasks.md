# Tasks: Memory Backend — Honcho Integration

**Feature**: 008-memory-backend-honcho | **Date**: 2026-06-13 | **Plan**: [plan.md](./plan.md)

## Task Breakdown

### Lane A: Backend Seam (critical path, P1)

| ID | Task | Agent | Files | Depends | LOC est. | Skills |
|----|------|-------|-------|---------|----------|--------|
| T01 | Define `MemoryBackend` TypeScript interface + shared types | [backend-specialist] | `src/memory-backend/interface.ts` | — | ~80 | typescript-expert, api-patterns |
| T02 | Refactor `LocalLexicalBackend` from existing `memory-store.ts` + `lexical.ts` | [backend-specialist] | `src/memory-backend/local-lexical.ts`, `src/storage/memory-store.ts` | T01 | ~150 | typescript-expert |
| T03 | Implement `HonchoClient` low-level REST client (workspace/peer/conclusion CRUD) | [backend-specialist] | `src/memory-backend/honcho-client.ts` | — | ~200 | api-patterns, typescript-expert |
| T04 | Implement `HonchoBackend` (write + recall + delete via HonchoClient, with local dual-write) | [backend-specialist] | `src/memory-backend/honcho.ts` | T02, T03 | ~250 | api-patterns, typescript-expert |
| T05 | Implement `BackendFactory` (config-driven selection + health check + fallback + Honcho version pin check) | [backend-specialist] | `src/memory-backend/backend-factory.ts` | T02, T04 | ~100 | typescript-expert |
| T06 | Wire backend into `mcp-server.ts` — inject via factory, pass to all tool functions | [backend-specialist] | `src/server/mcp-server.ts`, `src/server/http-server.ts` | T05 | ~60 | typescript-expert |

### Lane B: Sync Queue + Tombstones (P1, parallel with Lane A after T01)

| ID | Task | Agent | Files | Depends | LOC est. | Skills |
|----|------|-------|-------|---------|----------|--------|
| T07 | Migration 002: `sync_queue` + `tombstones` tables + `sync_status` column on `memory_entries` | [database-architect] | `src/storage/migrations/002_backend_seam.sql`, `src/storage/sync-queue-store.ts`, `src/storage/tombstone-store.ts` | — | ~120 | database-design |
| T08 | Implement reconciler (background sync queue drain → Honcho) | [backend-specialist] | `src/memory-backend/reconciler.ts` | T04, T07 | ~100 | api-patterns, typescript-expert |
| T29 | Implement `underboard memory resync` CLI subcommand — first-activation import of existing local entries to Honcho (re-runnable, deduplicated via content-hash) | [backend-specialist] | `src/cli/resync.ts`, `src/cli/index.ts` | T04, T07 | ~60 | typescript-expert |

### Lane C: Tool Rewiring (P1, depends on Lane A)

| ID | Task | Agent | Files | Depends | LOC est. | Skills |
|----|------|-------|-------|---------|----------|--------|
| T09 | Rewire `memory_write` through backend interface | [backend-specialist] | `src/tools/memory/write.ts` | T06 | ~20 | typescript-expert |
| T10 | Rewire `memory_recall` through backend interface | [backend-specialist] | `src/tools/memory/recall.ts` | T06 | ~20 | typescript-expert |
| T11 | Rewire `memory_recall_cross_project` through backend + register in MCP server | [backend-specialist] | `src/tools/memory/recall-cross.ts`, `src/server/mcp-server.ts` | T06 | ~30 | typescript-expert |
| T12 | Rewire `memory_list_recent` through backend | [backend-specialist] | `src/tools/memory/list-recent.ts` | T06 | ~15 | typescript-expert |
| T13 | Rewire `memory_get` through backend (tombstone-aware) | [backend-specialist] | `src/tools/memory/get.ts` | T06, T07 | ~15 | typescript-expert |
| T14 | Rewire `memory_delete` through backend (tombstone + Honcho purge) | [backend-specialist] | `src/tools/memory/delete.ts` | T06, T07 | ~25 | typescript-expert |
| T15 | Rewire `memory_delete_cross_project` + register in MCP server | [backend-specialist] | `src/tools/memory/delete-cross.ts`, `src/server/mcp-server.ts` | T06, T07 | ~20 | typescript-expert |

### Lane D: Demolition (P2, parallel with Lane C)

| ID | Task | Agent | Files | Depends | LOC est. | Skills |
|----|------|-------|-------|---------|----------|--------|
| T16 | Delete `src/embedding/` directory (embedding-service, model-downloader, backfill) | [backend-specialist] | `src/embedding/*` | T06 | -200 | clean-code |
| T17 | Delete `src/retrieval/hybrid-retrieval.ts` + `src/retrieval/semantic.ts` | [backend-specialist] | `src/retrieval/hybrid-retrieval.ts`, `src/retrieval/semantic.ts` | T06 | -190 | clean-code |
| T18 | Remove `onnxruntime-node` + `sqlite-vec` from `package.json` dependencies | [backend-specialist] | `packages/underboard/package.json` | T16 | ~5 | nodejs-best-practices |
| T19 | Clean imports — remove all references to deleted modules | [backend-specialist] | Various | T16, T17 | ~20 | typescript-expert |

### Lane E: P3 Features (deferred, depends on Lane A+C)

| ID | Task | Agent | Files | Depends | LOC est. | Skills |
|----|------|-------|-------|---------|----------|--------|
| T20 | Implement `memory_deep_recall` tool (Honcho dialectic, config-gated) | [backend-specialist] | `src/tools/memory/deep-recall.ts`, `src/server/mcp-server.ts` | T04, T06 | ~60 | api-patterns |
| T21 | Enhance health endpoint with backend status, Honcho version, sync queue depth | [backend-specialist] | `src/server/http-server.ts`, `src/server/mcp-server.ts` | T05, T07 | ~40 | api-patterns |

### Lane F: Testing (parallel with implementation)

| ID | Task | Agent | Files | Depends | LOC est. | Skills |
|----|------|-------|-------|---------|----------|--------|
| T22 | Unit tests: `MemoryBackend` interface compliance (mock backend) | [test-engineer] | `tests/unit/memory-backend-interface.test.ts` | T01 | ~100 | testing-patterns, tdd-workflow |
| T23 | Unit tests: `LocalLexicalBackend` (FTS5 recall, dedup, tombstone filter) | [test-engineer] | `tests/unit/local-lexical-backend.test.ts` | T02 | ~120 | testing-patterns |
| T24 | Unit tests: `HonchoClient` (mock HTTP) | [test-engineer] | `tests/unit/honcho-client.test.ts` | T03 | ~100 | testing-patterns |
| T25 | Unit tests: `HonchoBackend` (mock client, dual-write, sync queue) | [test-engineer] | `tests/unit/honcho-backend.test.ts` | T04 | ~120 | testing-patterns |
| T26 | Unit tests: reconciler + tombstone store | [test-engineer] | `tests/unit/reconciler.test.ts`, `tests/unit/tombstone-store.test.ts` | T07, T08 | ~80 | testing-patterns |
| T27 | Integration tests: MCP tools against both backends | [test-engineer] | `tests/integration/mcp-tools.test.ts` | T09-T15 | ~80 | webapp-testing |
| T28 | Integration test: degradation (Honcho down → lexical → recovery) | [test-engineer] | `tests/integration/degradation.test.ts` | T08, T09-T15 | ~80 | webapp-testing |

## Dependency Graph

```
T01 ──► T02 ──► T04 ──► T05 ──► T06 ──► T09..T15 (Lane C)
         │              ▲                      │
         └──────────────┘                      ├─► T20 (P3)
                                              T21 (P3)
T03 ──► T04
T07 ──► T08 ──► T26
T07 ──► T13, T14, T15
T04,T07 ──► T29

T06 ──► T16, T17 ──► T18 ──► T19 (Lane D, parallel with C)

T01 ──► T22
T02 ──► T23
T03 ──► T24
T04 ──► T25
T09-T15 ──► T27, T28 (Lane F, parallel tracking)
```

## Parallel Lanes

| Lane | Tasks | Can run parallel with |
|------|-------|----------------------|
| A (seam) | T01-T06 | B (T07) |
| B (sync/tomb) | T07-T08, T29 | A (T01-T03), F (T22) |
| C (tool wiring) | T09-T15 | D (T16-T19) |
| D (demolition) | T16-T19 | C (T09-T15) |
| E (P3) | T20-T21 | After A+C (deferred) |
| F (testing) | T22-T28 | Parallel tracking with A-D |

## Critical Path

```
T01 → T02 → T04 → T05 → T06 → T09..T15 → T27..T28
     T03 ──↑                    T16..T19 ──↑
T07 ──→ T08 ──────────────────────────────↑
```

**Critical path length**: T01 + T02 + T04 + T05 + T06 + max(T09..T15) + T27 ≈ 8 sequential steps.

## Agent Dispatch Plan

| Agent | Tasks | Total LOC | Skills to Load |
|-------|-------|-----------|----------------|
| [backend-specialist] | T01-T06, T08-T21, T29 | ~960 net | api-patterns, typescript-expert |
| [database-architect] | T07 | ~120 | database-design |
| [test-engineer] | T22-T28 | ~680 | testing-patterns, tdd-workflow, webapp-testing |

**Dispatch order**: database-architect (T07) and backend-specialist (T01-T03) start in parallel. Test-engineer trails implementation by 1-2 tasks (TDD: write test first, then implement).

## Suggested MVP Scope

**MVP = Lanes A + B + C + D (T01-T19, T29) + Lane F tests (T22-T28)**

- P1 user stories (semantic recall + backend seam + demolition)
- All 7 MCP tools registered and working
- Sync queue + tombstones
- Dead ML code removed
- Tests passing

**Post-MVP (separate PR)**: Lane E (T20-T21) — deep recall + health enhancements.

**Estimated total LOC**: ~690 net new, ~390 deleted = +300 net change.
