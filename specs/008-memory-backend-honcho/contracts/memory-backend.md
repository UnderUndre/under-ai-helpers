# Backend Interface Contract: Memory Subsystem

**Feature**: 008-memory-backend-honcho | **Date**: 2026-06-13

## Overview

The `MemoryBackend` interface is the seam between the MCP tool layer (`src/tools/memory/`) and the storage/retrieval layer. Tool functions call interface methods; implementations dispatch to Honcho REST, local SQLite, or both. The agent-facing MCP contract (spec 005 `contracts/memory-tools.md`) is stable and untouched.

## Interface

```typescript
export interface MemoryBackend {
  write(input: BackendWriteInput, ctx: ToolContext): Promise<BackendWriteOutput>;
  recall(input: BackendRecallInput, ctx: ToolContext): Promise<BackendRecallOutput>;
  recallCrossProject(input: BackendRecallInput): Promise<BackendCrossRecallOutput>;
  listRecent(input: BackendListRecentInput, ctx: ToolContext): BackendListRecentOutput;
  get(id: string): BackendGetOutput | null;
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
  sync_status: "synced" | "pending";
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

export interface BackendRecallOutput {
  results: BackendRecallResult[];
  backend_status: "semantic" | "lexical_only" | "pending_sync";
}

export interface BackendCrossRecallOutput {
  results: Array<BackendRecallResult & {
    project_id: string;
    project_name: string;
  }>;
  backend_status: "semantic" | "lexical_only" | "pending_sync";
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

## Implementations

### `LocalLexicalBackend`

- **Storage**: `memory_entries` table + `memory_fts` FTS5 + `tombstones`.
- **Recall**: FTS5 BM25 only (`retrieval/lexical.ts`). Score = normalized BM25. `similarity = 0`.
- **Write**: Direct INSERT into `memory_entries` + FTS5 trigger. `sync_status = "synced"` (no remote to sync).
- **Delete**: DELETE from `memory_entries` (triggers FTS5 cleanup) + INSERT into `tombstones`.
- **Health**: `backend = "local_lexical"`, `honcho_reachable = null`, `degraded = false` (this IS the intended backend, not a degraded state).
- **Dedup**: Content-hash check via `UNIQUE (project_id, content_hash)`, provenance merge.
- **Performance**: Synchronous SQLite calls, no network.

### `HonchoBackend` (wraps `LocalLexicalBackend`)

- **Storage**: Writes to BOTH local SQLite (for lexical + durability) AND Honcho (for semantic).
- **Recall**: Honcho `conclusions/query` for semantic results, merged with local FTS5. Returns best of both signals.
- **Write**: Local write first (synchronous, guarantees durability), then async push to Honcho. If Honcho push fails → enqueue in `sync_queue`, set `sync_status = "pending"`.
- **Delete**: Local tombstone + Honcho hard-delete attempt (if `DELETE /conclusions/{id}` available).
- **Health**: Checks Honcho `/health` endpoint. Reports version match/mismatch vs pinned.
- **Degradation**: If Honcho unreachable on recall → falls through to `LocalLexicalBackend.recall()`, sets `backend_status = "lexical_only"`.
- **Dedup**: Content-hash dedup checked locally first (fast), then Honcho metadata check on sync.

### `BackendFactory`

- Reads config (`memory_backend`, `honcho_endpoint`, `honcho_token_env`).
- On startup: if config says `"honcho"`, creates `HonchoBackend` with health check.
- If Honcho unreachable at startup → logs warning, creates `HonchoBackend` in degraded mode (will auto-recover).
- If config says `"local_lexical"` → creates `LocalLexicalBackend`.
- Returns the selected backend to `mcp-server.ts` and `http-server.ts`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Honcho down during write | Local write succeeds, `sync_status = "pending"`, queued for reconciliation |
| Honcho down during recall | Returns local FTS5 results with `backend_status = "lexical_only"` |
| Honcho auth invalid | Distinguishable from "down" — logged, health reports `honcho_reachable = false, degraded = true` |
| Honcho version mismatch | Warning in health + log. NOT a crash. |
| Honcho timeout | Configurable (default 5s). On timeout → treat as "down" for that call. |
| Sync queue full | No hard limit. Reconciliation runs until empty. |
