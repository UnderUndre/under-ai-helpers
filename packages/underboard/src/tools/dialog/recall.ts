/**
 * Dialog recall MCP tool (feature 007 US4, FR-023).
 *
 * NEW tool — separate from memory_recall (005/008 contract frozen).
 * Queries Honcho sessions for past dialog content.
 */

import type { ToolContext } from "../../memory-backend/interface.js";
import { recallDialogs } from "../../dialog-ingest/ingest.js";
import type { HonchoClient } from "../../memory-backend/honcho-client.js";

export interface DialogRecallParams {
  query: string;
  limit?: number;
}

export interface DialogRecallResult {
  session_uuid: string;
  theme: string;
  date: string;
  relevance_score: number;
  excerpt: string;
  normalized_file: string;
  honcho_session_id: string;
}

/**
 * dialog_recall handler. Project-scoped by default (FR-015).
 */
export async function handleDialogRecall(
  params: DialogRecallParams,
  ctx: ToolContext,
  honchoClient: HonchoClient | null,
): Promise<{ results: DialogRecallResult[] }> {
  if (!honchoClient) {
    return { results: [] }; // No Honcho → no dialog recall
  }

  const results = await recallDialogs(
    honchoClient,
    ctx.project_id,
    params.query,
    Math.min(params.limit ?? 5, 50),
  );

  return { results };
}

