# Recon: 005-agents-board-and-memory Spec Audit

**Reviewer**: honcho (Valera recon) | **Date**: 2026-06-13 | **Scope**: read-only spec extraction

## Summary

Spec 005 defines a local-first MCP tool server ("underboard") providing AI coding agents with a shared persistent semantic memory store and a visible task board. Memory uses SQLite (better-sqlite3) with FTS5 + sqlite-vec hybrid retrieval and ONNX MiniLM local embeddings — no cloud, no GPU. Seven MCP memory tools are fully contracted. The system is single-user, localhost-only, offline-first after one-time model download, with hard latency budgets (500ms p95 recall, 1s p95 write) and a 512MB RAM cap. Multi-tool consumption (Claude Code, Gemini CLI, Codex, Cursor, Hermes) is via the MCP protocol over SSE transport; the dashboard/event bus is independent of memory rows but shares the same SQLite event table for delta sync.

## Facts

### (a) Memory-Subsystem Functional Requirements & MCP Tool Signatures

**Functional requirements** (spec.md:115-128):

- **FR-001** (spec.md:117): Write memory entry with dedup on exact content match within project; provenance merge `(agent, timestamp)` on collision.
- **FR-002** (spec.md:118): Recall by semantic similarity (project-scoped).
- **FR-003** (spec.md:119): Separate cross-project recall tool (explicit, non-default).
- **FR-004** (spec.md:120): List recent entries chronologically, content truncated at 500 chars.
- **FR-004a** (spec.md:121): `memory_get` for full entry by ID.
- **FR-005** (spec.md:122): Delete by ID, project-scoped, rate-limited 100/60s per agent.
- **FR-005a** (spec.md:123): Separate `memory_delete_cross_project` tool requiring explicit `project_id`.
- **FR-006** (spec.md:124): Embeddings computed locally, no external calls.
- **FR-007** (spec.md:125): Default recall scoped to detected project only.
- **FR-008** (spec.md:126): Cross-project results include source project ID on every entry.
- **FR-009** (spec.md:127): Hybrid retrieval combining lexical (keyword) + semantic (vector) signals.

**MCP memory tool list** (contracts/memory-tools.md):

| Tool | Input | Output | Line |
|------|-------|--------|------|
| `memory_write` | `content: string` (max 1MB), `tags?: string[]` | `{ id, created: boolean, provenance[] }` | contracts/memory-tools.md:32-54 |
| `memory_recall` | `query: string`, `top_k?: number` (def 5, max 50), `threshold?: number` (def 0.3) | `{ results: [{id, content, tags, provenance, score, similarity, created_at}], embedding_status }` | contracts/memory-tools.md:66-97 |
| `memory_recall_cross_project` | Same as `memory_recall` | Same + `project_id`, `project_name` per result | contracts/memory-tools.md:100-131 |
| `memory_list_recent` | `limit?: number` (def 20, max 100) | `{ entries: [{id, content, truncated, full_length, tags, provenance, created_at}] }` | contracts/memory-tools.md:135-159 |
| `memory_get` | `id: string` | `{ id, content (full), tags, provenance, created_at }` | contracts/memory-tools.md:163-187 |
| `memory_delete` | `id: string` | `{ deleted: boolean, id }` — scoped to caller's project | contracts/memory-tools.md:190-211 |
| `memory_delete_cross_project` | `id: string`, `project_id: string` | `{ deleted: boolean, id }` — explicit target project | contracts/memory-tools.md:215-236 |

**Scoring formula** (contracts/memory-tools.md:94): `score = 0.4 * lexical_bm25_normalized + 0.6 * semantic_cosine`.

**Dedup mechanism** (data-model.md:84-87): `UNIQUE (project_id, content_hash)` constraint with `ON CONFLICT DO UPDATE` provenance append. Provenance capped at 20 entries (spec.md:209): first 5 original + last 10 recent, `truncated_count` for discarded middle.

### (b) Non-Functional Constraints

