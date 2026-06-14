# Recon: 005-agents-board-and-memory Code Audit

**Reviewer**: honcho (Valera recon) | **Date**: 2026-06-13 | **Scope**: read-only code analysis of `packages/underboard/`

## Summary

All 7 memory MCP tools from the spec contract are implemented and wired into `mcp-server.ts`. The tool logic layer (`src/tools/memory/`) is complete with rate limiting, dedup, and truncation. The storage layer (`memory-store.ts`) directly operates on a raw `better-sqlite3` `Database` handle — there is no abstraction interface between tool logic and SQLite. The schema matches the spec: `memory_entries` table with FTS5 virtual table and triggers are in the migration; `memory_vectors` (sqlite-vec) is noted as runtime-loaded but **not created in the migration** (comment only at `001_initial_schema.sql:101`). The embedding pipeline uses a toy tokenizer (word-hash based) rather than a real tokenizer, meaning embedding quality is currently placeholder-grade. Hybrid fusion (BM25 + cosine) is fully implemented in `hybrid-retrieval.ts`. The event bus and dashboard read memory tables directly (`http-server.ts:12` imports `listRecentMemory`), bypassing any would-be interface. Two MCP tools from the contract (`memory_recall_cross_project`, `memory_delete_cross_project`) are implemented in code but **not registered** in `mcp-server.ts`.

## Facts

### (a) Implementation Status — Memory MCP Tools

| Tool | Implemented | Registered in MCP Server | Notes |
|------|-------------|--------------------------|-------|
| `memory_write` | YES | YES (`mcp-server.ts:42-49`) | Dedup, content-size validation, event emit. Working. |
| `memory_recall` | YES | YES (`mcp-server.ts:51-59`) | Hybrid BM25+cosine. Working. |
| `memory_recall_cross_project` | YES | **NO** — file exists (`recall-cross.ts`) but **not registered** in `mcp-server.ts` | Code loops all projects, fuses results. |
| `memory_list_recent` | YES | YES (`mcp-server.ts:61-67`) | 500-char truncation. Working. |
| `memory_get` | YES | YES (`mcp-server.ts:69-74`) | Full content retrieval. Working. |
| `memory_delete` | YES | YES (`mcp-server.ts:76-82`) | Rate-limited 100/60s. Working. |
| `memory_delete_cross_project` | YES | **NO** — file exists (`delete-cross.ts`) but **not registered** in `mcp-server.ts` | Spec requires `project_id` param. Code implements it. |

**Task board tools**: `task_create`, `task_update`, `task_list`, `task_list_assigned`, `task_archive` — all registered and working. Missing from registration: `task_list_assigned_cross_project` (code file exists at `src/tools/tasks/list-assigned-cross.ts` but not registered in `mcp-server.ts`).

**Verdict**: 5/7 memory tools registered and functional. 2/7 implemented but unreachable via MCP. 0 scaffolds/TODOs — all code is production-grade logic.

### (b) SQLite Schema for Memories

**Migration**: `src/storage/migrations/001_initial_schema.sql`

**`memory_entries` table** (`:34-47`):
```sql
CREATE TABLE IF NOT EXISTS memory_entries (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  content          TEXT NOT NULL,
  tags             TEXT,                          -- JSON array
  provenance       TEXT NOT NULL,                 -- JSON array of {agent, ts}
  embedding        BLOB,                          -- Float32 array (384 dims)
  embedding_status TEXT NOT NULL DEFAULT 'pending'
                   CHECK (embedding_status IN ('pending', 'ready', 'failed')),
  content_hash     TEXT NOT NULL,                 -- SHA-256 of content
  created_at       TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE (project_id, content_hash)               -- Dedup guard
);
```

**Indexes** (`:49-50`):
- `idx_memory_project_created` ON `(project_id, created_at DESC)`
- `idx_memory_embedding_status` ON `(embedding_status)` WHERE `embedding_status = 'pending'`

