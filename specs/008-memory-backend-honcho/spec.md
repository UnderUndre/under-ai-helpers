# Feature Specification: Memory Backend — Honcho Integration with Local Fallback

**Feature Branch**: `specs/006-008` (shared planning branch) · slug `008-memory-backend-honcho`
**Created**: 2026-06-13
**Status**: Draft
**Input**: User description: "008-memory-backend-honcho" — migrate underboard's memory subsystem to a pluggable backend with the already-running Honcho v3 instance as the semantic primary, per the 2026-06-13 decision session (option C).

## Context

A 2026-06-13 recon (three dossiers in `specs/005-agents-board-and-memory/reviews/honcho-recon-{spec,code,infra}.md` + web research) established:

- **underboard's semantic memory path is placeholder-grade**: the embedding tokenizer is a hash-based stub producing token IDs outside the model vocabulary (embeddings semantically random); the sqlite-vec path is dead code (`vecAvailable` hardcoded false, `memory_vectors` never created); the embedding backfill worker is never started; 2 of 7 contracted memory tools are implemented but not registered. The 60%-weighted semantic signal currently *degrades* retrieval versus pure lexical search.
- **The lexical path works**: FTS5/BM25 with normalization is implemented correctly.
- **Nothing to migrate**: the underboard DB is schema-only (4KB); the service is not registered in any MCP config.
- **Working semantic infra already runs on this machine**: Honcho v3.0.9 (REST `/v3`, AGPL-3.0 server) backed by Postgres 16 + pgvector, Redis 7, and two local HuggingFace TEI services (embedding + rerank, CPU). Search and conclusions endpoints live-probed 2026-06-13.

**Decision (option C)**: introduce a memory-backend seam; Honcho becomes the semantic backend; the local lexical store remains as the offline/degraded tier; the broken local ML pipeline is removed. The agent-facing MCP memory contract from spec 005 stays stable.

## Clarifications

### Session 2026-06-13

