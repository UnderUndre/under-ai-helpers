# Research: Honcho API Mapping & Verification

**Feature**: 008-memory-backend-honcho | **Date**: 2026-06-13

## R1: Honcho REST API Mapping

**Source**: Live OpenAPI probe from `infra-honcho-1` container (v3.0.9), 2026-06-13.

### Entity Mapping (spec clarification: workspace-per-project)

| Underboard Entity | Honcho Entity | API Path | Method |
|-------------------|---------------|----------|--------|
| Project | Workspace | `/v3/workspaces` | POST (get-or-create) |
| Agent | Peer (within workspace) | `/v3/workspaces/{ws}/peers` | POST (get-or-create) |
| Memory entry (note) | Conclusion | `/v3/workspaces/{ws}/conclusions` | POST (create) |
| Recall (semantic) | Conclusion query | `/v3/workspaces/{ws}/conclusions/query` | POST |
| List conclusions | Conclusion list | `/v3/workspaces/{ws}/conclusions/list` | POST |
| Delete conclusion | Conclusion delete | `/v3/workspaces/{ws}/conclusions/{id}` | DELETE |
| Cross-project recall | Enumerate workspaces → query each | `/v3/workspaces/list` + per-ws query | POST×N |
| Deep recall (P3) | Peer chat (dialectic) | `/v3/workspaces/{ws}/peers/{peer}/chat` | POST |
| Search messages | Workspace search | `/v3/workspaces/{ws}/search` | POST |
| Health | `/health` | GET | — |

### Workspace Naming Scheme

Workspace name = `underboard-{stable_key_prefix}` (first 16 chars of SHA-256 of project root path, same as underboard's `project.id`). Deterministic, collision-resistant at dev-machine scale.

Example: project with root `/Users/dev/my-app` → workspace name `underboard-a1b2c3d4e5f67890`.

### Auth

Honcho requires `Authorization: Bearer <token>` on all `/v3/` endpoints. Token comes from underboard config (`memory.honcho_token`), NOT from `~/.underboard/token` (that's underboard's own MCP auth).

### Conclusion Schema (from OpenAPI)

```typescript
interface ConclusionCreate {
  content: string;           // Free-form text
  metadata?: Record<string, unknown>;  // Optional structured metadata
}

interface Conclusion {
  id: string;
  workspace_id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
```

### Write Path (memory_write → Honcho)

1. `POST /v3/workspaces` with `{"name": "underboard-{project_id}"}` — idempotent get-or-create.
2. `POST /v3/workspaces/{ws}/peers` with `{"name": agent_name}` — idempotent get-or-create.
3. Compute content hash locally → check dedup.
4. `POST /v3/workspaces/{ws}/conclusions` with `{"content": content, "metadata": {"tags": [...], "content_hash": "...", "provenance": [...]}}`.

### Recall Path (memory_recall → Honcho)

1. Get-or-create workspace (step 1 from write).
2. `POST /v3/workspaces/{ws}/conclusions/query` with the query.
3. Merge with local FTS5 results (if both available) or return Honcho-only.

**Key constraint**: `conclusions/query` likely returns ranked results. Need to verify if it accepts a semantic search query (free text) and returns similarity scores.

### V1: Conclusion Hard-Delete

OpenAPI shows `DELETE /v3/workspaces/{ws}/conclusions/{conclusion_id}`. If this works (200/204), hard-purge is available. Tombstone still needed as a local fast-filter to avoid the REST round-trip on every recall.

### V2: TEI Model Identity

TEI embed service runs on port 8080 (`infra-tei-embed-1`). `GET /info` should reveal the model. HuggingFace TEI with CPU image supports multiple models — need to probe. If multilingual model (e.g., `BAAI/bge-m3` or similar), RU/EN parity (SC-007) is plausible.

### V3: Payload Size

Need to test with 64KB+ content. Honcho uses FastAPI/Pydantic — default JSON body limit is typically 1MB+. Should be compatible with 005's limits.

### V4: Search Latency

Local REST hop adds ~1-5ms. Honcho's pgvector search at 10k entries should be sub-100ms. Total well under 500ms budget.

## R2: Backend Interface Design

**Approach**: TypeScript interface with two implementations.

```typescript
interface MemoryBackend {
  write(entry: WriteInput, ctx: ToolContext): Promise<WriteOutput>;
  recall(query: RecallInput, ctx: ToolContext): Promise<RecallOutput>;
  recallCrossProject(query: RecallInput): Promise<CrossRecallOutput>;
  listRecent(input: ListRecentInput, ctx: ToolContext): Promise<ListRecentOutput>;
  get(id: string): Promise<GetOutput>;
  delete(id: string, ctx: ToolContext): Promise<DeleteOutput>;
  deleteCrossProject(id: string, projectId: string): Promise<DeleteOutput>;
  health(): Promise<BackendHealth>;
}

interface BackendHealth {
  backend: "honcho" | "local_lexical";
  honcho_reachable: boolean;
  honcho_version: string | null;
  sync_queue_depth: number;
  degraded: boolean;
}
```

**Backend selection**:
- Config: `memory.backend = "honcho" | "local_lexical"` (default: `"honcho"` if configured).
- Runtime: if configured `"honcho"` but unreachable → degrade to `"local_lexical"`, set `degraded = true`.
- Never blocks MCP server startup on Honcho unavailability.

## R3: Sync Queue Design

**Write during outage**:
1. Agent calls `memory_write` → Honcho unreachable.
2. Write accepted into local `memory_entries` with `sync_status = "pending"`.
3. `sync_queue` table records `(memory_id, project_id, content_hash, created_at, attempts, last_error)`.
4. Response returns `embedding_status: "pending_sync"`.

**Reconciliation** (background, on recovery):
1. `reconciler.ts` polls Honcho health every N seconds (configurable, default 10s).
2. On recovery: drain `sync_queue` ordered by `created_at ASC`.
3. For each entry: `POST /v3/workspaces/{ws}/conclusions` with content-hash in metadata.
4. If content-hash already exists (idempotent check via `conclusions/list` with metadata filter) → skip.
5. On success: update `sync_status = "synced"`, remove from queue.
6. On failure: increment `attempts`, record `last_error`, exponential backoff.

**Durable across restarts**: `sync_queue` is a SQLite table, survives process restart.

## R4: Tombstone Design

**Problem**: Honcho conclusions may or may not support hard-delete. Local delete must work regardless.

**Solution**: `tombstones` table.

```sql
CREATE TABLE tombstones (
  memory_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  deleted_by TEXT NOT NULL,
  honcho_purged INTEGER NOT NULL DEFAULT 0
);
```

All recall paths (both backends) JOIN against `tombstones` to filter deleted entries. If Honcho supports hard-delete (V1), also `DELETE` the conclusion and set `honcho_purged = 1`.

## R5: Local Lexical Backend

Refactor `retrieval/lexical.ts` into a `MemoryBackend` implementation. It:
- Reads/writes `memory_entries` directly (same as today).
- Uses FTS5/BM25 for recall.
- Returns `embedding_status: "lexical_only"`.
- Never touches Honcho.
- Still supports dedup, provenance, project scoping.

This is the "permanent fallback" — not transitional.

## R6: IPv6 Workaround

Observed: `curl.exe localhost:8083` hangs (IPv6 `::1` connects but Honcho inside container only listens on IPv4). Fix: Honcho client must use `127.0.0.1` explicitly, never `localhost`.

Config default: `memory.honcho_endpoint = "http://127.0.0.1:8083"`.
