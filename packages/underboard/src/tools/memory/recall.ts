import Database from "better-sqlite3";
import { hybridRetrieve, type HybridResult } from "#retrieval/hybrid-retrieval.js";
import { embed, getEmbeddingStatus } from "#embedding/embedding-service.js";

export interface MemoryRecallInput {
  query: string;
  top_k?: number;
  threshold?: number;
}

export interface MemoryRecallResult {
  id: string;
  content: string;
  tags: string[] | null;
  provenance: Array<{ agent: string; ts: string }>;
  score: number;
  similarity: number;
  created_at: string;
}

export interface MemoryRecallOutput {
  results: MemoryRecallResult[];
  embedding_status: "ready" | "lexical_only";
}

export async function memoryRecall(
  db: Database.Database,
  input: MemoryRecallInput,
  context: { project_id: string },
  vecAvailable: boolean = false
): Promise<MemoryRecallOutput> {
  const topK = Math.min(input.top_k ?? 5, 50);
  const threshold = input.threshold ?? 0.3;

  let queryEmbedding: Float32Array | null = null;
  if (getEmbeddingStatus() === "ready") {
    queryEmbedding = await embed(input.query);
  }

  const { results, embedding_status } = hybridRetrieve(db, input.query, context.project_id, queryEmbedding, {
    topK,
    threshold,
    vecAvailable,
  });

  return {
    results: results.map((r: HybridResult) => ({
      id: r.id,
      content: r.content,
      tags: r.tags,
      provenance: typeof r.provenance === "string" ? JSON.parse(r.provenance) : r.provenance,
      score: r.score,
      similarity: r.similarity,
      created_at: r.created_at,
    })),
    embedding_status,
  };
}

