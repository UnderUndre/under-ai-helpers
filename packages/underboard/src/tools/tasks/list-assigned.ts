import Database from "better-sqlite3";
import { listAssignedTasks, type TaskRow } from "#storage/task-store.js";

export interface ListAssignedInput {
  status?: string | string[];
  include_archived?: boolean;
}

export interface TaskAssignedOutput {
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

export function taskListAssigned(
  db: Database.Database,
  input: ListAssignedInput,
  context: { project_id: string; agent_name: string }
): TaskAssignedOutput {
  const tasks = listAssignedTasks(db, context.agent_name, context.project_id, {
    status: input.status,
    include_archived: input.include_archived,
  });

  return { tasks: tasks.map(toOutput) };
}
