import Database from "better-sqlite3";

export interface SemanticResult {
  rowid: number;
  content: string;
  score: number;
}

export function semanticSearch(
  db: Database.Database,
  queryEmbedding: Float32Array,
  projectId: string,
  limit: number = 50,
  vecAvailable: boolean = false
): SemanticResult[] {
  if (!vecAvailable) return [];

  try {
    const blob = Buffer.from(new Uint8Array(queryEmbedding.buffer));
    const stmt = db.prepare(`
      SELECT e.rowid, e.content, v.distance
      FROM memory_vectors v
      JOIN memory_entries e ON e.rowid = v.rowid
      WHERE v.embedding MATCH ? AND e.project_id = ? AND e.embedding_status = 'ready'
      ORDER BY v.distance
      LIMIT ?
    `);
    const rows = stmt.all(blob, projectId, limit) as Array<{ rowid: number; content: string; distance: number }>;

    return rows.map((r) => ({
      rowid: r.rowid,
      content: r.content,
      score: Math.max(0, 1 - r.distance),
    }));
  } catch {
    return [];
  }
}

export function cosineSimilarityJS(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function semanticSearchJS(
  db: Database.Database,
  queryEmbedding: Float32Array,
  projectId: string,
  limit: number = 50
): SemanticResult[] {
  const stmt = db.prepare(`
    SELECT rowid, content, embedding
    FROM memory_entries
    WHERE project_id = ? AND embedding_status = 'ready'
  `);
  const rows = stmt.all(projectId) as Array<{ rowid: number; content: string; embedding: Buffer | null }>;

  const scored = rows
    .filter((r) => r.embedding && r.embedding.length > 0)
    .map((r) => {
      const entryEmbedding = new Float32Array(r.embedding!.buffer, r.embedding!.byteOffset, r.embedding!.byteLength / 4);
      return {
        rowid: r.rowid,
        content: r.content,
        score: cosineSimilarityJS(queryEmbedding, entryEmbedding),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
