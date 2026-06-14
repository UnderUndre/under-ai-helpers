# Backend Interface Contract: Memory Subsystem

**Feature**: 008-memory-backend-honcho | **Date**: 2026-06-13

## Overview

The `MemoryBackend` interface is the seam between the MCP tool layer (`src/tools/memory/`) and the storage/retrieval layer. Tool functions call interface methods; implementations dispatch to Honcho REST, local SQLite, or both. The agent-facing MCP contract (spec 005 `contracts/memory-tools.md`) is stable and untouched — all output schemas preserve the 005 field names (`embedding_status`, not `backend_status`).

## Interface

All methods are async to accommodate Honcho REST calls. Local implementations wrap synchronous SQLite calls in `Promise.resolve()` for interface conformance.

```typescript
export interface MemoryBackend {
  write(input: BackendWriteInput, ctx: ToolContext): Promise<BackendWriteOutput>;
  recall(input: BackendRecallInput, ctx: ToolContext): Promise<BackendRecallOutput>;
  recallCrossProject(input: BackendRecallInput): Promise<BackendCrossRecallOutput>;
  listRecent(input: BackendListRecentInput, ctx: ToolContext): Promise<BackendListRecentOutput>;
  get(id: string): Promise<BackendGetOutput | null>;
  delete(id: string, ctx: ToolContext): Promise<BackendDeleteOutput>;
  deleteCrossProject(id: string, projectId: string): Promise<BackendDeleteOutput>;
  health(): Promise<BackendHealth>;
}

export interface ToolContext {
  project_id: string;
  agent_name: string;
  cwd: string;
}
```

## Shared Types

```typescript
export interface BackendWriteInput {
  content: string;
  tags?: string[];
}

export interface BackendWriteOutput {
  id: string;
  created: boolean;
  provenance: Array<{ agent: string; ts: string }>;
  sync_status: "synced" | "pending" | "failed";
}

export interface BackendRecallInput {
  query: string;
  top_k?: number;
  threshold?: number;
}

export interface BackendRecallResult {
  id: string;
  content: string;
  tags: string[] | null;
  provenance: Array<{ agent: string; ts: string }>;
  score: number;
  similarity: number;
  created_at: string;
}

// 005-compatible: `embedding_status` field name and values preserved.
// "ready" = semantic backend served results; "lexical_only" = degraded to FTS5.
// "pending_sync" = write was spooled, not yet synced (applies to write responses, not recall).
export interface BackendRecallOutput {
  results: BackendRecallResult[];
  embedding_status: "ready" | "lexical_only";
}

export interface BackendCrossRecallOutput {
  results: Array<BackendRecallResult & {
    project_id: string;
    project_name: string;
  }>;
  embedding_status: "ready" | "lexical_only";
}

export interface BackendListRecentInput {
  limit?: number;
}

export interface BackendListRecentEntry {
  id: string;
  content: string;
  truncated: boolean;
  full_length: number;
  tags: string[] | null;
  provenance: Array<{ agent: string; ts: string }>;
  created_at: string;
}

export interface BackendListRecentOutput {
  entries: BackendListRecentEntry[];
}

export interface BackendGetOutput {
  id: string;
  content: string;
  tags: string[] | null;
  provenance: Array<{ agent: string; ts: string }>;
  created_at: string;
}

export interface BackendDeleteOutput {
  deleted: boolean;
  id: string;
}

export interface BackendHealth {
  backend: "honcho" | "local_lexical";
  honcho_reachable: boolean | null;
  honcho_version: string | null;
  honcho_pinned_version: string;
  sync_queue_depth: number;
  degraded: boolean;
}
```

## Recall Fusion Strategy

When the Honcho backend is active and reachable, recall follows this strategy:

1. **Primary**: Query Honcho `conclusions/query` (semantic search via pgvector internally). Honcho already fuses semantic + lexical signals server-side via its own TEI embed + rerank pipeline. Return Honcho results as-is — no client-side fusion needed.
2. **Fallback**: If Honcho unreachable or times out → fall through to `LocalLexicalBackend.recall()` (FTS5 BM25 only).
3. **Result enrichment**: Merge provenance/tags from local `memory_entries` by content-hash lookup (Honcho conclusion stores the content; local store stores the provenance metadata).

This eliminates the need for client-side weighted fusion (the deleted `hybrid-retrieval.ts` `0.4*lexical + 0.6*semantic` formula). Honcho's server-side search replaces that logic entirely. The `score` and `similarity` fields in recall results come from Honcho's response when available, or from normalized BM25 when in lexical-only fallback.

## Implementations

### `LocalLexicalBackend`

- **Storage**: `memory_entries` table + `memory_fts` FTS5 + `tombstones`.
- **Recall**: FTS5 BM25 only (`retrieval/lexical.ts`). Score = normalized BM25. `similarity = 0`. `embedding_status = "lexical_only"`.
- **Write**: Direct INSERT into `memory_entries` + FTS5 trigger. `sync_status = "synced"` (no remote to sync).
- **Delete**: DELETE from `memory_entries` (triggers FTS5 cleanup) + INSERT into `tombstones`.
- **Health**: `backend = "local_lexical"`, `honcho_reachable = null`, `degraded = false` (this IS the intended backend, not a degraded state).
- **Dedup**: Content-hash check via `UNIQUE (project_id, content_hash)`, provenance merge.
- **Performance**: Synchronous SQLite calls wrapped in Promise, no network.

### `HonchoBackend` (wraps `LocalLexicalBackend`)

- **Storage**: Writes to BOTH local SQLite (for lexical + durability) AND Honcho (for semantic).
- **Recall**: Honcho `conclusions/query` (semantic). If Honcho results available → return with `embedding_status = "ready"`. Enrich with local provenance. If Honcho unreachable → fall through to local FTS5, return with `embedding_status = "lexical_only"`.
- **Write**: Local write first (synchronous, guarantees durability), then async push to Honcho. If Honcho push fails → enqueue in `sync_queue`, set `sync_status = "pending"`.
- **Delete**: Local tombstone + Honcho hard-delete attempt (if `DELETE /conclusions/{id}` available).
- **Health**: Checks Honcho `/health` endpoint. Reports version match/mismatch vs pinned.
- **Degradation**: If Honcho unreachable on recall → falls through to `LocalLexicalBackend.recall()`, sets `embedding_status = "lexical_only"`.
- **Dedup**: Content-hash dedup checked locally first (fast), then Honcho metadata check on sync.

### `BackendFactory`

- Reads config (`memory_backend`, `honcho_endpoint`, `honcho_token_env`).
- **Version check**: On Honcho backend creation, fetches `GET /health` or parses OpenAPI `info.version`, compares against `honcho_pinned_version` config. Mismatch → warning log, health reports mismatch, does NOT crash.
- On startup: if config says `"honcho"`, creates `HonchoBackend` with health check.
- If Honcho unreachable at startup → logs warning, creates `HonchoBackend` in degraded mode (will auto-recover).
- If config says `"local_lexical"` → creates `LocalLexicalBackend`.
- Returns the selected backend to `mcp-server.ts` and `http-server.ts`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Honcho down during write | Local write succeeds, `sync_status = "pending"`, queued for reconciliation |
| Honcho down during recall | Returns local FTS5 results with `embedding_status = "lexical_only"` |
| Honcho auth invalid | Distinguishable from "down" — logged, health reports `honcho_reachable = false, degraded = true` |
| Honcho version mismatch | Warning in health + log. NOT a crash. |
| Honcho timeout | Configurable (default 5s). On timeout → treat as "down" for that call. |
| Sync queue full | No hard limit. Reconciliation runs until empty. |
