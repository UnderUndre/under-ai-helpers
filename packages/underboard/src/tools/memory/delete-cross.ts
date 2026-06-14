import Database from "better-sqlite3";
import { deleteMemoryCrossProject } from "#storage/memory-store.ts";
import { emitEvent } from "#tools/emit-event.ts";

export interface CrossProjectDeleteInput {
  id: string;
  project_id: string;
}

export function memoryDeleteCrossProject(
  db: Database.Database,
  input: CrossProjectDeleteInput
): { deleted: boolean; id: string } {
  const deleted = deleteMemoryCrossProject(db, input.id);
  if (deleted) {
    emitEvent(db, "memory_deleted", { id: input.id, project_id: input.project_id });
  }
  return { deleted, id: input.id };
}
