/**
 * Dialog ingestor (feature 007 US4, FR-006).
 *
 * Normalized record → Honcho Session + Messages.
 * Idempotent: Honcho metadata check prevents duplicate ingestion.
 * Tombstone-aware: content_hash in dialog_tombstones blocks ingestion.
 */

import type Database from "better-sqlite3";
import { HonchoClient } from "../memory-backend/honcho-client.js";

export interface IngestResult {
  ingested: boolean;
  honchoSessionId: string | null;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Ingest a normalized record into Honcho Session + Messages.
 * One Session per CC session; one Message per CC message within.
 */
export async function ingestDialog(
  db: Database.Database,
  client: HonchoClient,
  params: {
    sessionUuid: string;
    contentHash: string;
    projectId: string;
    normalizedFile: string;
    messages: Array<{ role: string; content: string; timestamp?: string }>;
    theme: string;
    date: string;
  },
): Promise<IngestResult> {
  const { sessionUuid, contentHash, projectId, messages, theme, date } = params;

  // 1. Check tombstone — block if tombstoned
  const tombstone = db.prepare(
    "SELECT 1 FROM dialog_tombstones WHERE content_hash = ?",
  ).get(contentHash);
  if (tombstone) {
    return { ingested: false, honchoSessionId: null, skipped: true, skipReason: "tombstoned" };
  }

  // 2. Check outage spool for existing ingest (idempotent)
  const existing = db.prepare(
    "SELECT honcho_session_id FROM dialog_outage_spool WHERE content_hash = ? AND status = 'ingested'",
  ).get(contentHash) as { honcho_session_id?: string } | undefined;
  if (existing?.honcho_session_id) {
    return { ingested: false, honchoSessionId: existing.honcho_session_id, skipped: true, skipReason: "already-ingested" };
  }

  // 3. Create Honcho Session
  const wsName = HonchoClient.workspaceNameForProject(projectId);
  const ws = await client.ensureWorkspace(wsName);
  const peer = await client.ensurePeer(ws.id, "__dialog-capture__");
  const session = await client.createSession(ws.id, `${date} ${theme}`, {
    cc_session_uuid: sessionUuid,
    content_hash: contentHash,
    normalized_file: params.normalizedFile,
    captured_at: params.date,
  });

  // 4. Push each message as a Honcho Message
  for (const msg of messages) {
    await client.addSessionMessage(
      ws.id,
      session.id,
      peer.id,
      msg.content,
      {
        cc_role: msg.role,
        cc_timestamp: msg.timestamp,
      },
    );
  }

  return { ingested: true, honchoSessionId: session.id, skipped: false };
}

/**
 * Dialog recall — query Honcho sessions for past dialog content.
 * Uses Honcho's session search (V8 verification pending for exact endpoint).
 */
export async function recallDialogs(
  client: HonchoClient,
  projectId: string,
  query: string,
  limit: number = 5,
): Promise<Array<{
  session_uuid: string;
  theme: string;
  date: string;
  relevance_score: number;
  excerpt: string;
  normalized_file: string;
  honcho_session_id: string;
}>> {
  const wsName = HonchoClient.workspaceNameForProject(projectId);
  const ws = await client.ensureWorkspace(wsName);

  // V8 deferred: actual sessions:search endpoint needs empirical probe.
  // Fallback: use conclusions/query (which searches session-related conclusions
  // created by the __dialog-capture__ peer).
  try {
    const results = await client.queryConclusions(ws.id, query, limit);
    return results
      .filter((r) => r.metadata?.cc_session_uuid)
      .map((r) => ({
        session_uuid: r.metadata?.cc_session_uuid as string,
        theme: r.metadata?.theme as string || "(unknown)",
        date: r.metadata?.captured_at as string || r.created_at,
        relevance_score: r.score ?? 0.5,
        excerpt: r.content.slice(0, 200),
        normalized_file: r.metadata?.normalized_file as string || "",
        honcho_session_id: r.metadata?.session_id as string || r.id,
      }));
  } catch {
    return []; // Honcho unreachable — graceful degradation
  }
}

