import Database from "better-sqlite3";
import { getMemory, type MemoryRow } from "#storage/memory-store.ts";

export interface MemoryGetInput {
  id: string;
}

export interface MemoryGetOutput {
  id: string;
  content: string;
  tags: string[] | null;
  provenance: Array<{ agent: string; ts: string }>;
  created_at: string;
}

export function memoryGet(
  db: Database.Database,
  input: MemoryGetInput
): MemoryGetOutput {
  const row = getMemory(db, input.id);
  if (!row) {
    throw new Error("ENTRY_NOT_FOUND: memory entry not found");
  }

  const provenance = typeof row.provenance === "string" ? JSON.parse(row.provenance) : row.provenance;

  return {
    id: row.id,
    content: row.content,
    tags: row.tags,
    provenance,
    created_at: row.created_at,
  };
}
