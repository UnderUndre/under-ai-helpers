import Database from "better-sqlite3";
import { listRecentMemory, type MemoryRow } from "#storage/memory-store.js";

export interface ListRecentInput {
  limit?: number;
}

export interface ListRecentEntry {
  id: string;
  content: string;
  truncated: boolean;
  full_length: number;
  tags: string[] | null;
  provenance: Array<{ agent: string; ts: string }>;
  created_at: string;
}

export interface ListRecentOutput {
  entries: ListRecentEntry[];
}

export function memoryListRecent(
  db: Database.Database,
  input: ListRecentInput,
  context: { project_id: string }
): ListRecentOutput {
  const limit = Math.min(input.limit ?? 20, 100);
  const rows = listRecentMemory(db, context.project_id, limit);

  return {
    entries: rows.map((row: MemoryRow) => {
      const fullLength = row.content.length;
      const truncated = fullLength > 500;
      const content = truncated ? row.content.slice(0, 500) + "..." : row.content;
      const provenance = typeof row.provenance === "string" ? JSON.parse(row.provenance) : row.provenance;

      return {
        id: row.id,
        content,
        truncated,
        full_length: fullLength,
        tags: row.tags,
        provenance,
        created_at: row.created_at,
      };
    }),
  };
}
