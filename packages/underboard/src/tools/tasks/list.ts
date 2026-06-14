import Database from "better-sqlite3";
import { listTasks, type TaskRow } from "#storage/task-store.js";

export interface TaskListInput {
  status?: string | string[];
  assignee?: string;
  project_id?: string;
  search?: string;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface TaskListOutput {
  tasks: Array<{
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
  }>;
  total: number;
}

function toOutput(row: TaskRow) {
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

export function taskList(
  db: Database.Database,
  input: TaskListInput,
  context: { project_id: string }
): TaskListOutput {
  const { tasks, total } = listTasks(db, {
    project_id: input.project_id ?? context.project_id,
    status: input.status,
    assignee: input.assignee,
    search: input.search,
    archived: input.archived,
    limit: input.limit,
    offset: input.offset,
  });

  return {
    tasks: tasks.map(toOutput),
    total,
  };
}
