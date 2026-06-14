# SpecKit Analyze: 008-memory-backend-honcho

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: 2026-06-13T18:30:00Z
**Commit**: 0a623e6ff883fc186a4ca325276da9234f6b4f5c
**Artifacts**: spec.md, plan.md, tasks.md, data-model.md, contracts/memory-backend.md, research.md, quickstart.md

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| C1 | Inconsistency | HIGH | spec.md:125 (FR-001) vs contracts/memory-backend.md:63 | FR-001 mandates "005 contract MUST remain unchanged" but the backend interface renames `embedding_status` to `backend_status` with different values (`"semantic"` vs `"ready"`, adds `"pending_sync"`). Agent-facing output schema changes. | Either keep `embedding_status` field name in the output with the same values from 005 (`"ready"` / `"lexical_only"`) and add `"pending_sync"` as a new value, OR explicitly document this as an additive extension (new field `backend_status` alongside the legacy `embedding_status`). The safer path: keep `embedding_status` as-is, add `sync_status` as a separate field. |
| C2 | Coverage Gap | HIGH | spec.md:134 (FR-010) vs tasks.md (no task) | FR-010 ("first activation of Honcho backend, existing local entries MUST be importable in one re-runnable, deduplicated pass") has no corresponding task. quickstart.md references `underboard memory resync` CLI command, but no task creates this command. | Add task T29 in Lane A or B: implement `underboard memory resync` CLI subcommand that reads all `memory_entries` and pushes to Honcho with content-hash dedup. ~60 LOC, depends on T04. |
| C3 | Inconsistency | MEDIUM | contracts/memory-backend.md:16 vs research.md:92-93 | Interface method signatures diverge: contract defines `get()` and `listRecent()` as **synchronous** (no `Promise`), research.md defines them as **async** (`Promise<GetOutput>`, `Promise<ListRecentOutput>`). | Standardize on async throughout (HonchoBackend will need async for REST calls; local can be sync but wrapped in Promise for interface conformance). Update contract to `Promise<>` for all methods. |
| C4 | Inconsistency | MEDIUM | data-model.md:66-67 vs contracts/memory-backend.md:42 | `sync_status` CHECK constraint in data-model allows `('pending', 'synced', 'failed')` but the `BackendWriteOutput.sync_status` type only allows `"synced" | "pending"`. Missing `"failed"` in contract type. | Add `"failed"` to `BackendWriteOutput.sync_status` type in contract. |
| C5 | Inconsistency | MEDIUM | research.md:32 vs data-model.md:77 | Config key naming drift: research.md references `memory.honcho_token` as the config key; data-model.md uses `honcho_token_env` (which names an env var, not the token itself). Different semantics. | Clarify in research.md: `honcho_token_env` is the config key naming the *environment variable* that holds the actual token. Update research.md to match data-model.md naming. |
| C6 | Underspecification | MEDIUM | spec.md:135 (FR-011) vs tasks.md | FR-011 ("integration MUST be pinned to a specific verified Honcho version") is implicitly handled by T05 (BackendFactory) but no task explicitly implements version checking or mismatch warning logic. T21 covers health reporting but not the check itself. | Either fold version check into T05 explicitly (add to description) or add as subtask. The implementation should call `GET /health` or parse OpenAPI `info.version` and compare against `honcho_pinned_version` config. |
| C7 | Inconsistency | MEDIUM | tasks.md:99-101 vs plan.md:55 | tasks.md states "tasks.md # Phase 2 output (not created yet)" in plan.md:55, but tasks.md exists. Minor doc drift from plan authoring — plan was written before tasks were generated. | Update plan.md:55 to remove "(not created yet)" note. |
| C8 | Underspecification | MEDIUM | research.md:65 vs contracts/memory-backend.md:130 | Honcho recall path merges Honcho semantic results with local FTS5 results ("returns best of both signals"). The fusion algorithm is unspecified — how are Honcho semantic scores and local BM25 scores combined? The old hybrid-retrieval.ts used `0.4*lexical + 0.6*semantic` but that code is being deleted (T17). | Specify the fusion strategy in the contract or research.md: either (a) return Honcho results only when available (simpler, Honcho already has semantic+lexical internally), or (b) re-apply weighted fusion. Option (a) is simpler since Honcho's conclusions/query likely already does semantic search via pgvector. |
| C9 | Underspecification | LOW | research.md:54-56 | Workspace creation body is `{"name": "underboard-{project_id}"}` but Honcho OpenAPI `WorkspaceCreate` schema is not fully verified — the field might not be called `name`. Need V-verification. | Flag as verification item for Phase 0 (already partially covered by research.md R1 point 6 "Conclusion schema"). |
| C10 | Underspecification | LOW | tasks.md:110 | Agent dispatch plan assigns T08-T21 (~13 tasks) to `backend-specialist` but this is a sequential bottleneck — no parallelism within the agent. Consider splitting Lane C (T09-T15) to a second backend agent if available. | Acceptable for single-agent execution; flag for capacity planning. |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 (backend boundary + 005 contract stable) | YES | T01, T09-T15, T22 | See C1 — contract stability claim violated by field rename |
| FR-002 (Honcho impl: write/recall/list/get/delete) | YES | T03, T04, T24, T25 | — |
| FR-003 (lexical fallback + degradation) | YES | T02, T23, T28 | — |
| FR-004 (outage spool + reconciliation) | YES | T07, T08, T26 | — |
| FR-005 (remove ONNX/sqlite-vec/tokenizer) | YES | T16, T17, T18, T19 | — |
| FR-006 (register 2 missing tools) | YES | T11, T15 | — |
| FR-007 (delete hides via tombstone) | YES | T07, T13, T14 | — |
| FR-008 (config-driven backend selection) | YES | T05 | — |
| FR-009 (health reports backend/queue/degraded) | YES | T21 | — |
| FR-010 (first-activation import) | **NO** | — | See C2 — no task implements `underboard memory resync` |
| FR-011 (version pin) | PARTIAL | T05 (implicit) | See C6 — no explicit version-check task |
| FR-012 (deep recall tool) | YES | T20 | P3, deferred to post-MVP |
| FR-013 (offline-first SC-012 superseded) | N/A | — | Scope documentation, no implementation needed |
| FR-014 (dedup + provenance backend-agnostic) | YES | T01, T02, T04 | — |

