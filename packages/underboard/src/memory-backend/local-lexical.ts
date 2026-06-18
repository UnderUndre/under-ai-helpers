/**
 * LocalLexicalBackend (feature 008 T02).
 *
 * Wraps existing memory-store.ts + lexical.ts into the MemoryBackend interface.
 * This IS the permanent fallback tier — offline operation, no semantic search.
 *
 * All methods async (interface conformance) but internally synchronous SQLite.
 */

import type Database from "better-sqlite3";
import {
  type MemoryBackend,
  type ToolContext,
  type BackendWriteInput,
  type BackendWriteOutput,
  type BackendRecallInput,
  type BackendRecallOutput,
  type BackendCrossRecallOutput,
  type BackendListRecentInput,
  type BackendListRecentOutput,
  type BackendGetOutput,
  type BackendDeleteOutput,
  type BackendHealth,
} from "./interface.js";
import {
  writeMemory,
  getMemory,
  deleteMemory,
  deleteMemoryCrossProject,
  computeContentHash,
} from "../storage/memory-store.js";
import { lexicalSearch } from "../retrieval/lexical.js";

export class LocalLexicalBackend implements MemoryBackend {
  constructor(private db: Database.Database) {}

  async write(input: BackendWriteInput, ctx: ToolContext): Promise<BackendWriteOutput> {
    const contentHash = computeContentHash(input.content);
    const id = `${ctx.project_id}:${contentHash.slice(0, 16)}`;
    const result = writeMemory(this.db, {
      id,
      project_id: ctx.project_id,
      content: input.content,
      tags: input.tags ?? null,
      agent_name: ctx.agent_name,
    });
    return {
      id: result.id,
      created: result.created,
      provenance: result.provenance,
      sync_status: "synced",
    };
  }

  async recall(input: BackendRecallInput, ctx: ToolContext): Promise<BackendRecallOutput> {
    const topK = input.top_k ?? 10;
    const lexicalResults = lexicalSearch(this.db, input.query, ctx.project_id, topK);
    const tombstones = this.getTombstones(ctx.project_id);
    const tombstonedIds = new Set(tombstones.map((t) => t.memory_id));

    const results = lexicalResults
      .filter((r) => !tombstonedIds.has(String(r.rowid)))
      .map((r) => {
        const mem = getMemory(this.db, String(r.rowid));
        if (!mem) return null;
        return {
          id: mem.id,
          content: mem.content,
          tags: mem.tags,
          provenance: mem.provenance,
          score: r.score,
          similarity: 0, // No semantic signal in lexical-only mode
          created_at: mem.created_at,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return { results, embedding_status: "lexical_only" };
  }

  async recallCrossProject(input: BackendRecallInput): Promise<BackendCrossRecallOutput> {
    // Query ALL projects via FTS5 (no project_id filter)
    const ftsQuery = input.query.split(/\s+/).filter(Boolean).map((t) => `"${t}"`).join(" OR ");
    if (!ftsQuery) return { results: [], embedding_status: "lexical_only" };

    const rows = this.db.prepare(`
      SELECT f.rowid, f.content, bm25(memory_fts) AS rank
      FROM memory_fts f
      JOIN memory_entries e ON e.rowid = f.rowid
      WHERE memory_fts MATCH ?
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, input.top_k ?? 10) as Array<{ rowid: number; content: string; rank: number }>;

    const maxRank = rows.length > 0 ? Math.max(...rows.map((r) => Math.abs(r.rank))) : 1;
    const results = rows.map((r) => {
      const mem = getMemory(this.db, String(r.rowid));
      if (!mem) return null;
      return {
        id: mem.id,
        content: mem.content,
        tags: mem.tags,
        provenance: mem.provenance,
        score: Math.min(1, Math.abs(r.rank) / maxRank),
        similarity: 0,
        created_at: mem.created_at,
        project_id: mem.project_id,
        project_name: mem.project_id, // Simplified — real impl joins projects table
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    return { results, embedding_status: "lexical_only" };
  }

  async listRecent(input: BackendListRecentInput, ctx: ToolContext): Promise<BackendListRecentOutput> {
    const limit = input.limit ?? 20;
    const rows = this.db.prepare(`
      SELECT * FROM memory_entries
      WHERE project_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(ctx.project_id, limit) as Array<Record<string, unknown>>;

    const entries = rows.map((r) => {
      const content = String(r.content || "");
      const truncated = content.length > 200;
      return {
        id: String(r.id),
        content: truncated ? content.slice(0, 200) : content,
        truncated,
        full_length: content.length,
        tags: r.tags ? JSON.parse(r.tags as string) : null,
        provenance: JSON.parse(r.provenance as string),
        created_at: String(r.created_at),
      };
    });

    return { entries };
  }

  async get(id: string): Promise<BackendGetOutput | null> {
    const mem = getMemory(this.db, id);
    if (!mem) return null;
    // Check tombstone
    const tombstone = this.db.prepare("SELECT 1 FROM tombstones WHERE memory_id = ?").get(id);
    if (tombstone) return null;
    return {
      id: mem.id,
      content: mem.content,
      tags: mem.tags,
      provenance: mem.provenance,
      created_at: mem.created_at,
    };
  }

  async delete(id: string, ctx: ToolContext): Promise<BackendDeleteOutput> {
    const wasDeleted = deleteMemory(this.db, id, ctx.project_id);
    if (wasDeleted) {
      this.db.prepare(
        "INSERT OR IGNORE INTO tombstones (memory_id, project_id, content_hash, reason) VALUES (?, ?, ?, ?)",
      ).run(id, ctx.project_id, id, "manual");
    }
    return { deleted: wasDeleted, id };
  }

  async deleteCrossProject(id: string, _projectId: string): Promise<BackendDeleteOutput> {
    const wasDeleted = deleteMemoryCrossProject(this.db, id);
    return { deleted: wasDeleted, id };
  }

  async health(): Promise<BackendHealth> {
    const queueDepth = (this.db.prepare("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'").get() as { c: number }).c;
    return {
      backend: "local_lexical",
      honcho_reachable: null,
      honcho_version: null,
      honcho_pinned_version: "3.0.9",
      sync_queue_depth: queueDepth,
      degraded: false, // This IS the intended backend, not degraded
    };
  }

  private getTombstones(projectId: string): Array<{ memory_id: string }> {
    return this.db.prepare(
      "SELECT memory_id FROM tombstones WHERE project_id = ?",
    ).all(projectId) as Array<{ memory_id: string }>;
  }
}

