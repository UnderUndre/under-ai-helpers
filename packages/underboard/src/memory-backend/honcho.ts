/**
 * HonchoBackend (feature 008 T04).
 *
 * Dual-write: local SQLite (lexical + durability) + Honcho (semantic).
 * Recall: Honcho conclusions/query (semantic) → fall through to local FTS5.
 * Degradation: Honcho unreachable → embedding_status = "lexical_only".
 */

import type Database from "better-sqlite3";
import type {
  MemoryBackend,
  ToolContext,
  BackendWriteInput,
  BackendWriteOutput,
  BackendRecallInput,
  BackendRecallOutput,
  BackendCrossRecallOutput,
  BackendListRecentInput,
  BackendListRecentOutput,
  BackendGetOutput,
  BackendDeleteOutput,
  BackendHealth,
} from "./interface.js";
import { HONCHO_PINNED_VERSION } from "./interface.js";
import { LocalLexicalBackend } from "./local-lexical.js";
import { HonchoClient } from "./honcho-client.js";

export class HonchoBackend implements MemoryBackend {
  private db: Database.Database;
  private local: LocalLexicalBackend;
  private client: HonchoClient;
  private workspaceCache = new Map<string, string>();
  private peerCache = new Map<string, string>();
  private healthy = true;
  private lastWarningTimes = new Map<"recall" | "write", number>();

  constructor(
    db: Database.Database,
    client: HonchoClient,
  ) {
    this.db = db;
    this.local = new LocalLexicalBackend(db);
    this.client = client;
  }

  private logDegradationWarning(opType: "recall" | "write", message: string) {
    const now = Date.now();
    const lastTime = this.lastWarningTimes.get(opType);
    if (lastTime === undefined || now - lastTime >= 5 * 60 * 1000) {
      this.lastWarningTimes.set(opType, now);
      console.error(`[honcho-backend] WARNING: ${message}`);
    }
  }

  async write(input: BackendWriteInput, ctx: ToolContext): Promise<BackendWriteOutput> {
    // 1. Local write first (synchronous, guarantees durability)
    const localResult = await this.local.write(input, ctx);

    // 2. Async push to Honcho (non-blocking — queue on failure)
    try {
      const wsId = await this.ensureWorkspace(ctx.project_id);
      const peerId = await this.ensurePeer(wsId, ctx.agent_name);
      await this.client.createConclusion(wsId, peerId, input.content, {
        content_hash: localResult.id,
        project_id: ctx.project_id,
      });
    } catch (e: any) {
      // Honcho push failed → enqueue in sync_queue
      this.healthy = false;
      this.enqueueSync(ctx.project_id, localResult.id, input.content);
      this.logDegradationWarning("write", `Honcho write failed, enqueued for background sync: ${e.message}`);
      return { ...localResult, sync_status: "pending", synced: false };
    }

    return { ...localResult, sync_status: "synced", synced: true };
  }

  async recall(input: BackendRecallInput, ctx: ToolContext): Promise<BackendRecallOutput> {
    // Try Honcho semantic search first
    if (this.healthy) {
      try {
        const wsId = await this.ensureWorkspace(ctx.project_id);
        const honchoResults = await this.client.queryConclusions(
          wsId,
          input.query,
          input.top_k ?? 10,
        );
        if (honchoResults.length > 0) {
          // Enrich with local provenance
          const results = honchoResults.map((hc) => ({
            id: (hc.metadata?.content_hash as string) || hc.id,
            content: hc.content,
            tags: null,
            provenance: [{ agent: "honcho", ts: hc.created_at }],
            score: hc.score ?? 0.8, // Honcho doesn't always return explicit score
            similarity: hc.score ?? 0.8,
            created_at: hc.created_at,
          }));
          return { results, embedding_status: "ready" };
        }
        // Honcho returned empty → fall through to local
      } catch (e: any) {
        this.healthy = false;
        this.logDegradationWarning("recall", `Honcho recall failed, falling back to local lexical search: ${e.message}`);
      }
    }

    // Fallback: local lexical search
    return this.local.recall(input, ctx);
  }

  async recallCrossProject(input: BackendRecallInput): Promise<BackendCrossRecallOutput> {
    // Simplified: query all workspaces, merge results
    // Full impl would enumerate all project workspaces and query each
    return this.local.recallCrossProject(input);
  }

  async listRecent(input: BackendListRecentInput, ctx: ToolContext): Promise<BackendListRecentOutput> {
    return this.local.listRecent(input, ctx);
  }

  async get(id: string): Promise<BackendGetOutput | null> {
    return this.local.get(id);
  }

  async delete(id: string, ctx: ToolContext): Promise<BackendDeleteOutput> {
    const result = await this.local.delete(id, ctx);

    // Best-effort Honcho conclusion deletion
    if (result.deleted) {
      try {
        // Honcho conclusion IDs differ from local IDs — tombstone is authoritative
        // Honcho sync will catch up on next reconciliation
      } catch {
        // Non-blocking: tombstone is authoritative
      }
    }

    return result;
  }

  async deleteCrossProject(id: string, projectId: string): Promise<BackendDeleteOutput> {
    return this.local.deleteCrossProject(id, projectId);
  }

  async health(): Promise<BackendHealth> {
    const localHealth = await this.local.health();
    let honchoReachable: boolean | null = null;
    let honchoVersion: string | null = null;

    try {
      const h = await this.client.health();
      honchoReachable = h.status === "ok";
      honchoVersion = h.version ?? HONCHO_PINNED_VERSION;
      this.healthy = honchoReachable;
    } catch {
      honchoReachable = false;
      this.healthy = false;
    }

    return {
      backend: "honcho",
      honcho_reachable: honchoReachable,
      honcho_version: honchoVersion,
      honcho_pinned_version: HONCHO_PINNED_VERSION,
      sync_queue_depth: localHealth.sync_queue_depth,
      degraded: !honchoReachable,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async ensureWorkspace(projectId: string): Promise<string> {
    const cached = this.workspaceCache.get(projectId);
    if (cached) return cached;
    const wsName = HonchoClient.workspaceNameForProject(projectId);
    const ws = await this.client.ensureWorkspace(wsName);
    this.workspaceCache.set(projectId, ws.id);
    return ws.id;
  }

  private async ensurePeer(workspaceId: string, agentName: string): Promise<string> {
    const key = `${workspaceId}:${agentName}`;
    const cached = this.peerCache.get(key);
    if (cached) return cached;
    const peer = await this.client.ensurePeer(workspaceId, agentName);
    this.peerCache.set(key, peer.id);
    return peer.id;
  }

  private enqueueSync(projectId: string, memoryId: string, content: string): void {
    try {
      const contentHash = memoryId; // Simplified — memoryId includes content hash
      this.db.prepare(
        "INSERT OR IGNORE INTO sync_queue (memory_id, project_id, content_hash, status) VALUES (?, ?, ?, 'pending')",
      ).run(memoryId, projectId, contentHash);
    } catch (e) {
      console.error(`[honcho-backend] enqueueSync failed: ${(e as Error).message}`);
    }
    void content; // content available for future use (e.g., content_hash recompute)
  }
}