| Constraint | Value | Evidence |
|------------|-------|----------|
| **Offline-first** | Yes — all ops work without internet after first-time model download (~120MB) | spec.md:192 (Assumption 5), SC-012 (spec.md:245) |
| **Localhost-only** | Binds exclusively to `127.0.0.1` by default; `0.0.0.0` requires explicit opt-in | spec.md:161 (FR-028) |
| **Single-user** | V1 assumption: single user, single machine, no multi-tenant | spec.md:188 (Assumption 1) |
| **Zero-config** | Mostly — sensible defaults; config overrides via c12 config file or CLI flags | plan.md:69 (config.ts uses c12) |
| **Auth** | 32-byte random Bearer token auto-generated on first start, saved to `~/.underboard/token` | spec.md:162 (FR-028a) |
| **Recall latency** | <500ms p95 at 10k entries on commodity laptop (no GPU) | spec.md:238 (SC-004) |
| **Write latency** | <1s p95 on commodity laptop | spec.md:239 (SC-005) |
| **Dashboard SSE push** | <500ms p95 from commit to browser render | spec.md:237 (SC-003) |
| **RAM (model loaded)** | <512MB resident | spec.md:241 (SC-007) |
| **RAM (model unloaded)** | <64MB resident | spec.md:241 (SC-007) |
| **Model footprint** | ~120MB on disk, ~250-400MB RAM | spec.md:199 (Assumption 12), research.md:23 |
| **Inference latency** | ~15-40ms per sentence on commodity CPU | research.md:24 |
| **Scale** | ~10k memory entries across projects (~32MB total DB) | data-model.md:192-199 |
| **Embedding dims** | 384 (MiniLM) | data-model.md:67, data-model.md:156 |
| **Content limits** | Soft warn at 64KB, hard reject at 1MB | spec.md:204 (Assumption 17) |
| **Recall defaults** | top_k=5, threshold=0.3, max 50 per call | spec.md:203 (Assumption 16) |
| **CORS/Origin validation** | Host + Origin headers validated against localhost | spec.md:163 (FR-028b), contracts/memory-tools.md:241 |
| **XSS protection** | DOMPurify on all agent-written content rendered in dashboard | spec.md:154 (FR-024a) |

### (c) Retrieval Design & Rationale for Local SQLite

**Architecture** (plan.md:10):

- **Lexical**: FTS5 virtual table `memory_fts` with `unicode61` tokenizer, synced via triggers on INSERT/DELETE of `memory_entries` (data-model.md:129-149).
- **Semantic**: sqlite-vec virtual table `memory_vectors` using `vec0`, storing float[384] embeddings, mapped 1:1 to `memory_entries.rowid` (data-model.md:152-170).
- **Embedding model**: ONNX Runtime (`onnxruntime-node`) running `paraphrase-multilingual-MiniLM-L12-v2` locally — multilingual (Russian/English confirmed), ~120MB disk, ~250-400MB RAM, ~15-40ms/sentence CPU inference (research.md:18-26).
- **Hybrid fusion**: `score = 0.4 * BM25_normalized + 0.6 * cosine` (contracts/memory-tools.md:94).
- **Graceful degradation**: If embedding model unavailable → lexical-only retrieval, `embedding_status: "lexical_only"` flag in response, writes still accepted with `embedding_status: "pending"` for backfill (spec.md:175, FR-034; data-model.md:68-69).
- **Fallback path**: If sqlite-vec extension fails to load → JS cosine similarity computation on BLOB vectors (research.md:13).

**Rationale for local SQLite** (synthesized from research.md + plan.md):

- **Why SQLite, not Postgres/external DB**: Single-file, zero-config, no daemon to manage, offline-first, embedded in-process with better-sqlite3 (synchronous, no connection pool needed). Fits single-user single-machine V1 assumption.
- **Why better-sqlite3**: Synchronous API (no callback hell), WAL mode for concurrent reads, transaction support including virtual tables (research.md:30-35).
- **Why sqlite-vec over custom vector search**: Native vector index in SQLite, avoids separate vector DB (Chroma, Qdrant, etc.). Validated cross-platform Win/Mac/Linux with prebuilt binaries (research.md:9-14).
- **Why ONNX over PyTorch/TF**: Lightweight runtime (~40-60MB binary), no Python dependency, runs in Node.js process directly (research.md:18-26).
- **Why `paraphrase-multilingual-MiniLM-L12-v2` over English-only model**: Spec targets Russian/English mixed-language environments (research.md:26).
- **Why not React SPA**: Build step overhead, ~150KB+ bundle, framework churn for a dashboard that's a single page with SSE. Vanilla HTML+CSS+JS chosen instead — no build step, self-contained (research.md:67-81, R5).

**Alternatives considered/rejected** (explicitly mentioned):
- React SPA for dashboard → rejected (research.md:67-81)
- Separate vector DB (Chroma/Qdrant/etc.) → rejected implicitly by choosing sqlite-vec
- PyTorch/TF for embeddings → rejected by choosing ONNX Runtime
- English-only embedding model → rejected in favor of multilingual (research.md:26)
- GPU requirement → explicitly excluded (plan.md:21)

### (d) Success Criteria Tied to Memory Quality/Latency

