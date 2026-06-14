import Database from "better-sqlite3";
import { updateTask, type TaskRow } from "#storage/task-store.ts";
import { emitEvent } from "#tools/emit-event.ts";

const VALID_STATUSES = ["backlog", "in_progress", "blocked", "review", "done"];

export interface TaskUpdateInput {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  assignee?: string;
  notes?: string;
  if_match?: { updated_at: string };
}

export interface TaskOutput {
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

function toOutput(row: TaskRow): TaskOutput {
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

export function taskUpdate(
  db: Database.Database,
  input: TaskUpdateInput
): TaskOutput {
  if (input.status && !VALID_STATUSES.includes(input.status)) {
    throw new Error(`INVALID_STATUS: '${input.status}' is not a valid status`);
  }

  const updates: Record<string, any> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.status !== undefined) updates.status = input.status;
  if (input.assignee !== undefined) updates.assignee = input.assignee;
  if (input.notes !== undefined) updates.notes = input.notes;

  const row = updateTask(db, input.id, { ...updates, if_match: input.if_match?.updated_at });

  if (!row) {
    const existing = db.prepare("SELECT updated_at FROM tasks WHERE id = ?").get(input.id) as { updated_at: string } | undefined;
    if (!existing) {
      throw new Error("TASK_NOT_FOUND: task not found");
    }
    throw new Error(`CONCURRENCY_CONFLICT: task was modified at ${existing.updated_at}`);
  }

  emitEvent(db, "task_updated", {
    id: row.id,
    changes: updates,
    status: row.status,
  });

  return toOutput(row);
}