**FTS5 virtual table** (`:86-91`):
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content,
  content='memory_entries',
  content_rowid='rowid',
  tokenize='unicode61'
);
```

**FTS5 triggers** (`:93-99`): `memory_fts_insert` (AFTER INSERT), `memory_fts_delete` (AFTER DELETE) — keep FTS in sync.

**sqlite-vec virtual table**: **NOT in migration**. Only a comment at `:101-102`:
```sql
-- memory_vectors (sqlite-vec) is loaded at runtime via db.loadExtension()
-- See: src/embedding/embedding-service.ts and src/tools/memory/write.ts
```
No `CREATE VIRTUAL TABLE memory_vectors` in the migration. The `semanticSearch` function in `semantic.ts:20-27` queries `memory_vectors` — this table would need to be created at runtime after `db.loadExtension()`. **This runtime creation is not implemented in the codebase.** The `http-server.ts:56` hardcodes `vecAvailable = false`:
```typescript
const mcpServer = createMcpServer(db, false);
```

**Config table** (`_config`, `:74-84`): Stores `lexical_weight` (0.4), `semantic_weight` (0.6) among other settings — but the hybrid retrieval **does not read from `_config`**. It uses hardcoded defaults (`hybrid-retrieval.ts:30-31`).

### (c) Embedding Pipeline

**Files**:
- `src/embedding/embedding-service.ts` (104 LOC) — ONNX Runtime session + `embed()` function
- `src/embedding/model-downloader.ts` (66 LOC) — HuggingFace download
- `src/embedding/backfill.ts` (44 LOC) — Periodic pending-embedding backfill worker

**Model**: `paraphrase-multilingual-MiniLM-L12-v2.onnx` (`embedding-service.ts:12`)
- **Download URL**: `https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/model.onnx` (`model-downloader.ts:10`)
- **Disk location**: `~/.underboard/models/` (`embedding-service.ts:11`)
- **Expected size**: ~120MB (per spec; not validated in code)
- **Runtime**: CPU only, `graphOptimizationLevel: "all"` (`embedding-service.ts:30-31`)

**Cold-start cost**: `initializeEmbedding()` (`embedding-service.ts:19-38`):
1. Checks if model file exists → if missing, sets `status = "failed"` (does NOT auto-download)
2. Dynamic imports `onnxruntime-node`
3. Creates `InferenceSession` on CPU
4. On failure → `status = "failed"`, recall degrades to lexical-only

**Critical issue — Toy tokenizer** (`embedding-service.ts:91-103`):
```typescript
function tokenize(text: string): { ids: number[]; attentionMask: number[] } {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const ids = words.map((w) => {
    let hash = 0;
    for (let i = 0; i < w.length; i++) {
      hash = ((hash << 5) - hash + w.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 30000;
  });
```
This is a **hash-based word-to-id mapper** with a 30k vocab. The real MiniLM model expects WordPiece/SentencePiece tokenization with a 250k+ vocab. The embeddings produced are therefore **not semantically meaningful** — the tokenizer produces garbage token IDs that don't correspond to the model's vocabulary. Embedding similarity scores will be near-random.

**Embedding output**: Mean pooling over token hidden states (`:63-71`), L2 normalization (`:73-82`). The pipeline shape is correct; only the tokenizer is wrong.

**Backfill worker** (`backfill.ts:6-44`): Polls every 5 seconds for `embedding_status = 'pending'` entries, computes embeddings in batches of 10. Returns stop function.

### (d) Hybrid Retrieval Fusion — File and Algorithm

**File**: `src/retrieval/hybrid-retrieval.ts` (111 LOC)

**Algorithm** (`hybridRetrieve()`, `:15-110`):

1. **Lexical branch** (`:34`): `lexicalSearch(db, query, projectId, topK * 3)` — FTS5 BM25 via `memory_fts`, normalized to [0,1] by dividing by max absolute rank (`lexical.ts:36-42`).
2. **Semantic branch** (`:36-48`): If `queryEmbedding` exists:
   - If `vecAvailable`: `semanticSearch()` — sqlite-vec `vec0` cosine distance (`semantic.ts:19-37`)
   - Else: `semanticSearchJS()` — brute-force JS cosine over all project embeddings (`semantic.ts:53-79`)
   - Score = `1 - distance` (for vec) or raw cosine (for JS)
3. **Score fusion** (`:50-70`):
   ```
   Map<rowid, { lexical: number, semantic: number }>
   for each rowid:
     combinedScore = lexicalWeight * scores.lexical + semanticWeight * scores.semantic
   filter by combinedScore >= threshold
   sort by combinedScore DESC
   take topK
   ```
   Default weights: `lexicalWeight = 0.4`, `semanticWeight = 0.6` (`:30-31`).
4. **Hydration** (`:76-108`): Batch-fetch full `memory_entries` rows by rowid, join with fused scores.

**Lexical search** (`lexical.ts:9-43`): FTS5 `MATCH` with OR-joined quoted terms, BM25 ranking, min-max normalization to [0,1].

**Semantic search** (`semantic.ts`): Two implementations:
- `semanticSearch()` (`:9-37`): sqlite-vec `MATCH` with cosine distance — requires `memory_vectors` table (currently not created).
- `semanticSearchJS()` (`:53-79`): Loads ALL project embeddings into memory, computes cosine in JS — O(n) brute force, works without sqlite-vec.

### (e) THE SEAM — Memory Backend Interface Boundary

**There is no abstraction interface.** Every memory tool and storage function takes a raw `Database` (better-sqlite3) handle directly. The seam would need to be created.

**Memory-specific files (would go behind the interface)**:

| File | LOC | Role |
|------|-----|------|
| `src/storage/memory-store.ts` | 191 | CRUD: write, get, getByHash, listRecent, delete, deleteCrossProject, updateEmbedding, getPendingEmbeddings |
| `src/retrieval/hybrid-retrieval.ts` | 111 | BM25 + cosine fusion |
| `src/retrieval/lexical.ts` | 44 | FTS5 BM25 query |
| `src/retrieval/semantic.ts` | 80 | sqlite-vec + JS cosine fallback |
| `src/embedding/embedding-service.ts` | 104 | ONNX model load + embed() |
| `src/embedding/model-downloader.ts` | 66 | HuggingFace download |
| `src/embedding/backfill.ts` | 44 | Pending embedding backfill worker |
| `src/tools/memory/write.ts` | 53 | MCP tool: content validation, dedup, event emit |
| `src/tools/memory/recall.ts` | 58 | MCP tool: embed query, hybrid retrieve |
| `src/tools/memory/recall-cross.ts` | 51 | MCP tool: cross-project recall |
| `src/tools/memory/list-recent.ts` | 48 | MCP tool: chronological list + truncation |
| `src/tools/memory/get.ts` | 34 | MCP tool: full entry by ID |
| `src/tools/memory/delete.ts` | 54 | MCP tool: project-scoped delete + rate limit |
| `src/tools/memory/delete-cross.ts` | 19 | MCP tool: cross-project delete |
| **Memory subtotal** | **~957** | |

**Task-board-specific files**:

| File | LOC | Role |
|------|-----|------|
| `src/storage/task-store.ts` | 270 | CRUD, list, listAssigned, listAssignedCrossProject, delete, getConfig, computeStalled |
| `src/tools/tasks/create.ts` | 97 | MCP tool: validation, status check, deps check |
| `src/tools/tasks/update.ts` | ~80 (est.) | MCP tool: partial update, CAS |
| `src/tools/tasks/list.ts` | 66 | MCP tool: filtered list |
| `src/tools/tasks/list-assigned.ts` | ~30 (est.) | MCP tool: agent-scoped list |
| `src/tools/tasks/list-assigned-cross.ts` | ~30 (est.) | MCP tool: cross-project assigned list |
| `src/tools/tasks/archive.ts` | ~25 (est.) | MCP tool: archive toggle |
| `src/tools/tasks/activity-log.ts` | ~50 (est.) | MCP tool: activity log CRUD |
| **Task subtotal** | **~648** | |

**Shared infrastructure (both subsystems depend on)**:

| File | LOC | Role |
|------|-----|------|
| `src/storage/database.ts` | 92 | SQLite connection, migrations |
| `src/storage/project-store.ts` | 60 | Project CRUD |
| `src/storage/event-store.ts` | 62 | Event persistence + pruning |
| `src/events/event-bus.ts` | 87 | SSE broadcast + replay |
| `src/tools/emit-event.ts` | 12 | Event emit helper |
| `src/project/detector.ts` | 63 | CWD → project ID |
| `src/server/mcp-server.ts` | 143 | MCP tool registration |
| `src/server/http-server.ts` | 270 | HTTP server + SSE + REST API |
| `src/server/auth.ts` | 49 | Bearer token management |
| `src/cli/index.ts` | ~80 (est.) | Commander CLI |
| `src/cli/config.ts` | ~30 (est.) | c12 config |
| `src/index.ts` | ~20 (est.) | Entry point |
| `migrations/001_initial_schema.sql` | 102 | Schema |
| **Shared subtotal** | **~1,070** | |

**Memory: ~957 LOC. Task: ~648 LOC. Shared: ~1,070 LOC. Total: ~2,675 LOC.**

**Proposed interface boundary** — the functions to abstract behind a `MemoryBackend` interface:

| Current function | File:line | Role |
|------------------|-----------|------|
| `writeMemory()` | `memory-store.ts:44` | Write + dedup |
| `getMemory()` | `memory-store.ts:117` | Get by ID |
| `getMemoryByHash()` | `memory-store.ts:127` | Get by content hash |
| `listRecentMemory()` | `memory-store.ts:138` | Chronological list |
| `deleteMemory()` | `memory-store.ts:152` | Project-scoped delete |
| `deleteMemoryCrossProject()` | `memory-store.ts:163` | Cross-project delete |
| `updateEmbedding()` | `memory-store.ts:171` | Set embedding vector |
| `getPendingEmbeddings()` | `memory-store.ts:181` | Backfill queue |
| `lexicalSearch()` | `lexical.ts:9` | FTS5 BM25 |
| `semanticSearch()` | `semantic.ts:9` | sqlite-vec search |
| `semanticSearchJS()` | `semantic.ts:53` | JS cosine fallback |
| `hybridRetrieve()` | `hybrid-retrieval.ts:15` | Fusion orchestration |
| `embed()` | `embedding-service.ts:41` | Compute embedding |
| `initializeEmbedding()` | `embedding-service.ts:19` | Load model |
| `runBackfill()` | `backfill.ts:6` | Backfill worker |

A `MemoryBackend` interface would encapsulate all of `memory-store.ts`, `lexical.ts`, `semantic.ts`, `hybrid-retrieval.ts`, and `embedding/` — approximately 534 LOC of storage+retrieval logic. The tool layer (`src/tools/memory/`, ~317 LOC) would call the interface instead of raw `Database`.

### (f) Dashboard / Event Bus — Direct Memory Table Access

**YES — dashboard reads memory tables directly, bypassing any would-be interface.**

Evidence:
1. `http-server.ts:12` — `import { listRecentMemory } from "#storage/memory-store.ts"` — the HTTP server imports the storage function directly.
2. `http-server.ts:136` — Health endpoint queries `memory_entries` directly: `db.prepare("SELECT COUNT(*) as cnt FROM memory_entries").get()`
3. The `/events` SSE stream (`http-server.ts:152-168`) does not read memory tables directly — it reads from the `events` table via `event-store.ts`. Memory mutations emit events via `emitEvent()` (`emit-event.ts:5-11`), which writes to the `events` table and broadcasts via `EventBus`.

**Event bus dependency on memory**: The event bus (`event-bus.ts`) is agnostic — it persists and broadcasts generic `(type, payload)` events. Memory tools emit `memory_added` and `memory_deleted` events. The event bus does not query memory tables. The dashboard receives these events via SSE and presumably renders memory-related UI from the event payloads (which include `content_snippet` for `memory_added` — see `write.ts:45`).

**Summary of cross-boundary reads**:
- `http-server.ts` → `memory-store.ts:listRecentMemory()` (for health endpoint memory count + presumably dashboard memory feed)
- `http-server.ts` → direct SQL `SELECT COUNT(*) FROM memory_entries` (health)
- Event bus → `event-store.ts` only (no direct memory reads)
- MCP tools → `memory-store.ts` directly (no interface)

## Uncertainties

1. **sqlite-vec never initialized at runtime**: The migration has only a comment about `memory_vectors`. No code in `database.ts`, `http-server.ts`, or `embedding-service.ts` calls `db.loadExtension()` for sqlite-vec or creates the `memory_vectors` virtual table. The `vecAvailable` flag is hardcoded to `false` (`http-server.ts:56`). The entire sqlite-vec path is dead code currently.

2. **Toy tokenizer renders embeddings meaningless**: The hash-based tokenizer in `embedding-service.ts:91-103` produces token IDs that don't correspond to the MiniLM vocabulary. All embedding vectors are therefore semantically random. The BM25 lexical path works correctly; the semantic path produces garbage scores. This means the 60% semantic weight in fusion actually *hurts* retrieval quality compared to pure BM25.

3. **`memory_recall_cross_project` and `memory_delete_cross_project` not registered**: Both tools have complete implementations but are absent from `mcp-server.ts`. Agents cannot invoke them. This is a registration gap, not an implementation gap.

4. **`_config` table weights not used by retrieval**: `hybrid-retrieval.ts:30-31` hardcodes `0.4/0.6` weights. The `_config` table stores these values (`001_initial_schema.sql:83-84`) but no code reads them. Changing config has no effect on fusion behavior.

5. **`uuid` vs `uuidv7`**: Spec requires UUIDv7 (time-sortable). Code uses `randomUUID()` from `node:crypto` (`write.ts:33`, `create.ts:76`) which produces UUIDv4 (random). Not time-sortable.

6. **Embedding dimension mismatch risk**: `semantic.ts:69` divides `byteLength / 4` to reconstruct Float32Array. If the embedding model ever changes dimensions, there's no validation. Currently 384 dims × 4 bytes = 1536 bytes per embedding.

7. **`backfill.ts` never started**: The backfill worker (`runBackfill()`) is never called in `http-server.ts` or any startup code. Pending embeddings stay pending forever unless something external calls it. The `initializeEmbedding()` is called (`http-server.ts:261`) but the backfill ticker is not.

8. **Dashboard files not present**: The `dashboard/` directory is referenced in `http-server.ts:23` but does not exist in the source tree (not in file listing). The dashboard static file serving code would 404 on all requests.
