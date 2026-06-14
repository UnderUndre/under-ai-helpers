/**
 * Reconciler (feature 008 T08).
 *
 * Background sync-queue drain: attempts to push pending local writes to Honcho.
 * Called periodically (setInterval or event-driven). Idempotent.
 */

import type Database from "better-sqlite3";
import { HonchoClient } from "./honcho-client.js";

export interface ReconcilerResult {
  processed: number;
  synced: number;
  failed: number;
}

/**
 * Drain the sync_queue: for each pending entry, attempt Honcho write.
 * Idempotent: re-running on the same state is a no-op.
 */
export async function drainSyncQueue(
  db: Database.Database,
  client: HonchoClient,
  limit: number = 100,
): Promise<ReconcilerResult> {
  const pending = db.prepare(`
    SELECT sq.id as queue_id, sq.memory_id, sq.project_id, sq.content_hash,
           me.content
    FROM sync_queue sq
    JOIN memory_entries me ON me.id = sq.memory_id
    WHERE sq.status = 'pending'
    ORDER BY sq.enqueued_at
    LIMIT ?
  `).all(limit) as Array<{
    queue_id: number;
    memory_id: string;
    project_id: string;
    content_hash: string;
    content: string;
  }>;

  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      const wsName = HonchoClient.workspaceNameForProject(entry.project_id);
      const ws = await client.ensureWorkspace(wsName);
      const peer = await client.ensurePeer(ws.id, "underboard-reconciler");
      await client.createConclusion(ws.id, peer.id, entry.content, {
        content_hash: entry.memory_id,
        project_id: entry.project_id,
        reconciled: true,
      });

      db.prepare("UPDATE sync_queue SET status = 'synced' WHERE id = ?")
        .run(entry.queue_id);
      synced++;
    } catch {
      // Per gemini-code-assist review: cap retries at 5 to prevent infinite
      // spam on permanent failures (e.g., invalid workspace, malformed content).
      db.prepare(`
        UPDATE sync_queue
        SET attempts = attempts + 1,
            last_attempt_at = datetime('now'),
            status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END
        WHERE id = ?
      `).run(entry.queue_id);
      failed++;
    }
  }

  return { processed: pending.length, synced, failed };
}
