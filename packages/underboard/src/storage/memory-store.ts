import Database from "better-sqlite3";
import { createHash } from "node:crypto";

export interface MemoryRow {
  id: string;
  project_id: string;
  content: string;
  tags: string[] | null;
  provenance: Array<{ agent: string; ts: string }>;
  embedding: Buffer | null;
  embedding_status: string;
  content_hash: string;
  created_at: string;
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseMemoryRow(row: Record<string, unknown>): MemoryRow {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags as string) : null,
    provenance: JSON.parse(row.provenance as string),
  } as MemoryRow;
}

function mergeProvenance(
  existing: Array<{ agent: string; ts: string }>,
  entry: { agent: string; ts: string }
): Array<{ agent: string; ts: string }> {
  const merged = [...existing, entry];
  if (merged.length <= 20) return merged;
  const first5 = merged.slice(0, 5);
  const last10 = merged.slice(-10);
  const droppedCount = merged.length - 15;
  const truncatedEntry = {
    agent: "__truncated",
    ts: String(droppedCount),
  };
  return [...first5, truncatedEntry, ...last10];
}

export function writeMemory(
  db: Database.Database,
  entry: {
    id: string;
    project_id: string;
    content: string;
    tags?: string[] | null;
    agent_name: string;
  }
): {
  id: string;
  created: boolean;
  provenance: Array<{ agent: string; ts: string }>;
} {
  const contentHash = computeContentHash(entry.content);
  const now = new Date().toISOString();
  const provenanceEntry = { agent: entry.agent_name, ts: now };
  const initialProvenance = [provenanceEntry];
  const tagsJson = entry.tags ? JSON.stringify(entry.tags) : null;

  try {
    db.prepare(
      `INSERT INTO memory_entries (id, project_id, content, tags, provenance, embedding, embedding_status, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'pending', ?, ?)`
    ).run(
      entry.id,
      entry.project_id,
      entry.content,
      tagsJson,
      JSON.stringify(initialProvenance),
      contentHash,
      now
    );

    return { id: entry.id, created: true, provenance: initialProvenance };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    if (!message.includes("UNIQUE constraint failed")) throw err;

    const existing = db
      .prepare(
        `SELECT provenance FROM memory_entries WHERE project_id = ? AND content_hash = ?`
      )
      .get(entry.project_id, contentHash) as
      | { provenance: string }
      | undefined;

    const existingProvenance: Array<{ agent: string; ts: string }> = existing
      ? JSON.parse(existing.provenance)
      : [];
    const mergedProvenance = mergeProvenance(existingProvenance, provenanceEntry);

    db.prepare(
      `UPDATE memory_entries SET provenance = ? WHERE project_id = ? AND content_hash = ?`
    ).run(
      JSON.stringify(mergedProvenance),
      entry.project_id,
      contentHash
    );

    const existingRow = db
      .prepare(`SELECT id FROM memory_entries WHERE project_id = ? AND content_hash = ?`)
      .get(entry.project_id, contentHash) as { id: string } | undefined;

    return {
      id: existingRow?.id ?? entry.id,
      created: false,
      provenance: mergedProvenance,
    };
  }
}

export function getMemory(
  db: Database.Database,
  id: string
): MemoryRow | undefined {
  const row = db
    .prepare(`SELECT * FROM memory_entries WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? parseMemoryRow(row) : undefined;
}

export function getMemoryByHash(
  db: Database.Database,
  projectId: string,
  contentHash: string
): MemoryRow | undefined {
  const row = db
    .prepare(`SELECT * FROM memory_entries WHERE project_id = ? AND content_hash = ?`)
    .get(projectId, contentHash) as Record<string, unknown> | undefined;
  return row ? parseMemoryRow(row) : undefined;
}

export function listRecentMemory(
  db: Database.Database,
  projectId: string,
  limit: number = 20
): MemoryRow[] {
  const clampedLimit = Math.max(1, Math.min(limit, 100));
  const rows = db
    .prepare(
      `SELECT * FROM memory_entries WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(projectId, clampedLimit) as Record<string, unknown>[];
  return rows.map(parseMemoryRow);
}

export function deleteMemory(
  db: Database.Database,
  id: string,
  projectId: string
): boolean {
  const result = db
    .prepare(`DELETE FROM memory_entries WHERE id = ? AND project_id = ?`)
    .run(id, projectId);
  return result.changes > 0;
}

export function deleteMemoryCrossProject(
  db: Database.Database,
  id: string
): boolean {
  const result = db.prepare(`DELETE FROM memory_entries WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function updateEmbedding(
  db: Database.Database,
  id: string,
  embedding: Buffer
): void {
  db.prepare(
    `UPDATE memory_entries SET embedding = ?, embedding_status = 'ready' WHERE id = ?`
  ).run(embedding, id);
}

export function getPendingEmbeddings(
  db: Database.Database,
  limit: number = 50
): MemoryRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM memory_entries WHERE embedding_status = 'pending' LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(parseMemoryRow);
}
