import Database from "better-sqlite3";
import { hybridRetrieve } from "#retrieval/hybrid-retrieval.ts";
import { embed, getEmbeddingStatus } from "#embedding/embedding-service.ts";
import { getAllProjects } from "#storage/project-store.ts";

export interface CrossProjectRecallInput {
  query: string;
  top_k?: number;
  threshold?: number;
}

export async function memoryRecallCrossProject(
  db: Database.Database,
  input: CrossProjectRecallInput,
  vecAvailable: boolean = false
) {
  const topK = Math.min(input.top_k ?? 5, 50);
  const threshold = input.threshold ?? 0.3;

  let queryEmbedding: Float32Array | null = null;
  if (getEmbeddingStatus() === "ready") {
    queryEmbedding = await embed(input.query);
  }

  const projects = getAllProjects(db);
  const allResults: any[] = [];

  for (const project of projects) {
    const { results } = hybridRetrieve(db, input.query, project.id, queryEmbedding, {
      topK,
      threshold,
      vecAvailable,
    });

    for (const r of results) {
      allResults.push({
        ...r,
        project_id: project.id,
        project_name: project.display_name,
        provenance: typeof r.provenance === "string" ? JSON.parse(r.provenance) : r.provenance,
      });
    }
  }

  allResults.sort((a, b) => b.score - a.score);

  return {
    results: allResults.slice(0, topK),
    embedding_status: queryEmbedding ? "ready" as const : "lexical_only" as const,
  };
}
