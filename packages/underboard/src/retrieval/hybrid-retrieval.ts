import Database from "better-sqlite3";
import { lexicalSearch } from "./lexical.js";
import { semanticSearch, semanticSearchJS } from "./semantic.js";

export interface HybridResult {
  id: string;
  content: string;
  tags: string[] | null;
  provenance: string;
  score: number;
  similarity: number;
  created_at: string;
}

export function hybridRetrieve(
  db: Database.Database,
  query: string,
  projectId: string,
  queryEmbedding: Float32Array | null,
  options: {
    topK?: number;
    threshold?: number;
    lexicalWeight?: number;
    semanticWeight?: number;
    vecAvailable?: boolean;
  } = {}
): { results: HybridResult[]; embedding_status: "ready" | "lexical_only" } {
  const topK = options.topK ?? 5;
  const threshold = options.threshold ?? 0.3;
  const lexicalWeight = options.lexicalWeight ?? 0.4;
  const semanticWeight = options.semanticWeight ?? 0.6;
  const vecAvailable = options.vecAvailable ?? false;

  const lexicalResults = lexicalSearch(db, query, projectId, topK * 3);

  let semanticResults: Array<{ rowid: number; content: string; score: number }> = [];
  let embeddingStatus: "ready" | "lexical_only" = "lexical_only";

  if (queryEmbedding) {
    if (vecAvailable) {
      semanticResults = semanticSearch(db, queryEmbedding, projectId, topK * 3, true);
    } else {
      semanticResults = semanticSearchJS(db, queryEmbedding, projectId, topK * 3);
    }
    if (semanticResults.length > 0) {
      embeddingStatus = "ready";
    }
  }

  const rowScores = new Map<number, { lexical: number; semantic: number }>();

  for (const r of lexicalResults) {
    const existing = rowScores.get(r.rowid);
    rowScores.set(r.rowid, { lexical: r.score, semantic: existing?.semantic ?? 0 });
  }

  for (const r of semanticResults) {
    const existing = rowScores.get(r.rowid);
    rowScores.set(r.rowid, { lexical: existing?.lexical ?? 0, semantic: r.score });
  }

  const fused = Array.from(rowScores.entries())
    .map(([rowid, scores]) => ({
      rowid,
      combinedScore: lexicalWeight * scores.lexical + semanticWeight * scores.semantic,
      similarity: scores.semantic,
    }))
    .filter((r) => r.combinedScore >= threshold)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK);

  if (fused.length === 0) {
    return { results: [], embedding_status: embeddingStatus };
  }

  const rowids = fused.map((r) => r.rowid);
  const placeholders = rowids.map(() => "?").join(",");
  const entriesStmt = db.prepare(`
    SELECT id, rowid, content, tags, provenance, created_at
    FROM memory_entries
    WHERE rowid IN (${placeholders}) AND project_id = ?
  `);
  const entries = entriesStmt.all(...rowids, projectId) as Array<{
    id: string;
    rowid: number;
    content: string;
    tags: string | null;
    provenance: string;
    created_at: string;
  }>;

  const entryMap = new Map(entries.map((e) => [e.rowid, e]));

  const results = fused
    .map((f) => {
      const entry = entryMap.get(f.rowid);
      if (!entry) return null;
      return {
        id: entry.id,
        content: entry.content,
        tags: entry.tags ? JSON.parse(entry.tags) : null,
        provenance: entry.provenance,
        score: f.combinedScore,
        similarity: f.similarity,
        created_at: entry.created_at,
      };
    })
    .filter(Boolean) as HybridResult[];

  return { results, embedding_status: embeddingStatus };
}
