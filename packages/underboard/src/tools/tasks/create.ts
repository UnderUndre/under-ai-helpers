import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { createTask, type TaskRow } from "#storage/task-store.ts";
import { insertEvent } from "#storage/event-store.ts";

const VALID_STATUSES = ["backlog", "in_progress", "blocked", "review", "done"] as const;
const MAX_TITLE_LENGTH = 1000;

export interface TaskCreateInput {
  title: string;
  description?: string;
  status?: string;
  assignee?: string;
  dependencies?: string[];
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
  warnings?: string[];
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

export function taskCreate(
  db: Database.Database,
  input: TaskCreateInput,
  context: { project_id: string }
): TaskOutput {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("VALIDATION_ERROR: title is required");
  }
  if (input.title.length > MAX_TITLE_LENGTH) {
    throw new Error("VALIDATION_ERROR: title exceeds 1000 characters");
  }

  const status = input.status ?? "backlog";
  if (!VALID_STATUSES.includes(status as any)) {
    throw new Error(`INVALID_STATUS: '${status}' is not a valid status`);
  }

  const warnings: string[] = [];
  if (input.dependencies) {
    for (const depId of input.dependencies) {
      const check = db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(depId);
      if (!check) {
        warnings.push(`Dependency '${depId}' not found`);
      }
    }
  }

  const row = createTask(db, {
    id: randomUUID(),
    project_id: context.project_id,
    title: input.title.trim(),
    description: input.description ?? null,
    status,
    assignee: input.assignee ?? null,
    dependency_ids: input.dependencies ?? null,
    notes: null,
  });

  insertEvent(db, "task_created", {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    status: row.status,
    assignee: row.assignee,
  });

  const output = toOutput(row);
  if (warnings.length > 0) output.warnings = warnings;
  return output;
}
