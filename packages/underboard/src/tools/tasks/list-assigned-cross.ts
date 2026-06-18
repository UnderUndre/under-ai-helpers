import Database from "better-sqlite3";
import { listAssignedTasksCrossProject, type TaskRow } from "#storage/task-store.js";

export interface ListAssignedCrossInput {
  status?: string | string[];
  include_archived?: boolean;
}

export function taskListAssignedCrossProject(
  db: Database.Database,
  input: ListAssignedCrossInput,
  context: { agent_name: string }
) {
  const tasks = listAssignedTasksCrossProject(db, context.agent_name, {
    status: input.status,
    include_archived: input.include_archived,
  });

  return {
    tasks: tasks.map((t: TaskRow) => ({
      id: t.id,
      project_id: t.project_id,
      title: t.title,
      description: t.description,
      status: t.status,
      assignee: t.assignee,
      dependency_ids: t.dependency_ids,
      notes: t.notes,
      archived: t.archived === 1,
      created_at: t.created_at,
      updated_at: t.updated_at,
    })),
  };
}

