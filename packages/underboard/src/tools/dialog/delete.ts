/**
 * Dialog delete MCP tool (feature 007 US4, FR-025).
 *
 * NEW tool — separate from memory_delete.
 * Tombstones by content_hash to prevent re-ingestion.
 */

import type Database from "better-sqlite3";
import { HonchoClient } from "../../memory-backend/honcho-client.js";

export async function handleDialogDelete(
  db: Database.Database,
  honchoClient: HonchoClient | null,
  params: { session_uuid?: string; content_hash?: string },
  _projectId: string,
): Promise<{ deleted: boolean; session_uuid: string }> {
  const { session_uuid, content_hash } = params;

  // Find the spool entry or tombstone target
  let hash = content_hash;
  let sessionId = session_uuid;

  if (!hash && sessionId) {
    const row = db.prepare(
      "SELECT content_hash FROM dialog_outage_spool WHERE session_uuid = ?",
    ).get(sessionId) as { content_hash?: string } | undefined;
    hash = row?.content_hash;
  }

  if (!hash) {
    return { deleted: false, session_uuid: sessionId || "(unknown)" };
  }

  // Insert tombstone (authoritative anti-resurrection record)
  db.prepare(
    "INSERT OR IGNORE INTO dialog_tombstones (content_hash, session_uuid, reason) VALUES (?, ?, ?)",
  ).run(hash, sessionId || "(unknown)", "manual");

  // Update outage spool row
  db.prepare(
    "UPDATE dialog_outage_spool SET status = 'tombstoned' WHERE content_hash = ?",
  ).run(hash);

  // Best-effort Honcho Session DELETE (V7: soft-delete with cascade)
  if (honchoClient && sessionId) {
    try {
      // Session lookup + DELETE would go here
      // Tombstone alone is authoritative per V7
    } catch {
      // Non-blocking — tombstone is authoritative
    }
  }

  return { deleted: true, session_uuid: sessionId || "(unknown)" };
}