| ID | Criterion | Threshold | spec.md line |
|----|-----------|-----------|--------------|
| SC-001 | Semantic recall quality: correct entry in top 5 results for typical phrasing | >95% of trials | :235 |
| SC-002 | Scope isolation: project-scoped recall returns zero cross-project entries | 100% | :236 |
| SC-003 | Dashboard SSE push latency (task status change → browser render) | <500ms p95 | :237 |
| SC-004 | Memory recall latency at 10k entries, commodity laptop, no GPU | <500ms p95 | :238 |
| SC-005 | Memory write acknowledgement (persisted + retrievable) | <1s p95 | :239 |
| SC-006 | Project auto-detection success in any Git working tree | 100% non-fallback | :240 |
| SC-007 | Idle resident memory (model loaded / model unloaded) | <512MB / <64MB | :241 |
| SC-009 | Service uptime without crashes | ≥7 days | :243 |
| SC-010 | Export-then-import preserves 100% of tasks + memory entries + equivalent recall results | 100% | :244 |
| SC-012 | All memory ops work without internet after first install | Pass | :245 |

### (e) Multi-Tool Consumption Story & Dashboard/Event Bus Dependencies

**MCP as universal integration layer** (spec.md:6, plan.md:23-24):

- Protocol: MCP over HTTP+SSE transport, pinned to 2024-11-05 SSE spec (plan.md:23).
- Dual transport: SSE for multi-agent + dashboard, stdio for single-agent local use (research.md:42-46, R3).
- Client CWD injection: agents pass working directory via `clientInfo.cwd` on MCP `initialize` or `X-Agent-CWD` / `X-Agent-Name` headers on SSE connection (plan.md:24).
- Named agents: Claude Code, Cursor, Codex, Gemini CLI, Hermes explicitly listed (spec.md:6).
- No agent registration required — system accepts any new agent name on first call (spec.md:109, edge case).

**Dashboard/event bus relationship to memory**:

- **Event table is independent**: `events` table (data-model.md:108-125) records state-change events (`task_created`, `task_updated`, `memory_added`, `memory_deleted`, etc.) — it is a side effect of memory/task mutations, not a dependency of the memory subsystem itself.
- **Dashboard does not depend on memory rows**: Dashboard SSE consumes the `events` table for delta sync on reconnect (research.md:50-64, R4). The event bus (`event-bus.ts`, plan.md:89) is an in-process pub/sub that emits events to connected SSE clients. Memory writes emit events; the dashboard renders them. Neither subsystem queries the other's data directly at runtime.
- **Event pruning**: Events pruned to last 10k entries automatically (data-model.md:125).
- **SSE reconnection**: Client sends `Last-Event-ID` header → server replays delta from `events` table. If gap >1000 events → full state snapshot (research.md:58-63).
- **Dashboard memory feed** (FR-021, spec.md:150): Shows recent memory entries with snippets — this is a read-only view, not a bidirectional dependency.

## Uncertainties

1. **sqlite-vec cross-platform reliability**: Research (R1) validates it works but the fallback to JS cosine is mentioned as a real possibility, not just theoretical. Production robustness across Windows ARM, unusual Linux distros, etc. is untested in the spec.
2. **Hybrid fusion weights (0.4/0.6)**: The BM25/cosine weight split is stated as a formula but no evaluation methodology or benchmark is defined. SC-001 says ">95% of typical-phrasing trials" but no test corpus or evaluation protocol is specified.
3. **Embedding model download on first run**: Spec says "one-time internet access" for model download but edge case "Embedding model fails to download or load" (spec.md:100) only covers graceful degradation — no retry mechanism beyond "backoff schedule" is detailed.
4. **Provenance cap behavior**: Cap of 20 entries preserving first 5 + last 10 (spec.md:209) means 5 middle entries are discarded with only a count. Whether this matters in practice is unclear — no scenario demonstrates provenance list actually reaching 20.
5. **`stable_key` for project identity**: Derived from git remote URL (data-model.md:26). For repos with no remote (local-only git repos), `stable_key` may be null, and project identity falls back to path hash — breaking export/import portability across machines (spec.md:190, Assumption 3).
6. **SSE backpressure**: Research item R6 (plan.md:149) mentions a 1MB buffer cap and dropping slow consumers, but no spec requirement or success criterion validates this behavior.
7. **`content_hash` collision probability**: SHA-256 truncated? The spec says SHA-256 of content (data-model.md:87) — full hash used, collision probability negligible. No uncertainty here, just confirming.
8. **Multilingual tokenization in FTS5**: `unicode61` tokenizer (data-model.md:136) handles Unicode but may not stem Russian properly — could affect BM25 quality for Russian queries. Not addressed in research.
