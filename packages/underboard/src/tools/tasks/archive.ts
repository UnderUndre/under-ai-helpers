import Database from "better-sqlite3";
import { updateTask, type TaskRow } from "#storage/task-store.ts";
import { insertEvent } from "#storage/event-store.ts";

export interface TaskArchiveInput {
  id: string;
}

export interface TaskArchiveOutput {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  assignee: string | null;
  dependency_ids: string[] | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

function toOutput(row: TaskRow): TaskArchiveOutput {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    assignee: row.assignee,
    dependency_ids: row.dependency_ids,
    notes: row.notes,
    archived: row.archived === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function taskArchive(
  db: Database.Database,
  input: TaskArchiveInput
): TaskArchiveOutput {
  const row = updateTask(db, input.id, { archived: 1 as any });

  if (!row) {
    throw new Error("TASK_NOT_FOUND: task not found");
  }

  insertEvent(db, "task_archived", {
    id: row.id,
    project_id: row.project_id,
  });

  return toOutput(row);
}
