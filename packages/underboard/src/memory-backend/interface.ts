/**
 * MemoryBackend interface + shared types (feature 008).
 *
 * The seam between MCP tool layer (src/tools/memory/) and storage/retrieval.
 * Tool functions call interface methods; implementations dispatch to Honcho
 * REST, local SQLite, or both. The agent-facing MCP contract (spec 005) is
 * stable and untouched — all output schemas preserve 005 field names
 * (`embedding_status`, not `backend_status`).
 *
 * Spec: specs/008-memory-backend-honcho/contracts/memory-backend.md
 */

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

// ── Shared Types ───────────────────────────────────────────────────────────

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

/** Pinned Honcho version (008/FR-011). */
export const HONCHO_PINNED_VERSION = "3.0.9";