## Constitution Alignment Issues

No constitution MUST violations detected. All 9 principles pass.

- Principle IV (SemVer): Plan correctly identifies this as a breaking change requiring MINOR bump (0.1.0 → 0.2.0). ✓
- Principle VII (Artifact Versioning): Tags `plan/008-memory-backend-honcho/v1` and `tasks/008-memory-backend-honcho/v1` created. ✓
- Principle IX (Two-Phase Review): On `specs/006-008` planning branch. ✓

## Unmapped Tasks

All tasks map to at least one requirement or user story. No orphan tasks.

## Metrics

- Total Requirements: 14 (FR-001 through FR-014)
- Total Tasks: 28 (T01-T28)
- Coverage % (requirements with ≥1 task): 93% (13/14 — FR-010 uncovered)
- Ambiguity count: 2 (C8 fusion algorithm, C9 workspace field name)
- Duplication count: 0
- CRITICAL count: 0
- HIGH count: 2 (C1, C2)
- MEDIUM count: 5 (C3, C4, C5, C6, C7)
- LOW count: 3 (C8 reclassified, C9, C10)

## VERDICT

```yaml
verdict: MEDIUM
reviewer: analyze
reviewed_at: 2026-06-13T18:30:00Z
commit: 0a623e6ff883fc186a4ca325276da9234f6b4f5c
critical_count: 0
high_count: 2
medium_count: 5
low_count: 3
```