- Q: Project ↔ Honcho mapping? → A: **Workspace-per-project** — each underboard project maps to its own Honcho workspace; isolation is structural (search is workspace-scoped natively), cross-project recall enumerates workspaces.
- Q: Physical representation of `memory_write`? → A: **Conclusions API** — a note is already a distilled fact; `POST /conclusions` on write, `conclusions/query` on recall. No deriver dependency, zero LLM calls on the write path. If V1 confirms conclusions lack hard-delete, FR-007 tombstones cover the contract.
- Q: Outage write policy? → A: **Local spool + resync** — writes accepted into the local store with `pending_sync` status; background reconciliation pushes to Honcho on recovery with content-hash dedup (mirrors 005's `embedding_status: pending` pattern).
- Q: Dialectic deep recall in scope? → A: **In scope, P3, disabled by default** — separate config-flagged tool; first candidate to cut if the feature drags.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Semantic recall that actually works (Priority: P1)

An agent (Claude Code, Gemini CLI, Codex) writes a working note via `memory_write` ("auth uses JWT with 1h TTL, refresh rotation disabled"). Days later, a different agent in the same project asks `memory_recall` with a paraphrase ("how do we handle token expiry?") and gets the note in the top results — because embeddings are now computed by a real, served embedding model instead of the broken local stub.

**Why this priority**: Semantic recall is the core value proposition of the memory feature (005/US-recall) and is currently non-functional. Everything else in this feature exists to serve this story.

**Independent Test**: Seed a corpus of ≥50 RU+EN notes across 2 projects; issue paraphrase queries; verify top-5 hit rate and project-scope isolation.

**Acceptance Scenarios**:

1. **Given** a note written via `memory_write` in project A, **When** an agent in project A recalls with a semantically similar but lexically different query, **Then** the note appears in top-5 results with a meaningful similarity score.
2. **Given** notes in projects A and B, **When** an agent in project A calls `memory_recall`, **Then** zero project-B entries appear (005 SC-002 isolation preserved).
3. **Given** the same corpus, **When** `memory_recall_cross_project` is called, **Then** results span projects and each carries its source project ID.
4. **Given** a recall request, **When** the backend serves it, **Then** no LLM text-generation call occurs in the recall path (semantic search only — latency and cost stay flat).

---

### User Story 2 - Backend seam with graceful degradation (Priority: P1)

The memory subsystem talks to storage through a pluggable backend boundary. When the Honcho container is down (laptop offline, infra restart), agents keep working: writes are accepted and recall degrades to lexical search with an explicit status flag — no tool errors, no lost notes. When Honcho returns, accumulated writes are reconciled automatically.

**Why this priority**: Equal-P1 because swapping a backend without a seam reproduces today's mess (storage logic welded to tool logic); and a hard runtime dependency on a Docker container without degradation would make memory *less* reliable than the current lexical-only reality.

**Independent Test**: Scripted session — write/recall with Honcho up; stop container mid-session; continue writing/recalling; restart container; verify reconciliation and status flags at each step.

**Acceptance Scenarios**:

1. **Given** Honcho is reachable, **When** any of the 7 memory tools is called, **Then** behavior matches the 005 contract (names, schemas, dedup, provenance, scoping, rate limits unchanged).
2. **Given** Honcho is unreachable, **When** `memory_recall` is called, **Then** lexical results return with a degraded-mode indicator (analogous to 005's `embedding_status: "lexical_only"`).
3. **Given** Honcho is unreachable, **When** `memory_write` is called, **Then** the write is durably accepted into the local store with `pending_sync` status (clarified: spool-and-resync policy).
4. **Given** Honcho recovers after an outage with spooled writes, **When** reconciliation runs, **Then** spooled entries become semantically recallable without duplicates (content-hash dedup honored).

---

### User Story 3 - Demolition of the dead local ML pipeline (Priority: P2)

A maintainer reads the memory code and finds no ONNX runtime, no model downloader, no hand-rolled tokenizer, no sqlite-vec remnants — the semantic path is a thin client to a served backend. The two contracted-but-unregistered memory tools (`memory_recall_cross_project`, `memory_delete_cross_project`) are registered and callable.

**Why this priority**: Dead/broken ML code is negative-value inventory: it misleads (60% fusion weight on garbage), bloats installs (`onnxruntime-node` is a heavyweight native dependency), and burns maintenance. Registration gaps make contracted tools unreachable.

**Independent Test**: Dependency audit + grep: no ONNX/sqlite-vec references in runtime code; `npm ls onnxruntime-node` empty; MCP tool listing shows 7/7 memory tools.

**Acceptance Scenarios**:

1. **Given** the refactored package, **When** dependencies are audited, **Then** `onnxruntime-node` is gone from package.json and install size drops accordingly.
2. **Given** the MCP server starts, **When** tools are listed, **Then** all 7 contracted memory tools are registered (vs 5/7 today).
3. **Given** the lexical fallback tier, **When** Honcho is disabled in config, **Then** FTS5/BM25 recall still works end-to-end (the working code survives the demolition).

---

### User Story 4 - Deep recall on demand (Priority: P3)

An agent needs synthesis, not lookup: "what do we know about this project's auth decisions and what contradicts what?" A separate opt-in tool routes this to Honcho's dialectic endpoint, which reasons over accumulated memory. It is clearly distinguished from `memory_recall` because it invokes LLM reasoning (slower, costs tokens).

**Why this priority**: High leverage but optional — plain semantic recall covers the 90% case. Clarified: in scope as P3, config-flagged, disabled by default; first candidate to cut on schedule pressure.

**Independent Test**: With the flag enabled and ≥20 related notes seeded, ask a synthesis question; verify a coherent, memory-grounded answer; verify the tool is absent when flag is off.

**Acceptance Scenarios**:

1. **Given** the deep-recall flag is off (default), **When** tools are listed, **Then** the tool is not exposed.
2. **Given** the flag is on, **When** a synthesis query is asked, **Then** the answer cites/reflects stored memories and the tool description warns about latency/cost.

---

### User Story 5 - Backend observability (Priority: P3)

The operator opens the health endpoint / runs the doctor check and sees: which memory backend is active, Honcho reachability and version, queue depth of unsynced writes, and degraded-mode status. The dashboard memory feed keeps working unchanged.

**Why this priority**: A two-tier memory without visibility produces "why is recall dumb today?" mysteries. Cheap to ship once the seam exists.

**Acceptance Scenarios**:

1. **Given** a healthy system, **When** health is queried, **Then** it reports backend type, Honcho version, and sync queue depth (0).
2. **Given** Honcho is down, **When** health is queried, **Then** degraded mode and a non-zero queue depth are visible.

---

### Edge Cases

- Honcho unreachable at service startup (vs mid-session) — backend selection must not block MCP server start.
- Auth token to Honcho invalid/expired — distinguishable error from "service down"; surfaced in health, not as tool crashes.
- Honcho image upgraded and `/v3` API drifts (v3 already had breaking changes: Observation→Conclusion rename) — version check warns on mismatch with the pinned, integration-tested version.
- `localhost` resolves to IPv6 `::1` and hangs against the container (observed 2026-06-13) — client must use an explicit address family / `127.0.0.1`.
- Outage reconciliation replays a write whose content already reached Honcho before the crash — content-hash dedup must make replay idempotent.
- Backend lacks a hard-delete for the chosen write representation — `memory_delete` must still hide the entry from all future recalls (tombstone), with hard-purge attempted when the API allows.
- Note content near the 005 limits (64KB soft / 1MB hard) vs Honcho's own payload limits — verification item V3.
- TEI embedding model is swapped/upgraded under Honcho — existing vectors may mismatch; recall quality regression must be detectable (seeded-corpus check, SC-001 re-run).
- Export/import (005 SC-010) across backends — exported archive must restore into either backend.
- Two machines pointing at the same Honcho with the same project — workspace naming must not collide destructively (single-user assumption holds, but name scheme must be deterministic).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Memory storage and retrieval MUST sit behind a single backend boundary; the agent-facing MCP memory tool contract from 005 (`contracts/memory-tools.md`: tool names, input/output schemas, dedup semantics, provenance merge ≤20, project scoping, rate limits) MUST remain unchanged for both backends.
- **FR-002**: A Honcho-backed implementation MUST provide write, project-scoped recall, cross-project recall, list, get, and delete. The recall path MUST NOT invoke LLM text generation (semantic search only). Mapping (clarified): **one Honcho workspace per underboard project** (deterministic name derived from the project's stable key); a note is written as a **Conclusion** and recalled via conclusions query; cross-project recall enumerates the project workspaces and merges results with source project IDs.
- **FR-003**: The existing lexical tier (FTS5/BM25) MUST be retained as a always-available fallback; on Honcho unavailability every memory tool MUST degrade (not fail) and flag degraded status in its response.
- **FR-004**: Writes during a Honcho outage MUST be accepted into the local store with `pending_sync` status and reconciled to Honcho by a background pass on recovery; reconciliation MUST be idempotent via content-hash dedup and MUST survive process restarts (queue state is durable).
- **FR-005**: The local semantic pipeline MUST be removed: ONNX runtime dependency, model downloader, stub tokenizer, sqlite-vec code paths, and the embedding backfill worker. The lexical store schema survives; vestigial embedding columns are retired or ignored with a recorded migration note.
- **FR-006**: `memory_recall_cross_project` and `memory_delete_cross_project` MUST be registered in the MCP server (closing the 005 registration gap).
- **FR-007**: `memory_delete` MUST hide the entry from all subsequent recalls (both tiers) immediately; if the backend representation lacks hard delete, a tombstone mechanism MUST guarantee the contract, with hard-purge applied when available (verification item V1).
- **FR-008**: Backend selection and Honcho connection parameters (endpoint, credentials, workspace naming scheme) MUST come from configuration/environment; no secrets in the repository; default behavior = Honcho when configured and reachable, lexical otherwise.
- **FR-009**: Health endpoint and doctor check MUST report: active backend, Honcho reachability/version vs pinned version, unsynced-write queue depth, degraded-mode flag. Version mismatch warns, never crashes.
- **FR-010**: On first activation of the Honcho backend, existing local entries (if any) MUST be importable in one re-runnable, deduplicated pass.
- **FR-011**: The integration MUST be pinned to a specific verified Honcho version (v3.0.9 at spec time); upgrading the pin is an explicit, tested change.
- **FR-012**: A deep-recall tool backed by Honcho's dialectic endpoint (clarified: in scope, P3) MUST be a separate tool from `memory_recall`, disabled by default behind a config flag, with latency/cost disclosure (LLM-bound, multi-second) in its description.
- **FR-013**: Spec 005's offline-first success criterion (SC-012) is superseded for the semantic tier: offline operation = lexical degraded mode with full write durability. This spec is the Principle-IX planning cycle that records that scope change.
- **FR-014**: Dedup (content-hash within project) and provenance merge (cap 20: first 5 + last 10 + truncated count) MUST be enforced backend-agnostically so behavior is identical across tiers.

### Key Entities

- **Memory backend**: the boundary contract — write/recall/cross-recall/list/get/delete/health; implementations: Honcho (semantic), local lexical (fallback).
- **Honcho mapping** (clarified): project → workspace (deterministic name from project stable key); agent → peer within the workspace; note → Conclusion attributed to the writing agent's peer; sessions unused by this feature (reserved for 007 dialog ingestion).
- **Sync-queue entry**: a locally accepted write awaiting Honcho reconciliation; carries content hash, provenance, timestamps.
- **Tombstone**: local record that a memory ID is deleted; filters recalls regardless of backend purge support.
- **Backend status**: per-call indicator (`semantic` | `lexical_only` | `pending_sync`) plus service-level health summary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a seeded corpus of ≥50 mixed RU/EN notes across 2 projects, paraphrase queries return the correct entry in top-5 in ≥95% of trials (005's SC-001, finally measurable — today's semantic scores are random).
- **SC-002**: Recall p95 <500ms and write acknowledgement p95 <1s at 10k entries with Honcho on the same machine (005 latency budgets preserved through the REST hop).
- **SC-003**: Kill-the-container test: 0 MCP tool errors during a scripted outage session; 100% of outage-period writes become semantically recallable within 60s of recovery; degraded status visible on every affected response.
- **SC-004**: `onnxruntime-node` removed from dependencies; ≥400 LOC of dead ML/vec code deleted; package install footprint shrinks by the ONNX runtime's size.
- **SC-005**: 005 memory contract tests pass unchanged against both backends (agent-facing API fully stable).
- **SC-006**: 7/7 contracted memory tools registered and callable (today: 5/7).
- **SC-007**: RU and EN paraphrase recall hit-rates differ by <10 percentage points on the seeded corpus (multilinguality verified against the actual TEI model — verification item V2).

## Assumptions

- Honcho v3.0.9 self-hosted stack is running and stays available on this machine (live-probed 2026-06-13: Postgres 16 + pgvector, Redis 7, TEI embed + rerank CPU); underboard reaches it over local REST.
- Honcho's deriver/dream background processing is NOT required for core memory operations (write/search work without LLM keys on the recall path); dialectic is the only LLM-bound surface and only if US4 is in scope.
- AGPL-3.0 applies to the Honcho server; underboard integrates strictly over REST and ships no Honcho code — license boundary holds.
- Single-user, localhost trust model from 005 stands; Honcho bearer credentials live in local config, not the repo.
- Task board, events, dashboard, and project detection in underboard are untouched by this feature.
- Local lexical tier is **permanent**, not transitional — offline laptops are a real scenario; demolishing it is out of the question for v1.
- Feature 007 stays reserved for dialog-capture (006/US7 follow-up); ingestion of dialog archives into Honcho sessions is that feature's natural home, not this one's.

## Verification Items (empirical, pre-implementation)

| # | Item | Why it matters |
|---|------|----------------|
| V1 | Does Honcho expose hard-delete for the chosen write representation (conclusions/messages)? Probe showed POST/list/query for conclusions, no DELETE | FR-007 tombstone vs purge |
| V2 | Which embedding model do the TEI containers actually serve (multilingual?) | SC-007 RU/EN parity |
| V3 | Honcho payload size limits for messages/conclusions vs 005's 64KB/1MB | Edge case: oversized notes |
| V4 | Honcho search latency under 10k-entry load on this hardware | SC-002 feasibility |

## Out of Scope

- Honcho deriver/dream configuration, tuning, or representation features beyond what recall needs.
- Using official Honcho MCP plugins as the agent-facing surface (variant D — rejected: loses project auto-scoping, dedup/provenance, and board integration).
- Task-domain fixes (e.g., `task_list_assigned_cross_project` registration gap) — same bug class, different subsystem.
- Dashboard rebuild or the missing `dashboard/` static files from 005.
- Multi-user/auth model changes; Honcho hosting/deployment changes.
- Dialog-archive ingestion into Honcho (reserved for 007-dialog-capture).
- Fixing 005's other review findings (CAS for tasks, SSE backpressure) — tracked separately.
